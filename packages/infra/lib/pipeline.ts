import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "node:path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as logs from "aws-cdk-lib/aws-logs";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const fn = (name: string) =>
  path.join(repoRoot, "packages", "functions", "src", `${name}.ts`);

export interface PipelineProps {
  table: dynamodb.Table;
  evidenceBucket: s3.Bucket;
  webBucket: s3.Bucket;
  shadowBucket: s3.Bucket;
  shadowBaseUrl: string;
  webBaseUrl: string;
  /** Holds the reasoning provider API key. Never an environment variable. */
  providerSecret: secretsmanager.Secret;
}

/**
 * The run pipeline: an HTTP API in front of a Step Functions state machine.
 *
 * Step Functions rather than one long Lambda for three reasons that are not
 * decoration. Personas are genuinely independent and fan out in parallel, which a
 * Map state expresses directly. A three attempt checkout runs close enough to the
 * Lambda ceiling that retries and timeouts belong to the orchestrator rather than to
 * a try/catch inside a function that may be about to be killed. And the remediation
 * branch is a real conditional: propose, publish, re-run, compare, which is a graph
 * rather than a sequence.
 */
export class Pipeline extends Construct {
  readonly apiUrl: string;
  readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    const commonEnv: Record<string, string> = {
      RUNS_TABLE: props.table.tableName,
      EVIDENCE_BUCKET: props.evidenceBucket.bucketName,
      WEB_BUCKET: props.webBucket.bucketName,
      SHADOW_BUCKET: props.shadowBucket.bucketName,
      SHADOW_BASE_URL: props.shadowBaseUrl,
      WEB_BASE_URL: props.webBaseUrl,
      PROVIDER_SECRET_ARN: props.providerSecret.secretArn,
      // Only a provider that has passed tools/validate-provider.mjs belongs here.
      BUYABLE_PROVIDER: process.env.BUYABLE_PROVIDER ?? "gemini",
      NODE_OPTIONS: "--enable-source-maps",
    };

    const makeFunction = (
      name: string,
      entry: string,
      opts: { timeout?: cdk.Duration; memory?: number } = {},
    ) =>
      new NodejsFunction(this, name, {
        entry,
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: opts.timeout ?? cdk.Duration.seconds(30),
        memorySize: opts.memory ?? 512,
        environment: commonEnv,
        logRetention: logs.RetentionDays.TWO_WEEKS,
        bundling: {
          format: undefined,
          minify: false,
          sourceMap: true,
          // The AWS SDK ships in the Node 22 runtime, so bundling it again would only
          // make cold starts worse.
          externalModules: ["@aws-sdk/*"],
        },
      });

    /* ------------------------------------------------------------------
     * Work
     * ---------------------------------------------------------------- */

    // One persona, one attempt. Long timeout because a real checkout takes minutes,
    // and generous memory because more memory buys proportionally more CPU, and this
    // function spends most of its life waiting on a browser and a model.
    const attemptFn = makeFunction("Attempt", fn("runPersonaAttempt"), {
      timeout: cdk.Duration.minutes(14),
      memory: 1024,
    });

    const aggregateFn = makeFunction("Aggregate", fn("aggregate"), {
      timeout: cdk.Duration.minutes(2),
    });
    const remediateFn = makeFunction("Remediate", fn("remediate"), {
      timeout: cdk.Duration.minutes(5),
      memory: 1024,
    });
    const finaliseFn = makeFunction("Finalise", fn("finalise"), {
      timeout: cdk.Duration.minutes(2),
    });
    const markFailedFn = makeFunction("MarkFailed", fn("markFailed"));

    for (const f of [attemptFn, aggregateFn, remediateFn, finaliseFn, markFailedFn]) {
      props.table.grantReadWriteData(f);
      props.providerSecret.grantRead(f);
      // Every persona run starts and stops an AgentCore browser session. The actions
      // are session scoped and there is no narrower resource to name than the system
      // browser itself.
      f.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            "bedrock-agentcore:StartBrowserSession",
            "bedrock-agentcore:StopBrowserSession",
            "bedrock-agentcore:GetBrowserSession",
            "bedrock-agentcore:ConnectBrowserAutomationStream",
          ],
          resources: ["*"],
        }),
      );
    }

    props.evidenceBucket.grantPut(aggregateFn);
    props.evidenceBucket.grantPut(finaliseFn);
    props.webBucket.grantPut(finaliseFn);
    props.shadowBucket.grantPut(remediateFn);

    /* ------------------------------------------------------------------
     * The graph
     * ---------------------------------------------------------------- */

    const runAttempt = new tasks.LambdaInvoke(this, "RunAttempt", {
      lambdaFunction: attemptFn,
      payloadResponseOnly: true,
    }).addRetry({
      // Retry the transport failures, never a legitimate blocked result. A run that
      // ended in "blocked" is an answer, and retrying answers we dislike would be a
      // way of manufacturing the result we wanted.
      errors: ["Lambda.ServiceException", "Lambda.TooManyRequestsException", "Lambda.Unknown"],
      maxAttempts: 2,
      interval: cdk.Duration.seconds(5),
      backoffRate: 2,
    });

    const attemptsForPersona = new sfn.Map(this, "AttemptsForPersona", {
      itemsPath: "$.attemptIndices",
      // Sequential on purpose: attempts of the same journey are meant to be
      // independent samples, and hammering one site with three concurrent sessions
      // would be rude as well as noisy.
      maxConcurrency: 1,
      itemSelector: {
        "runId.$": "$.runId",
        "journey.$": "$.journey",
        "persona.$": "$.persona",
        "attempt.$": "$$.Map.Item.Value",
      },
    });
    attemptsForPersona.itemProcessor(runAttempt);

    const personaFanOut = new sfn.Map(this, "Personas", {
      itemsPath: "$.personas",
      maxConcurrency: 3,
      itemSelector: {
        "runId.$": "$.runId",
        "journey.$": "$.journey",
        "persona.$": "$$.Map.Item.Value",
        "attemptIndices.$": "$.attemptIndices",
      },
      resultPath: "$.results",
    });
    personaFanOut.itemProcessor(attemptsForPersona);

    const aggregate = new tasks.LambdaInvoke(this, "AggregateResults", {
      lambdaFunction: aggregateFn,
      payloadResponseOnly: true,
      resultPath: "$.aggregate",
    });

    const remediate = new tasks.LambdaInvoke(this, "ProposeAndPublishPatch", {
      lambdaFunction: remediateFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        "runId.$": "$.runId",
        "journey.$": "$.journey",
        "report.$": "$.aggregate.report",
        "failingPersona.$": "$.aggregate.failingPersona",
        "sourceRoot.$": "$.sourceRoot",
      }),
      resultPath: "$.remediation",
    });

    // The re-run is the only thing that turns a patch into a fix.
    const verifyAttempt = new tasks.LambdaInvoke(this, "VerifyAttempt", {
      lambdaFunction: attemptFn,
      payloadResponseOnly: true,
    });

    const verifyRuns = new sfn.Map(this, "VerifyOnPatchedBuild", {
      itemsPath: "$.attemptIndices",
      maxConcurrency: 1,
      itemSelector: {
        "runId.$": "$.runId",
        // Same journey, same assertion, pointed at the patched build. Changing
        // anything else here would make the comparison meaningless.
        "journey.$": "$.patchedJourney",
        "persona.$": "$.aggregate.failingPersona",
        "attempt.$": "$$.Map.Item.Value",
      },
      resultPath: "$.verificationRuns",
    });
    verifyRuns.itemProcessor(verifyAttempt);

    const buildPatchedJourney = new sfn.Pass(this, "PointJourneyAtPatchedBuild", {
      parameters: {
        "journeyId.$": "$.journey.journeyId",
        "name.$": "$.journey.name",
        "goal.$": "$.journey.goal",
        "assertion.$": "$.journey.assertion",
        "createdAt.$": "$.journey.createdAt",
        "startUrl.$": "$.remediation.shadowStartUrl",
      },
      resultPath: "$.patchedJourney",
    });

    const finalise = new tasks.LambdaInvoke(this, "WriteEvidenceAndPublish", {
      lambdaFunction: finaliseFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        "runId.$": "$.runId",
        "journey.$": "$.journey",
        "attempts.$": "$.attempts",
        "report.$": "$.aggregate.report",
        "remediation.$": "$.remediation",
        "verificationRuns.$": "$.verificationRuns",
        "failingPersona.$": "$.aggregate.failingPersona",
      }),
    });

    const finaliseWithoutFix = new tasks.LambdaInvoke(this, "WriteEvidenceOnly", {
      lambdaFunction: finaliseFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        "runId.$": "$.runId",
        "journey.$": "$.journey",
        "attempts.$": "$.attempts",
        "report.$": "$.aggregate.report",
      }),
    });

    const markFailed = new tasks.LambdaInvoke(this, "MarkRunFailed", {
      lambdaFunction: markFailedFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        "runId.$": "$.runId",
        "error.$": "$.error",
      }),
    });

    const patchWasPublished = new sfn.Choice(this, "WasAPatchPublished")
      .when(
        sfn.Condition.booleanEquals("$.remediation.patched", true),
        buildPatchedJourney.next(verifyRuns).next(finalise),
      )
      // A refused patch still produces a report. The diagnosis stands on its own.
      .otherwise(finaliseWithoutFix);

    const shouldRemediate = new sfn.Choice(this, "ShouldWeTryToFixIt")
      .when(
        sfn.Condition.and(
          sfn.Condition.booleanEquals("$.aggregate.hasBlocker", true),
          sfn.Condition.booleanEquals("$.fix", true),
        ),
        remediate.next(patchWasPublished),
      )
      .otherwise(finaliseWithoutFix);

    const definition = personaFanOut
      .next(aggregate)
      .next(shouldRemediate);

    personaFanOut.addCatch(markFailed, { resultPath: "$.error" });
    aggregate.addCatch(markFailed, { resultPath: "$.error" });
    remediate.addCatch(markFailed, { resultPath: "$.error" });

    this.stateMachine = new sfn.StateMachine(this, "Runs", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      // Standard, not Express. Runs last minutes, and the execution history is the
      // audit trail for what a report was built from.
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.hours(1),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, "StateMachineLogs", {
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });

    /* ------------------------------------------------------------------
     * The public door
     * ---------------------------------------------------------------- */

    const startFn = makeFunction("StartRun", fn("startRun"));
    const getFn = makeFunction("GetRun", fn("getRun"));

    // The free tier. Synchronous, because an inspection finishes in seconds, and
    // generously sized because most of its time is spent waiting on a browser.
    const inspectFn = makeFunction("Inspect", fn("inspect"), {
      timeout: cdk.Duration.seconds(60),
      memory: 1024,
    });
    props.table.grantReadData(inspectFn);
    props.webBucket.grantPut(inspectFn);
    inspectFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock-agentcore:StartBrowserSession",
          "bedrock-agentcore:StopBrowserSession",
          "bedrock-agentcore:GetBrowserSession",
          "bedrock-agentcore:ConnectBrowserAutomationStream",
        ],
        resources: ["*"],
      }),
    );

    startFn.addEnvironment("STATE_MACHINE_ARN", this.stateMachine.stateMachineArn);
    this.stateMachine.grantStartExecution(startFn);
    props.table.grantReadWriteData(startFn);
    props.table.grantReadData(getFn);

    const api = new apigw.HttpApi(this, "Api", {
      description: "Buyable public API",
      corsPreflight: {
        allowOrigins: [props.webBaseUrl],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST],
        allowHeaders: ["content-type"],
      },
    });

    api.addRoutes({
      path: "/runs",
      methods: [apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("StartIntegration", startFn),
    });
    api.addRoutes({
      path: "/inspect",
      methods: [apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("InspectIntegration", inspectFn),
    });
    api.addRoutes({
      path: "/runs/{runId}",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("GetIntegration", getFn),
    });

    this.apiUrl = api.apiEndpoint;
  }
}
