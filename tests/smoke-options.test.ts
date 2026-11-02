import { describe, expect, it } from "vitest";
import { parsePiSmokeOptions } from "../src/pi/smoke-options.js";

describe("Pi RPC smoke options", () => {
  it("uses a stable session ID by default so repeated runs can resume", () => {
    expect(parsePiSmokeOptions([], {}).sessionId).toBe("pilink_smoke");
  });

  it("accepts a named session and keeps the remaining arguments as the prompt", () => {
    expect(parsePiSmokeOptions(["--session-id", "research-smoke", "Remember", "this"], {})).toEqual({
      sessionId: "research-smoke",
      prompt: "Remember this"
    });
  });

  it("supports the equals form for a named session", () => {
    expect(parsePiSmokeOptions(["--session-id=local-check", "Hello"], {})).toEqual({
      sessionId: "local-check",
      prompt: "Hello"
    });
  });

  it("allows an environment variable to select the persistent session", () => {
    expect(parsePiSmokeOptions([], { PILINK_SMOKE_SESSION_ID: "from-env" }).sessionId).toBe("from-env");
  });

  it("creates a distinct session when requested", () => {
    const first = parsePiSmokeOptions(["--new-session"], {});
    const second = parsePiSmokeOptions(["--new-session"], {});
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.sessionId).toMatch(/^pilink_smoke_[a-f0-9]{12}$/);
  });

  it("rejects conflicting and unsafe session identifiers", () => {
    expect(() => parsePiSmokeOptions(["--new-session", "--session-id", "named"], {})).toThrow(/either/);
    expect(() => parsePiSmokeOptions(["--session-id", "../escape"], {})).toThrow(/Invalid smoke session ID/);
    expect(() => parsePiSmokeOptions(["--session-id"], {})).toThrow(/requires a value/);
  });
});
