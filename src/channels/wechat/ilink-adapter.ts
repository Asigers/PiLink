import type { ChannelAdapter, OutgoingMessage } from "../types.js";
import type { IncomingMessage } from "../../types.js";

/**
 * Protocol boundary for Tencent iLink.
 * Inject the transport implementation from the official protocol reference;
 * do not bring OpenClaw runtime/channel dependencies into PiLink.
 */
export interface ILinkTransport {
  start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void>;
  sendMessage(message: OutgoingMessage): Promise<void>;
  stop(): Promise<void>;
}

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
