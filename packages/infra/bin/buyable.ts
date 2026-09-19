#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BuyableStack } from "../lib/buyable-stack";

const app = new cdk.App();

new BuyableStack(app, "Buyable", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-west-2",
  },
  description: "Buyable: proves a revenue journey can be completed by a screen reader user, a keyboard user, and an AI agent.",
  tags: { project: "buyable", hackathon: "aws-zero-to-shipped-2026" },
});
