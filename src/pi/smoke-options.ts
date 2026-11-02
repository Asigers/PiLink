import { randomUUID } from "node:crypto";

export interface PiSmokeOptions {
  sessionId: string;
  prompt: string;
}

const DEFAULT_SESSION_ID = "pilink_smoke";
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function parsePiSmokeOptions(args: string[], env: NodeJS.ProcessEnv = process.env): PiSmokeOptions {
  let sessionId = env.PILINK_SMOKE_SESSION_ID?.trim() || DEFAULT_SESSION_ID;
  let explicitSessionId = Boolean(env.PILINK_SMOKE_SESSION_ID?.trim());
  let newSession = false;
  const promptParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--session-id") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--session-id requires a value");
      sessionId = value;
      explicitSessionId = true;
      index += 1;
      continue;
    }
    if (argument.startsWith("--session-id=")) {
      sessionId = argument.slice("--session-id=".length);
      explicitSessionId = true;
      continue;
    }
    if (argument === "--new-session") {
      newSession = true;
      continue;
    }
    promptParts.push(argument);
  }

  if (newSession && explicitSessionId) {
    throw new Error("Use either --new-session or --session-id / PILINK_SMOKE_SESSION_ID, not both");
  }
  if (newSession) sessionId = "pilink_smoke_" + randomUUID().replace(/-/g, "").slice(0, 12);
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Invalid smoke session ID. Use 1-128 letters, numbers, dots, underscores, or hyphens.");
  }

  return {
    sessionId,
    prompt: promptParts.join(" ").trim() || "Reply briefly: PiLink can communicate with Pi over RPC."
  };
}
