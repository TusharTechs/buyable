import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "node:path";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { StaticSite } from "./static-site";
import { ShadowSite } from "./shadow-site";
import { Pipeline } from "./pipeline";
import { SpendGuard } from "./budget";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

export class BuyableStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* ---------------------------------------------------------------------
     * Fixture store.
     *
     * This has to be on the public internet rather than localhost, because the
     * AgentCore browser runs in an AWS-managed sandbox and reaches sites the way
     * any other visitor does. That constraint is also why the demo is honest:
     * nothing is stubbed between the agent and the page.
     * ------------------------------------------------------------------- */
    const demoStore = new StaticSite(this, "DemoStore", {
      sourcePath: path.join(repoRoot, "apps", "demo-store", "public"),
      comment: "Buyable fixture store",
    });

    /* ---------------------------------------------------------------------
     * The Buyable web app.
     *
     * Static, server-rendered HTML rather than a client-side app. The hackathon
     * ship gate requires the submission to be reachable by an automated scoring
     * system as well as by human judges, and a page that renders nothing without
     * JavaScript is a page that might be scored as empty. A tool that measures
     * whether pages are readable to assistive technology should also not ship one
     * that needs a framework to say anything at all.
     * ------------------------------------------------------------------- */
    const web = new StaticSite(this, "Web", {
      sourcePath: path.join(repoRoot, "apps", "web", "public"),
      comment: "Buyable web app",
      // Report links are /r/<runId>, served by the viewer at /r/index.html, which
      // reads the access key out of the fragment.
      singlePagePrefixes: ["/r"],
      // This bucket receives published reports at runtime under reports/. Pruning on
      // deploy would delete every one of them and break every report link that had
      // ever been shared, so the checked-in files are added without removing
      // anything else.
      prune: false,
    });

    /* ---------------------------------------------------------------------
     * Shadow builds.
     *
     * A patched copy of a site, published so the same journey can be re-run
     * against it. Proving a fix means moving the completion number, not asserting
     * that the diff looks correct.
     * ------------------------------------------------------------------- */
    const shadow = new ShadowSite(this, "Shadow");

    /* ---------------------------------------------------------------------
     * Evidence.
     *
     * Object Lock in governance mode, with versioning, so a report cannot be
     * quietly rewritten after the fact. Under the European Accessibility Act the
     * useful artifact is not a score, it is a dated record of what was tested and
     * what happened, which is worth very little if it is mutable.
     * ------------------------------------------------------------------- */
    const evidence = new s3.Bucket(this, "Evidence", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.governance(cdk.Duration.days(365)),
      lifecycleRules: [
        {
          // Screenshots are bulky and stop being interesting quickly. The JSON record stays.
          id: "expire-raw-screenshots",
          prefix: "raw/",
          expiration: cdk.Duration.days(30),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    /* ---------------------------------------------------------------------
     * Run state.
     *
     * Single table. `pk` is the report id, `sk` orders the records within a report,
     * so the live status stream is one query rather than a scan.
     * ------------------------------------------------------------------- */
    const table = new dynamodb.Table(this, "Runs", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /* ---------------------------------------------------------------------
     * The reasoning provider credential.
     *
     * An empty secret is created here and the value is written out of band. The key
     * never appears in the template, in an environment variable, or in this
     * repository, and the functions read it at runtime with a scoped grant.
     * ------------------------------------------------------------------- */
    const providerSecret = new secretsmanager.Secret(this, "ProviderKey", {
      description: "Buyable reasoning provider API key",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const pipeline = new Pipeline(this, "Pipeline", {
      table,
      evidenceBucket: evidence,
      webBucket: web.bucket,
      shadowBucket: shadow.bucket,
      shadowBaseUrl: shadow.baseUrl,
      webBaseUrl: web.url,
      providerSecret,
    });

    new SpendGuard(this, "SpendGuard", {
      limitUsd: Number(this.node.tryGetContext("monthlyBudgetUsd") ?? 50),
      alertEmail: this.node.tryGetContext("alertEmail"),
    });

    // The API is constructed after the web bucket, so its address is published in a
    // second, tiny deployment rather than folded into the first.
    new s3deploy.BucketDeployment(this, "WebConfig", {
      destinationBucket: web.bucket,
      distribution: web.distribution,
      distributionPaths: ["/config.js"],
      // Never prune here: this deployment knows about one file and would otherwise
      // delete the entire site, including every report written at runtime.
      prune: false,
      sources: [
        s3deploy.Source.data(
          "config.js",
          [
            "/* Generated at deploy time. Do not edit: see packages/infra/lib/buyable-stack.ts. */",
            `window.BUYABLE_CONFIG = { apiUrl: ${JSON.stringify(pipeline.apiUrl)} };`,
            "",
          ].join("\n"),
        ),
      ],
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: pipeline.apiUrl,
      description: "Public API: POST /runs, GET /runs/{runId}",
    });
    new cdk.CfnOutput(this, "StateMachineArn", { value: pipeline.stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, "ProviderSecretArn", { value: providerSecret.secretArn });

    new cdk.CfnOutput(this, "WebUrl", {
      value: web.url,
      description: "Public URL of the Buyable web app, which is the ship gate target",
    });
    new cdk.CfnOutput(this, "WebBucketName", { value: web.bucket.bucketName });
    new cdk.CfnOutput(this, "DemoStoreUrl", {
      value: demoStore.url,
      description: "Public URL of the fixture store under test",
    });
    new cdk.CfnOutput(this, "ShadowBaseUrl", {
      value: shadow.baseUrl,
      description: "Base URL that patched builds are published under",
    });
    new cdk.CfnOutput(this, "ShadowBucketName", { value: shadow.bucket.bucketName });
    new cdk.CfnOutput(this, "EvidenceBucketName", { value: evidence.bucketName });
    new cdk.CfnOutput(this, "RunsTableName", { value: table.tableName });
  }
}
