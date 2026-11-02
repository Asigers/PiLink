import { randomBytes } from "node:crypto";

export const ILINK_DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const ILINK_BOT_TYPE = "3";
const CHANNEL_VERSION = "0.1.0";
const BOT_AGENT = "PiLink/0.1.0";
const APP_ID = "bot";
const REQUEST_TIMEOUT_MS = 15_000;
const LONG_POLL_TIMEOUT_MS = 40_000;
const QR_POLL_TIMEOUT_MS = 35_000;

export interface ILinkQrCode {
  qrcode: string;
  qrcode_img_content: string;
}

export type ILinkQrStatus =
  | "wait"
  | "scaned"
  | "confirmed"
  | "expired"
  | "scaned_but_redirect"
  | "need_verifycode"
  | "verify_code_blocked"
  | "binded_redirect";

export interface ILinkQrStatusResponse {
  status: ILinkQrStatus;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  redirect_host?: string;
}

export interface ILinkMessageItem {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string };
}

export interface ILinkMessage {
  message_id?: string;
  seq?: number;
  from_user_id?: string;
  to_user_id?: string;
  group_id?: string;
  message_type?: number;
  item_list?: ILinkMessageItem[];
  context_token?: string;
  create_time_ms?: number;
}

export interface ILinkUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: ILinkMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export interface ILinkCredentials {
  botToken: string;
  ilinkBotId: string;
  ownerUserId: string;
  baseUrl: string;
  connectedAt: string;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class ILinkSessionExpiredError extends Error {
  constructor() {
    super("iLink Bot token expired (errcode -14); run pilink login again");
    this.name = "ILinkSessionExpiredError";
  }
}

function clientVersion(version: string): string {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  return String(((Number.parseInt(major, 10) & 0xff) << 16) |
    ((Number.parseInt(minor, 10) & 0xff) << 8) |
    (Number.parseInt(patch, 10) & 0xff));
}

function randomWechatUin(): string {
  return Buffer.from(String(randomBytes(4).readUInt32BE(0)), "utf8").toString("base64");
}

function commonHeaders(): Record<string, string> {
  return {
    "iLink-App-Id": APP_ID,
    "iLink-App-ClientVersion": clientVersion(CHANNEL_VERSION)
  };
}

function postHeaders(token?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
    ...commonHeaders(),
    ...(token ? { Authorization: "Bearer " + token } : {})
  };
}

function ensureHttpsBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("iLink API base URL must be HTTPS and must not contain credentials");
  }
  return url.toString().replace(/\/$/, "");
}

function quoteLosslessMessageIds(raw: string): string {
  let output = "";
  let index = 0;
  while (index < raw.length) {
    if (raw[index] !== '"') {
      output += raw[index++];
      continue;
    }
    const start = index++;
    let escaped = false;
    while (index < raw.length) {
      const char = raw[index++];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') break;
    }
    const token = raw.slice(start, index);
    output += token;
    let cursor = index;
    while (/\s/.test(raw[cursor] ?? "")) cursor++;
    if (raw[cursor] !== ":") continue;
    let key: unknown;
    try { key = JSON.parse(token); } catch { continue; }
    if (key !== "message_id" && key !== "msg_id" && key !== "svr_id") continue;
    output += raw.slice(index, cursor + 1);
    cursor++;
    while (/\s/.test(raw[cursor] ?? "")) output += raw[cursor++];
    const numberStart = cursor;
    if (raw[cursor] === "-") cursor++;
    while (/\d/.test(raw[cursor] ?? "")) cursor++;
    if (cursor > numberStart) {
      output += '"' + raw.slice(numberStart, cursor) + '"';
      index = cursor;
    } else {
      index = numberStart;
    }
  }
  return output;
}

function combineSignals(internal: AbortSignal, external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  if (!external) return { signal: internal, cleanup: () => undefined };
  const controller = new AbortController();
  const forwardInternal = () => controller.abort();
  const forwardExternal = () => controller.abort();
  if (internal.aborted || external.aborted) controller.abort();
  internal.addEventListener("abort", forwardInternal, { once: true });
  external.addEventListener("abort", forwardExternal, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      internal.removeEventListener("abort", forwardInternal);
      external.removeEventListener("abort", forwardExternal);
    }
  };
}

export class ILinkApiClient {
  private baseUrl: string;

  constructor(
    baseUrl = ILINK_DEFAULT_BASE_URL,
    private readonly token?: string,
    private readonly fetcher: FetchLike = fetch
  ) {
    this.baseUrl = ensureHttpsBaseUrl(baseUrl);
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = ensureHttpsBaseUrl(baseUrl);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async requestJson<T>(params: {
    method: "GET" | "POST";
    endpoint: string;
    body?: unknown;
    authenticated?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
    includeBaseInfo?: boolean;
    baseUrl?: string;
  }): Promise<T> {
    const url = new URL(params.endpoint, (params.baseUrl ? ensureHttpsBaseUrl(params.baseUrl) : this.baseUrl) + "/");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const combined = combineSignals(controller.signal, params.signal);
    const headers = params.method === "GET" ? commonHeaders() : postHeaders(params.authenticated === false ? undefined : this.token);
    const body = params.method === "POST"
      ? JSON.stringify(params.includeBaseInfo === false
        ? (params.body ?? {})
        : { ...(params.body as Record<string, unknown> ?? {}), base_info: { channel_version: CHANNEL_VERSION, bot_agent: BOT_AGENT } })
      : undefined;
    try {
      const response = await this.fetcher(url, {
        method: params.method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: combined.signal
      });
      const raw = await response.text();
      if (!response.ok) throw new Error("iLink " + params.endpoint + " returned HTTP " + response.status);
      try {
        return JSON.parse(quoteLosslessMessageIds(raw)) as T;
      } catch {
        throw new Error("iLink " + params.endpoint + " returned invalid JSON");
      }
    } finally {
      clearTimeout(timeout);
      combined.cleanup();
    }
  }

  async getQrCode(): Promise<ILinkQrCode> {
    const result = await this.requestJson<ILinkQrCode>({
      method: "POST",
      endpoint: "ilink/bot/get_bot_qrcode?bot_type=" + encodeURIComponent(ILINK_BOT_TYPE),
      body: { local_token_list: [] },
      authenticated: false,
      includeBaseInfo: false,
      baseUrl: ILINK_DEFAULT_BASE_URL
    });
    if (!result.qrcode || !result.qrcode_img_content) throw new Error("iLink did not return a usable QR code");
    return result;
  }

  async getQrStatus(qrcode: string, verifyCode?: string): Promise<ILinkQrStatusResponse> {
    const query = new URLSearchParams({ qrcode });
    if (verifyCode) query.set("verify_code", verifyCode);
    return this.requestJson<ILinkQrStatusResponse>({
      method: "GET",
      endpoint: "ilink/bot/get_qrcode_status?" + query.toString(),
      timeoutMs: QR_POLL_TIMEOUT_MS
    });
  }

  async getUpdates(cursor: string, signal: AbortSignal, timeoutMs = LONG_POLL_TIMEOUT_MS): Promise<ILinkUpdatesResponse> {
    try {
      return await this.requestJson<ILinkUpdatesResponse>({
        method: "POST",
        endpoint: "ilink/bot/getupdates",
        body: { get_updates_buf: cursor },
        timeoutMs,
        signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ret: 0, msgs: [], get_updates_buf: cursor };
      }
      throw error;
    }
  }

  async sendTextMessage(toUserId: string, text: string, contextToken?: string): Promise<void> {
    const result = await this.requestJson<{ ret?: number; errmsg?: string }>({
      method: "POST",
      endpoint: "ilink/bot/sendmessage",
      body: {
        msg: {
          from_user_id: "",
          to_user_id: toUserId,
          client_id: "pilink:" + Date.now() + "-" + randomBytes(4).toString("hex"),
          message_type: 2,
          message_state: 2,
          context_token: contextToken,
          item_list: [{ type: 1, text_item: { text } }]
        }
      }
    });
    if (result.ret !== undefined && result.ret !== 0) {
      throw new Error("iLink sendMessage failed: ret=" + result.ret + " " + (result.errmsg ?? ""));
    }
  }

  async notifyStart(): Promise<void> {
    await this.requestJson({ method: "POST", endpoint: "ilink/bot/msg/notifystart", body: {} });
  }

  async notifyStop(): Promise<void> {
    await this.requestJson({ method: "POST", endpoint: "ilink/bot/msg/notifystop", body: {} });
  }
}
