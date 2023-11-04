import { EventBridgeEvent } from "aws-lambda";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { oidcs } from "../common/oidcs";
import { DeployWithGitHubEvent } from "../common/interfaces/DeployWithGitHubEvent";
import { sm } from "../common/secretsmanager";

export const handler = async (
  event: EventBridgeEvent<string, { data: DeployWithGitHubEvent}>
): Promise<void> => {
  const deploy = event.detail.data;
  const secret = await sm.send(
    new GetSecretValueCommand({
      SecretId: process.env.GITHUB_SECRET,
    })
  );
  const githubToken = JSON.parse(secret.SecretString || "").GITHUB_TOKEN;
  const tag = `refs/tags/${deploy.nextEnv}-${Date.now()}`;
  const createTagRef = await fetch(
    `https://api.github.com/repos/${deploy.owner}/${deploy.repo}/git/refs`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${githubToken}`,
      },
      body: JSON.stringify({
        ref: tag,
        sha: deploy.sha,
      }),
    }
  );
  const tagRef = await createTagRef.json();
  const githubListWorkflowsRes = await fetch(
    `https://api.github.com/repos/${deploy.owner}/${deploy.repo}/actions/workflows`,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${githubToken}`,
      },
    }
  );
  const { workflows } = await githubListWorkflowsRes.json();
  const workflow = workflows.find(
    (workflow: any) => workflow.name === "deploy-to-env"
  );
  if (!workflow) {
    return;
  }
  await fetch(
    `https://api.github.com/repos/${deploy.owner}/${deploy.repo}/actions/workflows/${workflow.id}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: tagRef.ref,
        inputs: {
          deploy_env: deploy.nextEnv,
          oidc_role: oidcs[deploy.nextEnv],
        },
      }),
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${githubToken}`,
      },
    }
  );
};
