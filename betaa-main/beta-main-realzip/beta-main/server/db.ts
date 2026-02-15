import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../shared/schema.ts";
import { sql } from "drizzle-orm";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure we use absolute path for SQLite file
const dbPath = path.resolve(__dirname, "../local.db");
const url = process.env.SQLITE_DB_URL || `file:${dbPath}`;

const client = createClient({
  url,
});

export const db = drizzle(client, { schema });

export const isBackupEnabled = false;

export const pool = { 
        query: async (text: string, params: any[]) => {
                try {
                        if (text.toLowerCase().startsWith('select')) {
                                const result = await db.run(sql.raw(text));
                                return { rows: (result as any).rows || [] };
                        }
                        return { rows: [] };
                } catch (e) {
                        console.error("Pool query error:", e);
                        return { rows: [] };
                }
        }
} as any;
