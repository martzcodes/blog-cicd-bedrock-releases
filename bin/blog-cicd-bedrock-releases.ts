#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BlogCicdBedrockReleasesStack } from "../lib/blog-cicd-bedrock-releases-stack";

const oidcs: Record<string, string> = {
  test: "arn:aws:iam::359317520455:role/GitHubOidcRole",
  prod: "arn:aws:iam::359317520455:role/GitHubOidcRole",
};
const nextEnvs: Record<string, string> = {
  dev: "test",
  test: "prod",
};

const app = new cdk.App();
new BlogCicdBedrockReleasesStack(app, "BlogCicdBedrockReleasesStack", {
  githubSecretArn: "arn:aws:secretsmanager:us-east-1:359317520455:secret:deployerbot/github-LM5TP2",
  nextEnvs,
  oidcs,
  slackChannel: "C064YNZN940",
  slackSecretArn: "arn:aws:secretsmanager:us-east-1:359317520455:secret:deployerbot/slack-bbPlpP",
});
