import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const configSchema = z.object({
  app: z.object({ logLevel: z.enum(["debug", "info", "warn", "error"]).default("info") }),
  pi: z.object({
    cliPath: z.string().optional(),
    agentDir: z.string(),
    sessionDir: z.string(),
    rpcTimeoutMs: z.number().int().positive(),
    systemPromptPath: z.string(),
    extensions: z.array(z.string()),
    skills: z.array(z.string())
  }),
  storage: z.object({ databasePath: z.string() }),
  security: z.object({
    allowedWechatUserIds: z.array(z.string()),
    workspaceRoots: z.array(z.string()),
    requireApprovalForShell: z.boolean()
  }),
  workspaces: z.object({ defaultId: z.string(), defaultPath: z.string() }),
  wechat: z.object({ enabled: z.boolean(), baseUrl: z.string().url() }),
  web: z.object({ braveApiKey: z.string().optional(), searchCount: z.number().int().min(1).max(20) })
});

export type AppConfig = z.infer<typeof configSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseConfig(raw: unknown = {}, env: NodeJS.ProcessEnv = process.env): AppConfig {
  const source = asRecord(raw);
  const cwd = process.cwd();
  const defaults = {
    app: { logLevel: "info" },
    pi: {
      agentDir: resolve(homedir(), ".pi", "agent"),
      sessionDir: resolve(cwd, "data", "pi-sessions"),
      rpcTimeoutMs: 300000,
      systemPromptPath: resolve(cwd, "pi", "SYSTEM.md"),
      extensions: ["./pi/extensions/pilink-web-search.ts"],
      skills: ["./pi/skills/web-research/SKILL.md"]
    },
    storage: { databasePath: resolve(cwd, "data", "pilink.sqlite") },
    security: {
      allowedWechatUserIds: [],
      workspaceRoots: [resolve(cwd, "workspaces")],
      requireApprovalForShell: true
    },
    workspaces: { defaultId: "default", defaultPath: resolve(cwd, "workspaces", "default") },
    wechat: { enabled: false, baseUrl: "https://ilinkai.weixin.qq.com" },
    web: { searchCount: 8 }
  };

  const merged: Record<string, unknown> = {
    app: { ...defaults.app, ...asRecord(source.app) },
    pi: { ...defaults.pi, ...asRecord(source.pi) },
    storage: { ...defaults.storage, ...asRecord(source.storage) },
    security: { ...defaults.security, ...asRecord(source.security) },
    workspaces: { ...defaults.workspaces, ...asRecord(source.workspaces) },
    wechat: { ...defaults.wechat, ...asRecord(source.wechat) },
    web: { ...defaults.web, ...asRecord(source.web) }
  };

  const pi = asRecord(merged.pi);
  const storage = asRecord(merged.storage);
  const security = asRecord(merged.security);
  const web = asRecord(merged.web);
  if (env.PILINK_PI_CLI_PATH) pi.cliPath = env.PILINK_PI_CLI_PATH;
  if (env.PI_CODING_AGENT_DIR) pi.agentDir = env.PI_CODING_AGENT_DIR;
  if (env.PILINK_PI_SESSION_DIR) pi.sessionDir = env.PILINK_PI_SESSION_DIR;
  if (env.PILINK_DATABASE_PATH) storage.databasePath = env.PILINK_DATABASE_PATH;
  if (env.BRAVE_SEARCH_API_KEY) web.braveApiKey = env.BRAVE_SEARCH_API_KEY;
  if (env.WECHAT_ALLOWED_USER_IDS !== undefined) {
    security.allowedWechatUserIds = env.WECHAT_ALLOWED_USER_IDS.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return configSchema.parse(merged);
}

export function loadConfig(configPath?: string): AppConfig {
  const selectedPath = configPath ?? process.env.PILINK_CONFIG ?? resolve(process.cwd(), "config", "config.json");
  const raw = existsSync(selectedPath) ? JSON.parse(readFileSync(selectedPath, "utf8")) : {};
  return parseConfig(raw);
}

export function resolveProjectPath(path: string): string {
  return resolve(process.cwd(), path);
}

export function resolvePiCliPath(config: AppConfig): string {
  if (config.pi.cliPath) return resolve(config.pi.cliPath);
  const packageEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const cliPath = resolve(dirname(packageEntry), "bundle", "cli.js");
  if (!existsSync(cliPath)) throw new Error("Pi CLI bundle not found at " + cliPath + ". Run npm install or set PILINK_PI_CLI_PATH.");
  return cliPath;
}
