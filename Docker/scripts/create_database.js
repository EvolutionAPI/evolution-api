#!/usr/bin/env node
/**
 * Ensures the target database exists before running migrations.
 * Connects to the server's default admin database, checks if the target
 * database is present, and creates it if not.
 *
 * Runs as a non-fatal pre-migration step: if the user lacks CREATE DATABASE
 * permission (managed DB, read-only replica, etc.) the error is logged as a
 * warning and the process exits 0 so the migration attempt still proceeds.
 *
 * Supported providers: postgresql, psql_bouncer, mysql
 */

'use strict';

const provider = process.env.DATABASE_PROVIDER ?? 'postgresql';
const uri = process.env.DATABASE_CONNECTION_URI;

if (!uri) {
  console.error('[create_database] DATABASE_CONNECTION_URI is not set — skipping auto-create.');
  process.exit(0);
}

async function ensurePostgresDatabase() {
  const { Pool } = require('pg');

  const url = new URL(uri);
  const dbName = decodeURIComponent(url.pathname.slice(1));

  if (!dbName) {
    console.warn('[create_database] Could not parse database name from URI — skipping.');
    return;
  }

  // Connect to the server admin database to check / create the target DB
  const adminUrl = new URL(uri);
  adminUrl.pathname = '/postgres';
  // Strip any search params that are schema-specific (not relevant for admin conn)
  adminUrl.search = '';

  const pool = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 10000 });

  try {
    const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);

    if (result.rowCount === 0) {
      console.log(`[create_database] Database "${dbName}" not found. Creating...`);
      // Identifier cannot be parameterized — validate it is a plain name first
      if (!/^[\w-]+$/.test(dbName)) {
        throw new Error(`Refusing to CREATE DATABASE: name "${dbName}" contains unsafe characters.`);
      }
      await pool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[create_database] Database "${dbName}" created successfully.`);
    } else {
      console.log(`[create_database] Database "${dbName}" already exists — skipping creation.`);
    }
  } finally {
    await pool.end();
  }
}

async function ensureMysqlDatabase() {
  // mysql2 is a transitive dep via @prisma/adapter-mariadb; attempt to load it
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    console.warn('[create_database] mysql2 not available — skipping auto-create for MySQL.');
    return;
  }

  const url = new URL(uri);
  const dbName = decodeURIComponent(url.pathname.slice(1));

  if (!dbName) {
    console.warn('[create_database] Could not parse database name from URI — skipping.');
    return;
  }

  if (!/^[\w-]+$/.test(dbName)) {
    throw new Error(`Refusing to CREATE DATABASE: name "${dbName}" contains unsafe characters.`);
  }

  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    connectTimeout: 10000,
  });

  try {
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`[create_database] Database "${dbName}" ensured.`);
  } finally {
    await connection.end();
  }
}

(async () => {
  try {
    if (provider === 'mysql') {
      await ensureMysqlDatabase();
    } else {
      await ensurePostgresDatabase();
    }
  } catch (err) {
    console.warn(`[create_database] Warning: could not auto-create database: ${err.message}`);
    console.warn('[create_database] Proceeding — migration will fail with a clear error if the DB is truly missing.');
    process.exit(0);
  }
})();
