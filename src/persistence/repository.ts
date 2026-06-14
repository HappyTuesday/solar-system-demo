import type { BuildRecord } from '../types';
import { getDatabase } from './db';

function rowToRecord(row: Record<string, unknown>): BuildRecord {
  return {
    id: row.id as string,
    createdAt: row.created_at as number,
    completedAt: row.completed_at as number | null,
    status: row.status as BuildRecord['status'],
    score: row.score as number | null,
    buildTimeMs: row.build_time_ms as number | null,
    snapshot: row.snapshot as string,
  };
}

export function saveRecord(record: BuildRecord): void {
  const database = getDatabase();
  database.run(
    `INSERT OR REPLACE INTO build_records (id, created_at, completed_at, status, score, build_time_ms, snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [record.id, record.createdAt, record.completedAt, record.status, record.score, record.buildTimeMs, record.snapshot]
  );
}

export function loadRecord(id: string): BuildRecord | null {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM build_records WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return rowToRecord(row);
  }
  stmt.free();
  return null;
}

export function listRecords(): BuildRecord[] {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM build_records ORDER BY created_at DESC');
  const results: BuildRecord[] = [];
  while (stmt.step()) {
    results.push(rowToRecord(stmt.getAsObject()));
  }
  stmt.free();
  return results;
}

export function deleteRecord(id: string): void {
  const database = getDatabase();
  database.run('DELETE FROM build_records WHERE id = ?', [id]);
}

export function getBestScores(limit: number = 10): BuildRecord[] {
  const database = getDatabase();
  const stmt = database.prepare(
    'SELECT * FROM build_records WHERE status = ? ORDER BY score DESC, build_time_ms ASC LIMIT ?'
  );
  stmt.bind(['completed', limit]);
  const results: BuildRecord[] = [];
  while (stmt.step()) {
    results.push(rowToRecord(stmt.getAsObject()));
  }
  stmt.free();
  return results;
}
