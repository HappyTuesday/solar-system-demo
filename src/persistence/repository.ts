import type { BuildRecord } from '../types';

const STORAGE_KEY = 'solar_build_records';
const MAX_RECORDS = 20;

function readRecords(): BuildRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BuildRecord[];
  } catch {
    return [];
  }
}

function writeRecords(records: BuildRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // QuotaExceededError or localStorage unavailable — silently ignore
  }
}

export function saveRecord(record: BuildRecord): void {
  const records = readRecords();
  const idx = records.findIndex(r => r.id === record.id);
  if (idx !== -1) {
    records[idx] = record;
  } else {
    records.unshift(record);
  }
  writeRecords(records.slice(0, MAX_RECORDS));
}

export function loadRecord(id: string): BuildRecord | null {
  const records = readRecords();
  return records.find(r => r.id === id) ?? null;
}

export function listRecords(): BuildRecord[] {
  return readRecords();
}

export function deleteRecord(id: string): void {
  const records = readRecords().filter(r => r.id !== id);
  writeRecords(records);
}

export function getBestScores(limit: number = 10): BuildRecord[] {
  return readRecords()
    .filter(r => r.status === 'completed')
    .sort((a, b) => {
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      if (b.score !== a.score) return b.score - a.score;
      return (a.buildTimeMs ?? 0) - (b.buildTimeMs ?? 0);
    })
    .slice(0, limit);
}
