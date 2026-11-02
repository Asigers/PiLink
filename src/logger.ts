import type { AppConfig } from "./config.js";

type Level = "debug" | "info" | "warn" | "error";
const rank: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  constructor(private readonly minimumLevel: Level = "info") {}

  private write(level: Level, message: string, context?: Record<string, unknown>): void {
    if (rank[level] < rank[this.minimumLevel]) return;
    const suffix = context ? " " + JSON.stringify(context) : "";
    const line = new Date().toISOString() + " [" + level.toUpperCase() + "] " + message + suffix;
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  }

  debug(message: string, context?: Record<string, unknown>): void { this.write("debug", message, context); }
  info(message: string, context?: Record<string, unknown>): void { this.write("info", message, context); }
  warn(message: string, context?: Record<string, unknown>): void { this.write("warn", message, context); }
  error(message: string, context?: Record<string, unknown>): void { this.write("error", message, context); }
}

export function createLogger(config: AppConfig): Logger {
  return new Logger(config.app.logLevel);
}
