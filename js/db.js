/**
 * TIME NOTE V1 - IndexedDB Storage Layer
 */

const DB_NAME = 'TimeNoteDB';
const DB_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  { id: 'sleep', name: '睡眠', icon: '😴', color: '#22c55e', sortOrder: 1, enabled: true },
  { id: 'walk', name: 'WALK', icon: '🚶', color: '#06b6d4', sortOrder: 2, enabled: true },
  { id: 'ai', name: 'AI', icon: '🤖', color: '#3b82f6', sortOrder: 3, enabled: true },
  { id: 'sns', name: 'SNS', icon: '📱', color: '#ef4444', sortOrder: 4, enabled: true },
  { id: 'uber', name: 'Uber', icon: '🚴', color: '#f97316', sortOrder: 5, enabled: true },
  { id: 'other', name: 'その他', icon: '⋯', color: '#a855f7', sortOrder: 6, enabled: true }
];

class TimeNoteDB {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Categories store
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('sortOrder', 'sortOrder', { unique: false });
        }

        // Records store
        if (!db.objectStoreNames.contains('records')) {
          const recStore = db.createObjectStore('records', { keyPath: 'id' });
          recStore.createIndex('startAt', 'startAt', { unique: false });
          recStore.createIndex('categoryId', 'categoryId', { unique: false });
          recStore.createIndex('endAt', 'endAt', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this._seedCategories();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });

    return this.initPromise;
  }

  async _seedCategories() {
    const cats = await this.getCategories();
    const tx = this.db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');

    if (cats.length === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        store.put(cat);
      }
    } else {
      // Safe incremental migration: add missing categories (e.g. walk), update 'other' icon if '◯'
      for (const defaultCat of DEFAULT_CATEGORIES) {
        const existing = cats.find(c => c.id === defaultCat.id);
        if (!existing) {
          store.put(defaultCat);
        } else {
          let updated = false;
          if (existing.id === 'other' && (existing.icon === '◯' || existing.icon === '○')) {
            existing.icon = '⋯';
            updated = true;
          }
          if (existing.sortOrder !== defaultCat.sortOrder) {
            existing.sortOrder = defaultCat.sortOrder;
            updated = true;
          }
          if (updated) {
            store.put(existing);
          }
        }
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCategories() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('categories', 'readonly');
      const store = tx.objectStore('categories');
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getCategoryById(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('categories', 'readonly');
      const store = tx.objectStore('categories');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllRecords() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result || [];
        records.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getActiveRecord() {
    const records = await this.getAllRecords();
    const active = records.filter(r => !r.endAt);
    if (active.length === 0) return null;
    // 整合性チェック: もし万が一複数稼働中があれば、最新以外を閉じる安全策
    if (active.length > 1) {
      active.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      const latest = active[active.length - 1];
      for (let i = 0; i < active.length - 1; i++) {
        active[i].endAt = latest.startAt;
        active[i].updatedAt = new Date().toISOString();
        await this._putRecordDirect(active[i]);
      }
      return latest;
    }
    return active[0];
  }

  async _putRecordDirect(record) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  }

  // 1タップ切替・停止ロジック
  async switchOrStopCategory(targetCategoryId, customDate = new Date()) {
    const active = await this.getActiveRecord();
    const nowIso = customDate.toISOString();

    if (active) {
      if (active.categoryId === targetCategoryId) {
        // 同じカテゴリを押した: 停止して未記録状態へ
        active.endAt = nowIso;
        active.updatedAt = nowIso;
        await this._putRecordDirect(active);
        return { action: 'stopped', record: active };
      } else {
        // 別カテゴリを押した: 現在カテゴリを終了し、新カテゴリを開始
        active.endAt = nowIso;
        active.updatedAt = nowIso;
        await this._putRecordDirect(active);

        const newRecord = {
          id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          categoryId: targetCategoryId,
          startAt: nowIso,
          endAt: null,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await this._putRecordDirect(newRecord);
        return { action: 'switched', previous: active, current: newRecord };
      }
    } else {
      // 停止中からカテゴリを押した: 開始
      const newRecord = {
        id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        categoryId: targetCategoryId,
        startAt: nowIso,
        endAt: null,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      await this._putRecordDirect(newRecord);
      return { action: 'started', current: newRecord };
    }
  }

  async stopActive(customDate = new Date()) {
    const active = await this.getActiveRecord();
    if (!active) return null;
    const nowIso = customDate.toISOString();
    active.endAt = nowIso;
    active.updatedAt = nowIso;
    await this._putRecordDirect(active);
    return active;
  }

  // 重複チェック
  // [startMs, endMs] が他のレコード [other.start, other.end] と重なっているか検査
  async checkOverlap(candidateRecord) {
    const all = await this.getAllRecords();
    const candStart = new Date(candidateRecord.startAt).getTime();
    const candEnd = candidateRecord.endAt ? new Date(candidateRecord.endAt).getTime() : Date.now();

    if (candEnd <= candStart) {
      return { hasOverlap: true, reason: '終了時刻は開始時刻より後である必要があります。' };
    }

    for (const rec of all) {
      if (rec.id === candidateRecord.id) continue;
      const recStart = new Date(rec.startAt).getTime();
      const recEnd = rec.endAt ? new Date(rec.endAt).getTime() : Date.now();

      // 区間重複条件: (StartA < EndB) and (EndA > StartB)
      if (candStart < recEnd && candEnd > recStart) {
        return {
          hasOverlap: true,
          conflictingRecord: rec,
          reason: `他の記録（${new Date(recStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} 〜 ${new Date(recEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}）と時間が重複しています。`
        };
      }
    }

    return { hasOverlap: false };
  }

  // 履歴の編集・新規保存
  async saveRecord(record) {
    await this.init();
    const overlapResult = await this.checkOverlap(record);
    if (overlapResult.hasOverlap) {
      throw new Error(overlapResult.reason);
    }
    record.updatedAt = new Date().toISOString();
    return this._putRecordDirect(record);
  }

  // レコード削除
  async deleteRecord(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // レコード単体取得
  async getRecordById(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // バックアップ・復元用データエクスポート
  async exportBackup() {
    const categories = await this.getCategories();
    const records = await this.getAllRecords();
    return {
      version: 1,
      appName: 'TIME NOTE',
      exportedAt: new Date().toISOString(),
      categories,
      records
    };
  }

  // バックアップ復元
  async importBackup(data) {
    if (!data || !Array.isArray(data.records)) {
      throw new Error('無効なバックアップデータ形式です。');
    }

    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['records', 'categories'], 'readwrite');
      const recStore = tx.objectStore('records');
      const catStore = tx.objectStore('categories');

      recStore.clear();

      for (const rec of data.records) {
        recStore.put(rec);
      }

      if (Array.isArray(data.categories) && data.categories.length > 0) {
        catStore.clear();
        for (const cat of data.categories) {
          catStore.put(cat);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const db = new TimeNoteDB();
