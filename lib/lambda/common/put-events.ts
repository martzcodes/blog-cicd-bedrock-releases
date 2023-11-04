import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsRequestEntry,
} from "@aws-sdk/client-eventbridge";
import { EventDetailTypes } from "./event-detail-types";
import { EventBridgeEvent } from "aws-lambda";
import { batchInvoke } from "./batch-invoke";

export interface PutEventsInput {
  detail: string;
  detailType: EventDetailTypes;
  eb: EventBridgeClient;
  event?: EventBridgeEvent<string, any>;
}

export const prepareEventPayload = ({
  detail,
  detailType,
  event,
}: {
  detail: string;
  detailType: EventDetailTypes;
  event?: EventBridgeEvent<string, any>;
}) => ({
  data: {
    ...JSON.parse(detail),
  },
  meta: {
    ...(event
      ? {
          incoming: {
            account: event.account,
            source: event.source,
            detailType: event["detail-type"],
          },
        }
      : {}),
    outgoing: {
      source: process.env.EVENT_SOURCE,
      detailType,
    },
    fn: process.env.AWS_LAMBDA_FUNCTION_NAME,
  },
});

export const putEvent = async ({
  detail,
  detailType,
  eb,
  event,
}: PutEventsInput): Promise<void> => {
  const payload = prepareEventPayload({ detail, detailType, event });
  const command = new PutEventsCommand({
    Entries: [
      {
        Detail: JSON.stringify(payload),
        DetailType: detailType,
        EventBusName: "default",
        Source: process.env.EVENT_SOURCE,
      },
    ],
  });
  try {
    const response = await eb.send(command);
    console.log(response);
  } catch (e) {
    console.log(e);
  }
};

export const runPut =
  (eb: EventBridgeClient, event?: any) =>
  async (events: PutEventsRequestEntry[]): Promise<void> => {
    const command = new PutEventsCommand({
      Entries: events,
    });
    try {
      const response = await eb.send(command);
      console.log(response);
    } catch (e) {
      console.log(e);
    }
  };

// eventbridge limits 10 entries per putEvent
const ENTRY_COUNT_LIMIT = 10;

export const putEvents = async <T extends (items: I[]) => ReturnType<T>, I>(
  ebClient: EventBridgeClient,
  items: PutEventsRequestEntry[],
  event?: any
): Promise<void> => {
  await batchInvoke(runPut(ebClient, event), ENTRY_COUNT_LIMIT, items);
};
