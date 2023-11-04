import { Duration } from "aws-cdk-lib";
import {
  EndpointType,
  LambdaIntegration,
  RestApi,
  Resource,
} from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { join } from "path";
import { Endpoint } from "../interfaces/Endpoint";
import { IEventBus } from "aws-cdk-lib/aws-events";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { EventSources } from "../lambda/common/event-sources";

export interface ApiProps {
  bus: IEventBus;
  endpoints: Endpoint[];
  name: string;
  nextEnvs: Record<string, string>;
  oidcs: Record<string, string>;
}

export class Api extends Construct {
  restApi: RestApi;
  resources: Record<string, Resource> = {};
  fns: Record<string, NodejsFunction> = {};
  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const { bus, name, nextEnvs, oidcs } = props;

    this.restApi = new RestApi(this, `${name}Api`, {
      description: `API for ${name}`,
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });

    const integrationRole = new Role(this, "integration-role", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
    });

    props.endpoints.forEach((endpoint) => {
      this.createEndpointPath({ path: endpoint.path });
      const resource = this.resources[endpoint.path];
      this.createEndpointFn({ bus, endpoint });
      const fn = this.fns[endpoint.lambda];
      fn.addEnvironment("OIDCS", JSON.stringify(oidcs));
      fn.addEnvironment("NEXT_ENVS", JSON.stringify(nextEnvs));
      resource.addMethod(endpoint.method, new LambdaIntegration(fn));
    });
  }

  createEndpointPath({ path }: { path: string }) {
    const pathParts = path.split("/");
    let currentPath = "";
    pathParts.forEach((pathPart, ind) => {
      if (pathPart) {
        if (ind === 0) {
          currentPath = pathPart;
          if (!this.resources[currentPath]) {
            this.resources[currentPath] =
              this.restApi.root.addResource(pathPart);
          }
        } else {
          currentPath += `${ind !== 0 ? "/" : ""}${pathPart}`;
          if (!this.resources[currentPath]) {
            this.resources[currentPath] =
              this.resources[
                currentPath.substring(0, currentPath.lastIndexOf("/"))
              ].addResource(pathPart);
          }
        }
      }
    });
  }

  createEndpointFn({ bus, endpoint }: { bus: IEventBus; endpoint: Endpoint }) {
    const fn = new NodejsFunction(this, `${endpoint.lambda}Fn`, {
      entry: join(__dirname, `../lambda/api/${endpoint.lambda}.ts`),
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.TWO_WEEKS,
      description: `${endpoint.lambda}Fn - ${this.restApi.restApiName}`,
      environment: {
        EVENT_SOURCE: EventSources.DeployerBot,
        SLACK_CHANNEL: "C064YNZN940", // TODO: this should be from a property
      },
      retryAttempts: 0,
    });
    if (endpoint.putEvents) {
      bus.grantPutEventsTo(fn);
    }
    if (endpoint.dynamoRead) {
      Object.entries(endpoint.dynamoRead).forEach(([key, table]) => {
        fn.addEnvironment(key, table.tableName);
        table.grantReadData(fn);
      });
    }
    if (endpoint.dynamoWrite) {
      Object.entries(endpoint.dynamoWrite).forEach(([key, table]) => {
        fn.addEnvironment(key, table.tableName);
        table.grantWriteData(fn);
      });
    }
    if (endpoint.secretRead) {
      Object.entries(endpoint.secretRead).forEach(([key, secret]) => {
        fn.addEnvironment(key, secret.secretName);
        secret.grantRead(fn);
      });
    }
    if (endpoint.secretWrite) {
      Object.entries(endpoint.secretWrite).forEach(([key, secret]) => {
        fn.addEnvironment(key, secret.secretName);
        secret.grantWrite(fn);
      });
    }
    this.fns[endpoint.lambda] = fn;
  }
}
