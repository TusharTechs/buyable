/**
 * Where the engine finds the infrastructure it needs.
 *
 * Read from the deployed CloudFormation stack rather than from a checked-in config
 * file, so there is exactly one source of truth and no way for the two to drift.
 * Bucket names in particular are generated, and a stale copy in a dotfile would fail
 * in a confusing way weeks later.
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

export interface BuyableInfrastructure {
  demoStoreUrl: string;
  shadowBaseUrl: string;
  shadowBucket: string;
  evidenceBucket: string;
  runsTable: string;
}

const STACK_NAME = process.env.BUYABLE_STACK_NAME ?? "Buyable";

let cached: BuyableInfrastructure | undefined;

export async function loadInfrastructure(region: string): Promise<BuyableInfrastructure> {
  if (cached) return cached;

  const cfn = new CloudFormationClient({ region });
  const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
  const outputs = Stacks?.[0]?.Outputs ?? [];

  const get = (key: string): string => {
    const value = outputs.find((o) => o.OutputKey === key)?.OutputValue;
    if (!value) {
      throw new Error(
        `Stack ${STACK_NAME} has no output ${key}. Deploy packages/infra before running this.`,
      );
    }
    return value;
  };

  cached = {
    demoStoreUrl: get("DemoStoreUrl"),
    shadowBaseUrl: get("ShadowBaseUrl"),
    shadowBucket: get("ShadowBucketName"),
    evidenceBucket: get("EvidenceBucketName"),
    runsTable: get("RunsTableName"),
  };
  return cached;
}
