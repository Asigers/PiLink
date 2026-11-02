import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("configuration", () => {
  it("uses personal single-account defaults without a multi-user allowlist", () => {
    const config = parseConfig({}, {});
    expect(config.wechat.credentialsPath).toContain("credentials.json");
    expect(config.security.requireApprovalForShell).toBe(true);
    expect(config.pi.rpcTimeoutMs).toBeGreaterThan(0);
    expect("allowedWechatUserIds" in config.security).toBe(false);
  });

  it("allows the local credentials path to be overridden", () => {
    const config = parseConfig({}, { PILINK_WECHAT_CREDENTIALS_PATH: "/tmp/pilink/wechat.json" });
    expect(config.wechat.credentialsPath).toBe("/tmp/pilink/wechat.json");
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
