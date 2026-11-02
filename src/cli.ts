import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, resolvePiCliPath } from "./config.js";
import { createLogger } from "./logger.js";
import { openDatabase } from "./storage/database.js";
import { PiRpcWorker } from "./pi/rpc-worker.js";
import { parsePiSmokeOptions } from "./pi/smoke-options.js";

function printUsage(): void {
  console.log("PiLink commands:");
  console.log("  doctor       Check local prerequisites and configuration");
  console.log("  pi:smoke     Run a local prompt through Pi RPC");
  console.log("               --session-id <id>  Reuse a named smoke session");
  console.log("               --new-session      Create an isolated smoke session");
  console.log("  start        Initialize the local runtime skeleton");
}

async function doctor(): Promise<number> {
  const config = loadConfig();
  const logger = createLogger(config);
  let failures = 0;
  const nodeVersion = process.versions.node.split(".").map(Number);
  const nodeOk = nodeVersion[0] > 22 || (nodeVersion[0] === 22 && nodeVersion[1] >= 19);
  console.log((nodeOk ? "OK   " : "FAIL ") + "Node.js " + process.versions.node + " (requires >=22.19)");
  if (!nodeOk) failures += 1;

  try {
    console.log("OK   Pi CLI: " + resolvePiCliPath(config));
  } catch (error) {
    console.log("FAIL Pi CLI: " + (error instanceof Error ? error.message : String(error)));
    failures += 1;
  }

  const agentDirExists = existsSync(resolve(config.pi.agentDir));
  console.log((agentDirExists ? "OK   " : "WARN ") + "Pi agent directory: " + resolve(config.pi.agentDir));
  if (!agentDirExists) logger.warn("Pi agent directory does not exist yet; configure Pi and a model before the smoke test.");

  const workspace = resolve(config.workspaces.defaultPath);
  mkdirSync(workspace, { recursive: true });
  console.log("OK   Default workspace: " + workspace);

  const database = openDatabase(config.storage.databasePath);
  database.close();
  console.log("OK   SQLite: " + resolve(config.storage.databasePath));
  console.log((config.web.braveApiKey ? "OK   " : "WARN ") + "Brave Search API key " + (config.web.braveApiKey ? "configured" : "not configured"));
  console.log((config.security.allowedWechatUserIds.length > 0 ? "OK   " : "WARN ") + "WeChat sender allowlist " + config.security.allowedWechatUserIds.length + " entr(y/ies)");
  console.log("INFO WeChat transport is an interface-only scaffold in this milestone.");
  return failures === 0 ? 0 : 1;
}

async function piSmoke(prompt: string, sessionId: string): Promise<void> {
  const config = loadConfig();
  const worker = new PiRpcWorker({
    sessionId,
    sessionDir: resolve(config.pi.sessionDir),
    cwd: process.cwd(),
    name: "PiLink RPC smoke test",
    config
  });

  const unsubscribe = worker.onEvent((event) => {
    const value = event as unknown as {
      type?: string;
      toolName?: string;
      assistantMessageEvent?: { type?: string; delta?: string };
    };
    if (value.type === "message_update" && value.assistantMessageEvent?.type === "text_delta") {
      process.stdout.write(value.assistantMessageEvent.delta ?? "");
    } else if (value.type === "tool_execution_start") {
      process.stderr.write("\n[tool] " + (value.toolName ?? "unknown") + "\n");
    }
  });

  try {
    await worker.start();
    const before = await worker.getState();
    if (before.sessionId !== sessionId) {
      throw new Error("Pi opened an unexpected session: expected " + sessionId + ", received " + before.sessionId);
    }

    console.log("Pi RPC started. Session: " + sessionId);
    console.log("Existing session messages: " + before.messageCount);
    console.log("Sending prompt...");
    const result = await worker.promptAndWait(prompt);
    if (!result.events.some((event) => (event as { type?: string }).type === "agent_settled")) {
      throw new Error("Pi RPC returned without an agent_settled event");
    }

    const after = await worker.getState();
    if (after.sessionId !== sessionId) throw new Error("Pi session ID changed during the smoke test");
    if (after.messageCount <= before.messageCount) {
      throw new Error("Pi session message count did not increase after the prompt");
    }

    const assistantText = await worker.getLastAssistantText();
    if (!assistantText?.trim()) throw new Error("Pi completed the run without a final assistant text response");

    process.stdout.write("\n");
    console.log("Pi RPC smoke test passed.");
    console.log("Session persisted: " + sessionId);
    console.log("Message count: " + before.messageCount + " -> " + after.messageCount);
    console.log("Resume check: run this command again with the same session ID to continue this conversation.");
  } finally {
    unsubscribe();
    await worker.stop();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (command === "doctor") {
    const exitCode = await doctor();
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }
  if (command === "pi:smoke") {
    const options = parsePiSmokeOptions(process.argv.slice(3));
    await piSmoke(options.prompt, options.sessionId);
    return;
  }
  if (command === "start") {
    const config = loadConfig();
    const logger = createLogger(config);
    const database = openDatabase(config.storage.databasePath);
    database.close();
    logger.info("PiLink foundation initialized.");
    logger.warn("No WeChat transport is enabled yet. Run 'npm run dev -- pi:smoke' to verify Pi RPC.");
    return;
  }
  printUsage();
  throw new Error("Unknown command: " + command);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
