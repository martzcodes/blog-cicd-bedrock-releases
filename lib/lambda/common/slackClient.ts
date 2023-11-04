import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { WebClient } from "@slack/web-api";

const sm = new SecretsManagerClient({});


export const getSlackClient = async () => {
  const secret = await sm.send(
    new GetSecretValueCommand({
      SecretId: process.env.SLACK_SECRET,
    })
  );
  const slackToken = JSON.parse(secret.SecretString || "{}").SLACK_TOKEN;
  const slackClient = new WebClient(slackToken);
  return slackClient;
};