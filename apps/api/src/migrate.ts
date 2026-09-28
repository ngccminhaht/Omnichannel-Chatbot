import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const migrationsPath = join(fileURLToPath(new URL("../../..", import.meta.url)), "db", "migrations");

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not configured; skipping migrations");
    return;
  }

  if (!pool) throw new Error("DATABASE_URL is not configured");
  const client = await pool.connect();
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  await client.query("SELECT pg_advisory_lock(hashtext('chat2:migrations'))");
  try {
    const files = (await readdir(migrationsPath)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const version = file.split("_")[0];
      const existing = await client.query<{ version: string }>("SELECT version FROM schema_migrations WHERE version = $1", [version]);
      if (existing.rowCount) continue;
      const sql = await readFile(join(migrationsPath, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`Applied migration ${file}`);
    }
    await bootstrapLocalOwner(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('chat2:migrations'))");
    client.release();
  }
}

async function bootstrapLocalOwner(client: import("pg").PoolClient) {
  const userId = process.env.CHAT2_BOOTSTRAP_USER_ID;
  const workspaceId = process.env.CHAT2_BOOTSTRAP_WORKSPACE_ID;
  const email = process.env.CHAT2_BOOTSTRAP_USER_EMAIL;
  if (!userId || !workspaceId || !email) return;
  await client.query(
    `INSERT INTO users(id, email, display_name) VALUES ($1, $2, 'chat2 Owner') ON CONFLICT (id) DO NOTHING`,
    [userId, email],
  );
  await client.query(
    `INSERT INTO workspaces(id, name) VALUES ($1, 'chat2 Local Workspace') ON CONFLICT (id) DO NOTHING`,
    [workspaceId],
  );
  await client.query(
    `INSERT INTO workspace_members(workspace_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId],
  );
}

migrate()
  .then(async () => {
    await pool?.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool?.end();
    process.exitCode = 1;
  });
