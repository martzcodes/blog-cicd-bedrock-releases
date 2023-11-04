import type { ChatPostMessageArguments, ChatUpdateArguments } from "@slack/web-api";

export interface SlackMessageEvent {
  meta: any;
  data: {
    message: ChatPostMessageArguments | ChatUpdateArguments;
    storeMessageTs?: {
      pk: string;
      sk: string;
      prop: string;
    };
  };
}