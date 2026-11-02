import { chmod, mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ILinkCredentials } from "./ilink-api.js";

function validateCredentials(value: unknown): ILinkCredentials {
  if (typeof value !== "object" || value === null) throw new Error("Invalid WeChat credentials file");
  const record = value as Record<string, unknown>;
  const required = ["botToken", "ilinkBotId", "ownerUserId", "baseUrl", "connectedAt"];
  for (const key of required) {
    if (typeof record[key] !== "string" || !(record[key] as string).trim()) {
      throw new Error("WeChat credentials are missing " + key);
    }
  }
  const baseUrl = new URL(record.baseUrl as string);
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    throw new Error("WeChat credentials contain an invalid API URL");
  }
  return record as unknown as ILinkCredentials;
}

export class WeChatCredentialsStore {
  readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  async load(): Promise<ILinkCredentials | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      return validateCredentials(JSON.parse(raw) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(credentials: ILinkCredentials): Promise<void> {
    validateCredentials(credentials);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = this.path + ".tmp-" + process.pid;
    await writeFile(temporary, JSON.stringify(credentials, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }

  async remove(): Promise<void> {
    await unlink(this.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
