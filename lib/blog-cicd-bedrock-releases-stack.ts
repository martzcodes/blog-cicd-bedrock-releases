import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { EventBus } from "aws-cdk-lib/aws-events";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { NestedApiStack } from "./nested-api-stack";
import { NestedEventStack } from "./nested-event-stack";
import { events } from "./routes/events";
import { webhooks } from "./routes/webhooks";
import { StackProps, Stack, RemovalPolicy } from "aws-cdk-lib";
export interface BlogCicdBedrockReleasesStackProps extends StackProps {
  nextEnvs: Record<string, string>;
  oidcs: Record<string, string>;
  githubSecretArn: string;
  slackSecretArn: string;
}

export class BlogCicdBedrockReleasesStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: BlogCicdBedrockReleasesStackProps
  ) {
    super(scope, id, props);

    const { nextEnvs, oidcs, githubSecretArn, slackSecretArn } = props;

    const table = new Table(this, "Table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    const githubSecret = Secret.fromSecretCompleteArn(
      this,
      `DeployerBotGitHubSecret`,
      githubSecretArn
    );
    const slackSecret = Secret.fromSecretCompleteArn(
      this,
      `DeployerBotSlackSecret`,
      slackSecretArn
    );

    const bus = EventBus.fromEventBusName(this, "bus", "default");
    const webhookEndpoints = webhooks({ table, githubSecret, slackSecret });
    new NestedApiStack(this, "NestedApiStack", {
      bus,
      endpoints: webhookEndpoints,
      nextEnvs,
      oidcs,
    });

    new NestedEventStack(this, "NestedEventStack", {
      bus,
      events: events({ table, slackSecret, githubSecret }),
    });
  }
}
