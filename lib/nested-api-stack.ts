import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Api } from "./constructs/api";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { EndpointLambda } from "./interfaces/EndpointLambda";
import { IEventBus } from "aws-cdk-lib/aws-events";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export interface NestedApiStackProps extends NestedStackProps {
  bus: IEventBus;
  endpoints: EndpointLambda[];
  nextEnvs: Record<string, string>;
  oidcs: Record<string, string>;
  slackChannel: string;
}

export class NestedApiStack extends NestedStack {
  restApi: RestApi;
  fns: Record<string, NodejsFunction> = {};
  constructor(scope: Construct, id: string, props: NestedApiStackProps) {
    super(scope, id, props);

    const {
      bus,
      endpoints,
      nextEnvs,
      oidcs,
      slackChannel,
    } = props;

    const { fns, restApi } = new Api(this, `Api`, {
      bus,
      endpoints,
      nextEnvs,
      oidcs,
      name: id,
      slackChannel,
    });
    this.restApi = restApi;
    this.fns = { ...fns };
  }
}
