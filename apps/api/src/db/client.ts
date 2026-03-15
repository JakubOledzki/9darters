import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { config } from "../config.js";

export const pool = mysql.createPool({
  uri: config.databaseUrl,
  connectionLimit: 10
});

export const db = drizzle(pool);

export type Database = typeof db;
