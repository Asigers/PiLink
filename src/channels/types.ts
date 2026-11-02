import type { IncomingMessage } from "../types.js";

export interface OutgoingMessage {
  peerId: string;
  contextToken?: string;
  text: string;
}

export interface ChannelAdapter {
  start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void>;
  sendMessage(message: OutgoingMessage): Promise<void>;
  stop(): Promise<void>;
}
