'use strict';

/**
 * Simple migration runner.
 * Reads SQL files in order and executes them against the configured database.
 * Idempotent — uses IF NOT EXISTS in all DDL statements.
 *
 * Usage:  node migrations/run_migrations.js
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME     || 'r1_wheelchair_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const MIGRATIONS_DIR = path.join(__dirname);

const getMigrationFiles = () => {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Alphabetical = numerical order (001_, 002_, ...)
};

const run = async () => {
  const client = await pool.connect();

  try {
    console.log('Running migrations...\n');

    const files = getMigrationFiles();

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`→ Applying: ${file}`);
      await client.query(sql);
      console.log(`  ✓ Done\n`);
    }

    console.log('All migrations applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

run();
