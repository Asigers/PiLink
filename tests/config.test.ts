import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("configuration", () => {
  it("uses safe defaults and fails closed for remote senders", () => {
    const config = parseConfig({}, {});
    expect(config.wechat.enabled).toBe(false);
    expect(config.security.allowedWechatUserIds).toEqual([]);
    expect(config.security.requireApprovalForShell).toBe(true);
    expect(config.pi.rpcTimeoutMs).toBeGreaterThan(0);
  });

  it("parses the sender allowlist from the environment", () => {
    const config = parseConfig({}, { WECHAT_ALLOWED_USER_IDS: "wx-a, wx-b ,,wx-c" });
    expect(config.security.allowedWechatUserIds).toEqual(["wx-a", "wx-b", "wx-c"]);
  });

  it("applies explicit configuration over defaults", () => {
    const config = parseConfig({
      app: { logLevel: "debug" },
      workspaces: { defaultId: "research", defaultPath: "./workspaces/research" }
    }, {});
    expect(config.app.logLevel).toBe("debug");
    expect(config.workspaces.defaultId).toBe("research");
  });
});
