import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

export interface StaticSiteProps {
  /** Local directory to publish. */
  sourcePath: string;
  /** Served at the distribution root when a directory is requested. */
  indexDocument?: string;
  comment: string;
  /**
   * Files generated at deploy time, keyed by object name.
   *
   * Used for configuration that is only known once the stack exists, such as the API
   * endpoint. Writing it here rather than committing it means the published page and
   * the deployed API can never drift apart, which is the sort of mismatch that gets
   * discovered by a judge rather than by us.
   */
  generatedFiles?: Record<string, string>;
  /**
   * Whether to delete objects in the bucket that are not in the source.
   *
   * Defaults to true, which is right for a site whose content is entirely checked in.
   * It is emphatically wrong for a bucket that also receives objects at runtime: the
   * Buyable web bucket holds every published report, and pruning it on deploy would
   * quietly break every report link anyone had ever been given.
   */
  prune?: boolean;
  /**
   * Path prefixes served by a single page under that prefix.
   *
   * `/r` maps every `/r/<anything>` to `/r/index.html`, so a report link can be
   * `/r/<runId>` rather than `/r/index.html?id=<runId>`. That matters more than
   * tidiness: a report link is a thing people forward, and one that looks like a
   * debug URL invites the recipient to start editing it.
   *
   * Without this the request would miss, fall through the 404 handler, and serve the
   * landing page with a 200, which looks to the reader like the report vanished.
   */
  singlePagePrefixes?: string[];
}

/**
 * A private bucket fronted by CloudFront with origin access control.
 *
 * Both the Buyable front end and the fixture store use this. Keeping the bucket
 * private and letting only CloudFront read it matters more than usual here: the
 * ship gate requires the site to stay publicly reachable for weeks after the
 * submission deadline, and a bucket policy that drifts is the cheapest way to fail it.
 */
export class StaticSite extends Construct {
  readonly distribution: cloudfront.Distribution;
  readonly bucket: s3.Bucket;
  readonly url: string;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // A viewer request function rather than a Lambda at the edge: it runs in under a
    // millisecond, costs almost nothing, and rewriting a path is the whole job.
    const prefixes = props.singlePagePrefixes ?? [];
    const rewrite = prefixes.length
      ? new cloudfront.Function(this, "Rewrite", {
          comment: `Serve ${prefixes.join(", ")} from their own index`,
          code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var prefixes = ${JSON.stringify(prefixes)};
  for (var i = 0; i < prefixes.length; i++) {
    var prefix = prefixes[i];
    if (request.uri === prefix || request.uri.indexOf(prefix + '/') === 0) {
      request.uri = prefix + '/index.html';
      return request;
    }
  }
  return request;
}
`),
        })
      : undefined;

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: props.comment,
      defaultRootObject: props.indexDocument ?? "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: rewrite
          ? [{ function: rewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }]
          : undefined,
      },
      // A single-page miss should still render something, not an XML error document.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    const generated = Object.entries(props.generatedFiles ?? {}).map(([key, body]) =>
      s3deploy.Source.data(key, body),
    );

    new s3deploy.BucketDeployment(this, "Deploy", {
      sources: [s3deploy.Source.asset(props.sourcePath), ...generated],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
      prune: props.prune ?? true,
      /*
       * Five minutes, then revalidate.
       *
       * Invalidating the distribution clears the edge and does nothing about the copy
       * already in somebody's browser, so without this a returning visitor can be
       * running a mix of old and new files for as long as their cache holds. That is
       * how a deployment ends up half applied for one person and fine for everybody
       * else, which is close to undebuggable from a bug report.
       *
       * These files are small and change rarely. The revalidation is a 304.
       */
      cacheControl: [s3deploy.CacheControl.fromString("max-age=300, must-revalidate")],
    });

    this.url = `https://${this.distribution.distributionDomainName}`;
  }
}
