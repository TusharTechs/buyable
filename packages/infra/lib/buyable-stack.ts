import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "node:path";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { StaticSite } from "./static-site";
import { ShadowSite } from "./shadow-site";
import { Pipeline } from "./pipeline";
import { Identity } from "./identity";
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
      singlePagePrefixes: ["/r", "/account"],
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
      objectLockDefaultRetention: s3.ObjectLockRetention.governance(
        cdk.Duration.days(365),
      ),
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

    /*
     * Two questions an account makes it possible to ask, and one index each.
     *
     * "What have I run?" is a list in reverse date order, so the owner is the
     * partition and the timestamp is the sort key.
     *
     * "How has this journey behaved over time?" is the valuable one, and it needs the
     * journey to be the partition. Scanning the owner's runs and filtering would work
     * today and would get slower every week, which is a poor property for the feature
     * whose entire point is that it keeps looking backwards.
     *
     * Both project only what a list needs. A run record carries the whole journey and
     * a report url, and paying to copy all of that into two indexes to render a table
     * of dates and percentages would be waste.
     */
    /*
     * DynamoDB will only create one secondary index per stack update on an existing
     * table. A fresh table takes both at once, so this is invisible on a first
     * deployment and stops the second one dead with "Cannot perform more than one GSI
     * creation or deletion in a single update".
     *
     * `buyableIndex` in the CDK context names the single index to create on this
     * deployment. Leave it unset to declare both, which is correct for a new stack and
     * for every deployment after the two exist:
     *
     *   npx cdk deploy -c buyableIndex=ByOwner
     *   npx cdk deploy -c buyableIndex=ByJourney
     *   npx cdk deploy
     */
    const onlyIndex = this.node.tryGetContext("buyableIndex") as
      string | undefined;
    const wants = (name: string) => !onlyIndex || onlyIndex === name;

    if (wants("ByOwner")) {
      table.addGlobalSecondaryIndex({
        indexName: "ByOwner",
        partitionKey: { name: "ownerKey", type: dynamodb.AttributeType.STRING },
        sortKey: { name: "startedAt", type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.INCLUDE,
        nonKeyAttributes: [
          "runId",
          "status",
          "journeyLabel",
          "journeyGoal",
          "journeyKey",
          "completionRate",
          "siteIsTheVariable",
          "personaSummary",
          "startUrl",
        ],
      });
    }

    if (wants("ByJourney")) {
      table.addGlobalSecondaryIndex({
        indexName: "ByJourney",
        partitionKey: {
          name: "journeyKey",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: { name: "startedAt", type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.INCLUDE,
        nonKeyAttributes: [
          "runId",
          "status",
          "journeyLabel",
          "journeyGoal",
          "completionRate",
          "siteIsTheVariable",
          "personaSummary",
          "startUrl",
          "ownerKey",
        ],
      });
    }

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

    /* ---------------------------------------------------------------------
     * Accounts.
     *
     * Everything works signed out. An account adds ownership, a list of your own
     * runs, and the history of a journey over time; it is not a gate in front of the
     * product. The public scanner answering "you chose the fixture" is worth more
     * than the sign-ups a wall would produce.
     * ------------------------------------------------------------------- */
    const identity = new Identity(this, "Identity", {
      webBaseUrl: web.url,
      domainPrefix: `buyable-${cdk.Stack.of(this).account.slice(-6)}`,
    });

    const pipeline = new Pipeline(this, "Pipeline", {
      identity,
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
      /*
       * Never cached, because this file is the wiring.
       *
       * Deploying sign in, then opening the site in a browser that had been there
       * before, produced a page saying sign in was not configured. The edge had been
       * invalidated and curl saw the new file; the browser was holding the old one,
       * in which the auth block simply did not exist. Every returning visitor would
       * have got that, silently, until their cache happened to turn over.
       *
       * A config file the application's behaviour depends on cannot be allowed to go
       * stale independently of the application. It is a few hundred bytes and a
       * revalidation is a 304.
       */
      cacheControl: [s3deploy.CacheControl.fromString("no-cache, must-revalidate")],
      sources: [
        s3deploy.Source.data(
          "config.js",
          [
            "/* Generated at deploy time. Do not edit: see packages/infra/lib/buyable-stack.ts. */",
            `window.BUYABLE_CONFIG = ${JSON.stringify(
              {
                apiUrl: pipeline.apiUrl,
                // Public by design. A client id is an identifier, not a credential,
                // which is why this client has no secret at all.
                auth: {
                  domain: identity.signInUrl,
                  clientId: identity.client.userPoolClientId,
                  redirectUri: `${web.url}/account/`,
                  signOutUri: `${web.url}/`,
                },
              },
              null,
              2,
            )};`,
            "",
          ].join("\n"),
        ),
      ],
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: pipeline.apiUrl,
      description: "Public API: POST /runs, GET /runs/{runId}",
    });
    new cdk.CfnOutput(this, "StateMachineArn", {
      value: pipeline.stateMachine.stateMachineArn,
    });
    new cdk.CfnOutput(this, "ProviderSecretArn", {
      value: providerSecret.secretArn,
    });

    new cdk.CfnOutput(this, "WebUrl", {
      value: web.url,
      description:
        "Public URL of the Buyable web app, which is the ship gate target",
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
    new cdk.CfnOutput(this, "ShadowBucketName", {
      value: shadow.bucket.bucketName,
    });
    new cdk.CfnOutput(this, "EvidenceBucketName", {
      value: evidence.bucketName,
    });
    new cdk.CfnOutput(this, "RunsTableName", { value: table.tableName });
    new cdk.CfnOutput(this, "SignInUrl", {
      value: identity.signInUrl,
      description: "Cognito hosted sign in",
    });
    new cdk.CfnOutput(this, "UserPoolId", {
      value: identity.userPool.userPoolId,
    });
  }
}
