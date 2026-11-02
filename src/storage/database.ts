import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { migrateDatabase } from "./schema.js";

export class PiLinkDatabase {
  readonly connection: Database.Database;

  constructor(filename: string) {
    const resolved = filename === ":memory:" ? filename : resolve(filename);
    if (resolved !== ":memory:") mkdirSync(dirname(resolved), { recursive: true });
    this.connection = new Database(resolved);
    this.connection.pragma("foreign_keys = ON");
    if (resolved !== ":memory:") this.connection.pragma("journal_mode = WAL");
    migrateDatabase(this.connection);
  }

  close(): void {
    this.connection.close();
  }
}

export function openDatabase(filename: string): PiLinkDatabase {
  return new PiLinkDatabase(filename);
}
