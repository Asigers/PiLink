import type { ChannelAdapter, OutgoingMessage } from "../types.js";
import type { IncomingMessage } from "../../types.js";

export interface ILinkTransport extends ChannelAdapter {}

export class WeChatIlinkAdapter implements ChannelAdapter {
  constructor(private readonly transport: ILinkTransport) {}

  start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    return this.transport.start(onMessage);
  }

  sendMessage(message: OutgoingMessage): Promise<void> {
    return this.transport.sendMessage(message);
  }

  stop(): Promise<void> {
    return this.transport.stop();
  }
}
