import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "node:path";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { StaticSite } from "./static-site";
import { ShadowSite } from "./shadow-site";

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
