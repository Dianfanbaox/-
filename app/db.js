/* ============================================================
 * Personal Wealth OS 1.0 — 本地数据层 (IndexedDB)
 * 本地优先：所有读写先落本地库；写操作进 sync_queue 供云端同步。
 * 依据：04_数据模型与技术架构.md / 09_云端基础设施与部署文档.md
 * ============================================================ */
(function (global) {
  'use strict';

  const DB_NAME = 'pwos-ui-v3';
  const DB_VERSION = 4;
  const SCHEMA_VERSION = 1;
  const CALC_VERSION = 1;

  const STORES = [
    'assets', 'snapshots', 'income', 'expense', 'specialEvents',
    'investments', 'loans', 'goals', 'goalHistory', 'forecasts',
    'fxRates', 'recurring', 'calcSnapshots', 'syncQueue', 'meta',
  ];
  // 需要的索引：[store, key]
  const INDEXES = [
    ['income', 'month'], ['expense', 'month'],
    ['snapshots', 'month'], ['snapshots', 'assetId'],
    ['investments', 'month'], ['loans', 'month'],
    ['recurring', 'type'], ['calcSnapshots', 'month'],
    ['specialEvents', 'month'], ['syncQueue', 'status'],
  ];

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction; // 版本变更事务
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
        INDEXES.forEach(([s, k]) => {
          try {
            if (!db.objectStoreNames.contains(s)) return;
            const os = tx.objectStore(s);
            if (!os.indexNames.contains(k)) os.createIndex(k, k);
          } catch (err) { /* 索引失败不阻断 */ }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const os = t.objectStore(store);
      const out = fn(os);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const genId = () => {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  // ---------- 通用 CRUD ----------
  const DB = {
    open: openDB,

    put(store, obj) { return tx(store, 'readwrite', os => os.put(obj)); },
    bulkPut(store, arr) { return tx(store, 'readwrite', os => { arr.forEach(o => os.put(o)); return arr.length; }); },
    get(store, id) { return tx(store, 'readonly', os => new Promise((res, rej) => { const r = os.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
    del(store, id) { return tx(store, 'readwrite', os => os.delete(id)); },
    all(store) { return tx(store, 'readonly', os => new Promise((res, rej) => { const r = os.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); })); },
    byIndex(store, index, value) {
      return tx(store, 'readonly', os => new Promise((res, rej) => {
        const r = os.index(index).getAll(value);
        r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
      }));
    },
    clear(store) { return tx(store, 'readwrite', os => os.clear()); },

    // meta 键值
    async getMeta(key) { const v = await DB.get('meta', key); return v ? v.value : undefined; },
    async setMeta(key, value) { await DB.put('meta', { id: key, value }); },

    genId,
    SCHEMA_VERSION,
    CALC_VERSION,
  };

  // ---------- 同步队列 ----------
  const Sync = {
    async enqueue(entityType, entityId, operation, payload) {
      await DB.put('syncQueue', {
        id: genId(), entityType, entityId, operation,
        payload: payload || null, created_at: new Date().toISOString(),
        retry_count: 0, last_error: null, status: 'pending',
      });
    },
    async listPending() { return DB.byIndex('syncQueue', 'status', 'pending'); },
    async markSuccess(id) { await DB.del('syncQueue', id); },
    async markFailed(id, err) {
      const item = await DB.get('syncQueue', id);
      if (!item) return;
      item.retry_count = (item.retry_count || 0) + 1;
      item.last_error = String(err).slice(0, 500);
      item.status = item.retry_count >= 5 ? 'failed' : 'pending';
      await DB.put('syncQueue', item);
    },
  };

  // ---------- 数据导出 / 导入 ----------
  async function exportAll() {
    const data = {};
    for (const s of STORES) {
      if (s === 'syncQueue') continue;
      data[s] = await DB.all(s);
    }
    const meta = {
      app_version: '1.0.0',
      schema_version: SCHEMA_VERSION,
      calculation_version: CALC_VERSION,
      export_time: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currency: 'CNY',
    };
    return { data, meta };
  }

  async function importAll(payload) {
    // 先清空业务表，再写入；meta 保留 app 信息
    for (const s of STORES) {
      if (s === 'meta' || s === 'syncQueue') continue;
      await DB.clear(s);
    }
    const data = payload.data || {};
    for (const s of Object.keys(data)) {
      if (STORES.indexOf(s) >= 0 && Array.isArray(data[s])) {
        await DB.bulkPut(s, data[s]);
      }
    }
    return true;
  }

  DB.Sync = Sync;
  DB.exportAll = exportAll;
  DB.importAll = importAll;

  global.PWDB = DB;
})(typeof window !== 'undefined' ? window : globalThis);
