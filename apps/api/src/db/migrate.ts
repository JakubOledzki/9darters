import { migrate } from "drizzle-orm/mysql2/migrator";
import { db, pool } from "./client.js";

await migrate(db, { migrationsFolder: "drizzle" });
await pool.end();
