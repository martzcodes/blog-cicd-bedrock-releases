import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: "us-east-1",
});

export const summarizeCommit = async (commit: string): Promise<string> => {
  const prompt = `Human: You are a code reviewer bot that summarizes code commits.
Provide a 1-2 sentence summary of the commit that would be useful for developers and product managers.
APIs must be backwards compatible which includes path changes, if they are not it should be highlighted in the summary.
In your summary include analysis of the commit below for bugs and risky or breaking changes.
Your response should only be the summary with no lead-in.
<commit>
${commit}
</commit>
Assistant:`;
  const input: InvokeModelCommandInput = {
    body: JSON.stringify({
      prompt,
      max_tokens_to_sample: 10000, // at $0.01102/1000 tokens, this is $0.11 (max) per commit processed
      temperature: 1,
      top_k: 250,
      top_p: 0.999,
      stop_sequences: ["\n\nHuman:"],
      anthropic_version: "bedrock-2023-05-31",
    }),
    contentType: "application/json",
    modelId: "anthropic.claude-v2",
    accept: "*/*",
  };
  console.log(JSON.stringify({ input }));

  const command = new InvokeModelCommand(input);
  const response = await client.send(command);
  const responseBody = Buffer.from(response.body).toString();
  console.log(JSON.stringify({ responseBody }));

  return JSON.parse(responseBody).completion;
};

export const summarizeRelease = async (release: string): Promise<string> => {
  const prompt = `Human: You are a code release bot that creates release summaries.
You will create a 1-4 sentence summary of the release below that would be useful for developers and product managers.
Accelerate Metrics, Contributors and Release Cadence are of interest in the summary.
APIs must be backwards compatible which includes path changes, if they are not it should be highlighted in the summary.
If you think there are bugs or risky/breaking changes make a note of it in the summary.
Your response should only be the summary with no lead-in.
<release>
${release}
</release>
Assistant:`;
  const input: InvokeModelCommandInput = {
    body: JSON.stringify({
      prompt,
      max_tokens_to_sample: 10000, // at $0.01102/1000 tokens, this is $0.11 (max) per release processed
      temperature: 1,
      top_k: 250,
      top_p: 0.999,
      stop_sequences: ["\n\nHuman:"],
      anthropic_version: "bedrock-2023-05-31",
    }),
    contentType: "application/json",
    modelId: "anthropic.claude-v2",
    accept: "*/*",
  };
  console.log(JSON.stringify({ input }));

  const command = new InvokeModelCommand(input);
  const response = await client.send(command);
  const responseBody = Buffer.from(response.body).toString();
  console.log(JSON.stringify({ responseBody }));

  return JSON.parse(responseBody).completion;
};

export const prepRelease = async ({
  commits,
  lowerEnv,
  higherEnv,
}: {
  commits: string;
  lowerEnv: string;
  higherEnv: string;
}): Promise<string> => {
  const prompt = `Human: You are code release bot that summarizes what could be in a release.
You will provide a 1-4 sentence summary of the differences between the lower environment (${lowerEnv}) and the higher environment (${higherEnv}) that would be useful for developers and product managers.
APIs must be backwards compatible which includes path changes, if they are not it should be highlighted in the summary.
If you think there are bugs or risky/breaking changes make a note of it.
You are being provided with the commits different between the environments.
Make a recommendation for whether to promote or not.
Only respond with the summary and recommendation.
<commits>
${commits}
</commits>
Assistant:`;
  const input: InvokeModelCommandInput = {
    body: JSON.stringify({
      prompt,
      max_tokens_to_sample: 10000, // at $0.01102/1000 tokens, this is $0.11 (max) per release processed
      temperature: 1,
      top_k: 250,
      top_p: 0.999,
      stop_sequences: ["\n\nHuman:"],
      anthropic_version: "bedrock-2023-05-31",
    }),
    contentType: "application/json",
    modelId: "anthropic.claude-v2",
    accept: "*/*",
  };
  console.log(JSON.stringify({ input }));

  const command = new InvokeModelCommand(input);
  const response = await client.send(command);
  const responseBody = Buffer.from(response.body).toString();
  console.log(JSON.stringify({ responseBody }));

  return JSON.parse(responseBody).completion;
};
