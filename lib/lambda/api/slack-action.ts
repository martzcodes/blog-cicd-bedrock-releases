import { APIGatewayEvent } from "aws-lambda";
import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { EventDetailTypes } from "../common/event-detail-types";
import { EventSources } from "../common/event-sources";
import { eb } from "../common/eventbridge";

export const handler = async (event: APIGatewayEvent) => {
  const body = JSON.parse(event.body || "{}");
  console.log(JSON.stringify({ body }, null, 2));

  if (body.challenge) {
    return {
      statusCode: 200,
      body: body.challenge,
    };
  }

  const lowerBody = body.event.text.toLowerCase();

  const diffEnvs = ["dev", "test", "prod"].filter((env) => lowerBody.includes(env));
  if (lowerBody.includes("diff") && diffEnvs.length === 2) {
    const events = [
      {
        Source: EventSources.DeployerBot,
        DetailType: EventDetailTypes.ENV_DIFF,
        Detail: JSON.stringify({
          data: {
            channel: body.event.channel,
            user: body.event.user,
            thread_ts: body.event.ts,
            diffEnvs,
          }
        }),
      },
    ];
    await eb.send(
      new PutEventsCommand({
        Entries: events,
      })
    );
  }

  return {
    statusCode: 200,
  };
};
