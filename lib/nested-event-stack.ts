import { Duration, NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { EventBridgeEvent } from "./interfaces/EventBridgeEvent";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { EventSources } from "./lambda/common/event-sources";

export interface NestedEventStackProps extends NestedStackProps {
  bus: IEventBus;
  events: EventBridgeEvent[];
}

export class NestedEventStack extends NestedStack {
  restApi: RestApi;
  fns: Record<string, NodejsFunction> = {};
  constructor(scope: Construct, id: string, props: NestedEventStackProps) {
    super(scope, id, props);

    const { bus, events } = props;

    events.forEach((ev) => {
      const fn = this.createEventBridgeFn({ bus, event: ev });
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
    event: EventBridgeEvent;
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
      retryAttempts: 0,
    });
    if (event.dynamosToRead) {
      Object.entries(event.dynamosToRead).forEach(([key, value]) => {
        fn.addEnvironment(key, value.tableName);
        value.grantReadData(fn)
      });
    }
    if (event.dynamosToWrite) {
      Object.entries(event.dynamosToWrite).forEach(([key, value]) => {
        fn.addEnvironment(key, value.tableName);
        value.grantWriteData(fn)
      });
    }
    if (event.secretsToRead) {
      Object.entries(event.secretsToRead).forEach(([key, value]) => {
        fn.addEnvironment(key, value.secretName);
        value.grantRead(fn)
      });
    }
    if (event.putEvents) {
      bus.grantPutEventsTo(fn);
    }
    this.fns[event.lambda] = fn;
    return this.fns[event.lambda];
  }
}