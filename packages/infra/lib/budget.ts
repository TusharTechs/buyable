import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as budgets from "aws-cdk-lib/aws-budgets";

export interface SpendGuardProps {
  /** Monthly ceiling in USD. */
  limitUsd: number;
  /** Where warnings go. When absent the budget still exists, silently. */
  alertEmail?: string;
}

/**
 * A monthly spend ceiling with alerts before it is reached.
 *
 * Deliberately alerts at 50 and 80 percent of actual spend and at 100 percent of
 * forecast. A notice that arrives only once the limit is hit is not a warning, it is
 * a receipt.
 *
 * This is a guard, not a stop: AWS Budgets notifies, it does not switch anything off.
 * The thing that actually halts work is the application level limiter in
 * packages/functions/src/guards.ts, which can refuse a run before it starts.
 */
export class SpendGuard extends Construct {
  constructor(scope: Construct, id: string, props: SpendGuardProps) {
    super(scope, id);

    const subscribers = props.alertEmail
      ? [{ subscriptionType: "EMAIL", address: props.alertEmail }]
      : [];

    new budgets.CfnBudget(this, "Monthly", {
      budget: {
        budgetName: `${cdk.Stack.of(this).stackName}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.limitUsd, unit: "USD" },
      },
      notificationsWithSubscribers: subscribers.length
        ? [
            {
              notification: {
                notificationType: "ACTUAL",
                comparisonOperator: "GREATER_THAN",
                threshold: 50,
                thresholdType: "PERCENTAGE",
              },
              subscribers,
            },
            {
              notification: {
                notificationType: "ACTUAL",
                comparisonOperator: "GREATER_THAN",
                threshold: 80,
                thresholdType: "PERCENTAGE",
              },
              subscribers,
            },
            {
              notification: {
                notificationType: "FORECASTED",
                comparisonOperator: "GREATER_THAN",
                threshold: 100,
                thresholdType: "PERCENTAGE",
              },
              subscribers,
            },
          ]
        : undefined,
    });
  }
}
