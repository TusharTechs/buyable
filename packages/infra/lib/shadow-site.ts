import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

/**
 * Where patched builds go so they can be tested.
 *
 * Verifying a fix means running the same journey against a build that contains the
 * patch, which means that build has to be on the public internet: the AgentCore
 * browser reaches sites the way any other visitor does, so there is no way to hand
 * it a local file.
 *
 * This is deliberately a separate bucket from the fixture store. The store is
 * deployed by CDK with pruning on, which would delete any shadow build sitting
 * underneath it on the next deploy. Shadow content is also written at runtime rather
 * than at deploy time, so mixing the two would put CDK and the application in a
 * fight over the same keys.
 */
export class ShadowSite extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly baseUrl: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          // A shadow build exists to answer one question and is worthless afterwards.
          id: "expire-shadow-builds",
          expiration: cdk.Duration.days(7),
        },
      ],
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Buyable patched builds under verification",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // A patched build must never be served from cache. The whole point is to see
        // the change, and a stale object would silently produce a false verdict,
        // which is the worst failure this system could have.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.baseUrl = `https://${this.distribution.distributionDomainName}`;
  }
}
