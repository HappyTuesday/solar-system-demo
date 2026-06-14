import { create } from 'zustand';
import type { BuildRecord } from '../types';
import { listRecords, saveRecord, loadRecord } from '../persistence/repository';

interface HistoryStore {
  records: BuildRecord[];
  currentRecordId: string | null;
  loadRecords: () => void;
  saveCurrentRecord: (record: BuildRecord) => void;
  switchToRecord: (id: string) => BuildRecord | null;
  setCurrentRecordId: (id: string | null) => void;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  records: [],
  currentRecordId: null,

  loadRecords: () => {
    const records = listRecords();
    set({ records });
  },

  saveCurrentRecord: (record) => {
    saveRecord(record);
  },

  switchToRecord: (id) => {
    const record = loadRecord(id);
    if (record) {
      set({ currentRecordId: id });
      return record;
    }
    return null;
  },

  setCurrentRecordId: (id) => set({ currentRecordId: id }),
}));
