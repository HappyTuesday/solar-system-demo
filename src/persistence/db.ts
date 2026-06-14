import type { Database } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const sqlModule = await import('sql.js');
  const initSqlJs = sqlModule.default;

  if (!initSqlJs) throw new Error('Failed to load sql.js module');

  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl,
  });

  const database = new SQL.Database();
  db = database;

  database.run(`
    CREATE TABLE IF NOT EXISTS build_records (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'building',
      score REAL,
      build_time_ms INTEGER,
      snapshot TEXT
    )
  `);

  database.run(`CREATE INDEX IF NOT EXISTS idx_created_at ON build_records(created_at DESC)`);

  return database;
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}
