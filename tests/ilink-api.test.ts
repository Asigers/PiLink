import { describe, expect, it, vi } from "vitest";
import { ILinkApiClient } from "../src/channels/wechat/ilink-api.js";

function response(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("iLink API client", () => {
  it("requests QR credentials from the fixed iLink host without bot authorization", async () => {
    const fetcher = vi.fn(async () => response(JSON.stringify({
      qrcode: "qr-value",
      qrcode_img_content: "https://example.test/qr"
    })));
    const api = new ILinkApiClient("https://custom-api.test", undefined, fetcher);

    const qr = await api.getQrCode();

    expect(qr.qrcode).toBe("qr-value");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url.origin).toBe("https://ilinkai.weixin.qq.com");
    expect(url.pathname).toBe("/ilink/bot/get_bot_qrcode");
    expect(url.searchParams.get("bot_type")).toBe("3");
    expect(headers.Authorization).toBeUndefined();
    expect(headers.AuthorizationType).toBe("ilink_bot_token");
    expect(headers["iLink-App-Id"]).toBe("bot");
    expect(headers["X-WECHAT-UIN"]).toBeTruthy();
    expect(JSON.parse(String(init.body))).toEqual({ local_token_list: [] });
  });

  it("sends the persisted cursor and preserves uint64 message IDs losslessly", async () => {
    const raw = '{"ret":0,"msgs":[{"message_id":18446744073709551615,"from_user_id":"owner","message_type":1}],"get_updates_buf":"next"}';
    const fetcher = vi.fn(async () => response(raw));
    const api = new ILinkApiClient("https://api.test", "secret-token", fetcher);

    const result = await api.getUpdates("previous", new AbortController().signal, 1000);

    expect(result.msgs?.[0].message_id).toBe("18446744073709551615");
    const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
    const body = JSON.parse(String(init.body));
    expect(body.get_updates_buf).toBe("previous");
    expect(body.base_info.bot_agent).toBe("PiLink/0.1.0");
  });

  it("sends text replies with the inbound context token", async () => {
    const fetcher = vi.fn(async () => response('{"ret":0}'));
    const api = new ILinkApiClient("https://api.test", "token", fetcher);

    await api.sendTextMessage("owner-id", "hello", "context-123");

    const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.msg.to_user_id).toBe("owner-id");
    expect(body.msg.context_token).toBe("context-123");
    expect(body.msg.item_list[0].text_item.text).toBe("hello");
    expect(body.base_info.channel_version).toBe("0.1.0");
  });

  it("rejects non-HTTPS API endpoints", () => {
    expect(() => new ILinkApiClient("http://api.test")).toThrow(/HTTPS/);
  });
});
