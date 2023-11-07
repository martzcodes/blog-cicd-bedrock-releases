import { Duration, NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { EventBridgeLambda } from "./interfaces/EventBridgeLambda";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { EventSources } from "./lambda/common/event-sources";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";

export interface NestedEventStackProps extends NestedStackProps {
  bus: IEventBus;
  events: EventBridgeLambda[];
  oidcs: Record<string, string>;
  nextEnvs: Record<string, string>;
  slackChannel: string;
}

export class NestedEventStack extends NestedStack {
  restApi: RestApi;
  fns: Record<string, NodejsFunction> = {};
  constructor(scope: Construct, id: string, props: NestedEventStackProps) {
    super(scope, id, props);

    const { bus, events, nextEnvs, oidcs, slackChannel } = props;

    events.forEach((ev) => {
      const fn = this.createEventBridgeFn({ bus, event: ev });
      fn.addEnvironment("OIDCS", JSON.stringify(oidcs));
      fn.addEnvironment("NEXT_ENVS", JSON.stringify(nextEnvs));
      fn.addEnvironment("SLACK_CHANNEL", slackChannel);
      new Rule(this, `${ev.lambda}Rule`, {
        eventPattern: ev.eventPattern,
        targets: [new LambdaFunction(fn)],
      });
    });
  }

  createEventBridgeFn({
    bus,
    event,
  }: {
    bus: IEventBus;
    event: EventBridgeLambda;
  }) {
    const fn = new NodejsFunction(this, `${event.lambda}Fn`, {
      entry: join(__dirname, `lambda/${event.lambda}.ts`),
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.minutes(15),
      logRetention: RetentionDays.TWO_WEEKS,
      memorySize: 1024,
      environment: {
        EVENT_SOURCE: EventSources.DeployerBot,
      },
      bundling: {
        // Nodejs function excludes aws-sdk v3 by default because it is included in the lambda runtime
        // but bedrock is not built into the lambda runtime so we need to override the @aws-sdk/* exclusions
        externalModules: [
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/client-eventbridge",
          "@aws-sdk/client-secrets-manager",
          "@aws-sdk/lib-dynamodb",
        ],
      },
      ...(event.bedrock && {
        initialPolicy: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["bedrock:InvokeModel"],
            resources: ["*"],
          }),
        ],
      }),
      retryAttempts: 0,
    });
    if (event.dynamoRead) {
      Object.entries(event.dynamoRead).forEach(([key, value]) => {
        fn.addEnvironment(key, value.tableName);
        value.grantReadData(fn);
      });
    }
    if (event.dynamoWrite) {
      Object.entries(event.dynamoWrite).forEach(([key, value]) => {
        fn.addEnvironment(key, value.tableName);
        value.grantWriteData(fn);
      });
    }
    if (event.secretRead) {
      Object.entries(event.secretRead).forEach(([key, value]) => {
        fn.addEnvironment(key, value.secretName);
        value.grantRead(fn);
      });
    }
    if (event.putEvents) {
      bus.grantPutEventsTo(fn);
    }
    this.fns[event.lambda] = fn;
    return this.fns[event.lambda];
  }
}
