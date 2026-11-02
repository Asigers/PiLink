import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, resolvePiCliPath } from "./config.js";
import { createLogger } from "./logger.js";
import { openDatabase } from "./storage/database.js";
import { PiRpcWorker } from "./pi/rpc-worker.js";
import { parsePiSmokeOptions } from "./pi/smoke-options.js";
import { WeChatCredentialsStore } from "./channels/wechat/credentials-store.js";
import { loginWithQr } from "./channels/wechat/login.js";
import { WeChatIlinkTransport } from "./channels/wechat/ilink-transport.js";
import { WeChatIlinkAdapter } from "./channels/wechat/ilink-adapter.js";
import { WeChatInboundStore } from "./channels/wechat/inbound-store.js";
import { SessionManager } from "./bridge/session-manager.js";
import { JobManager } from "./bridge/job-manager.js";
import { MessageRouter } from "./bridge/message-router.js";
import { PiWorkerPool } from "./pi/worker-pool.js";

function printUsage(): void {
  console.log("PiLink commands:");
  console.log("  doctor       Check local prerequisites and configuration");
  console.log("  login        Link your personal WeChat ClawBot by QR code");
  console.log("  logout       Remove locally stored WeChat credentials");
  console.log("  status       Show local PiLink / WeChat connection status");
  console.log("  start        Start the WeChat <-> Pi Agent bridge");
  console.log("  pi:smoke     Run a local prompt through Pi RPC");
  console.log("               --session-id <id>  Reuse a named smoke session");
  console.log("               --new-session      Create an isolated smoke session");
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

  const credentials = await new WeChatCredentialsStore(config.wechat.credentialsPath).load();
  console.log((credentials ? "OK   " : "WARN ") + "WeChat QR login " + (credentials ? "configured for " + credentials.ilinkBotId : "not configured; run pilink login"));
  console.log((config.web.braveApiKey ? "OK   " : "WARN ") + "Brave Search API key " + (config.web.braveApiKey ? "configured" : "not configured"));
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
    if (after.messageCount <= before.messageCount) throw new Error("Pi session message count did not increase after the prompt");
    const assistantText = await worker.getLastAssistantText();
    if (!assistantText?.trim()) throw new Error("Pi completed the run without a final assistant text response");
    process.stdout.write("\n");
    console.log("Pi RPC smoke test passed.");
    console.log("Session persisted: " + sessionId);
    console.log("Message count: " + before.messageCount + " -> " + after.messageCount);
  } finally {
    unsubscribe();
    await worker.stop();
  }
}

async function login(force: boolean): Promise<void> {
  const config = loadConfig();
  const store = new WeChatCredentialsStore(config.wechat.credentialsPath);
  const existing = await store.load();
  if (existing && !force) {
    throw new Error("This PiLink instance is already linked to a WeChat account. Run 'pilink logout' first, or use 'pilink login --force' to replace it.");
  }
  console.log("Starting Tencent iLink QR login. Only link your own personal WeChat account.");
  const credentials = await loginWithQr();
  await store.save(credentials);
  console.log("Credentials saved with owner-only file permissions.");
  console.log("Bot ID: " + credentials.ilinkBotId);
  console.log("Owner ID: " + credentials.ownerUserId);
  console.log("Credentials path: " + store.path);
  console.log("Next: npm run dev -- start");
}

async function showStatus(): Promise<void> {
  const config = loadConfig();
  const credentials = await new WeChatCredentialsStore(config.wechat.credentialsPath).load();
  console.log("PiLink status");
  console.log("Pi CLI: " + resolvePiCliPath(config));
  console.log("WeChat: " + (credentials ? "linked" : "not linked"));
  if (credentials) {
    console.log("Bot ID: " + credentials.ilinkBotId);
    console.log("Owner ID: " + credentials.ownerUserId);
    console.log("API: " + credentials.baseUrl);
  }
  console.log("Database: " + resolve(config.storage.databasePath));
  console.log("Pi sessions: " + resolve(config.pi.sessionDir));
}

async function startBridge(): Promise<void> {
  const config = loadConfig();
  const credentialsStore = new WeChatCredentialsStore(config.wechat.credentialsPath);
  const credentials = await credentialsStore.load();
  if (!credentials) throw new Error("WeChat is not linked. Run 'npm run dev -- login' first.");

  const database = openDatabase(config.storage.databasePath);
  const sessions = new SessionManager(database.connection);
  const jobs = new JobManager(database.connection);
  const chatId = sessions.getOrCreateChat(credentials.ilinkBotId, credentials.ownerUserId, "direct");
  const inboundStore = new WeChatInboundStore(database.connection, chatId);
  const workers = new PiWorkerPool(config);
  const transport = new WeChatIlinkTransport({ credentials, inboundStore });
  const adapter = new WeChatIlinkAdapter(transport);
  const router = new MessageRouter(
    config,
    sessions,
    jobs,
    workers,
    credentials.ownerUserId,
    (message) => adapter.sendMessage(message)
  );

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\nStopping PiLink...");
    await adapter.stop();
    await router.stop();
    await workers.stopAll();
    database.close();
  };

  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });

  console.log("PiLink started.");
  console.log("Linked owner: " + credentials.ownerUserId);
  console.log("Default Pi session will be created on the first message.");
  console.log("Commands: /new, /status, /stop, /help");
  try {
    await adapter.start((message) => router.handle(message));
  } finally {
    await shutdown();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  const args = process.argv.slice(3);
  if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (command === "doctor") {
    const exitCode = await doctor();
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }
  if (command === "login") {
    await login(args.includes("--force"));
    return;
  }
  if (command === "logout") {
    const config = loadConfig();
    await new WeChatCredentialsStore(config.wechat.credentialsPath).remove();
    console.log("Local WeChat credentials removed.");
    return;
  }
  if (command === "status") {
    await showStatus();
    return;
  }
  if (command === "start") {
    await startBridge();
    return;
  }
  if (command === "pi:smoke") {
    const options = parsePiSmokeOptions(args);
    await piSmoke(options.prompt, options.sessionId);
    return;
  }
  printUsage();
  throw new Error("Unknown command: " + command);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
