import { monitor } from "./monitor";

const DB_NAME = "market_cache";
const DB_VERSION = 1;
const STORE_NAME = "market_data";

let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

function getKey(type, coin, range) {
  return `${type}::${coin}::${range}`;
}

export async function saveHistory(coin, range, data) {
  try {
    const db = await getDB();
    const key = getKey("history", coin, range);
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = store.put(data, key);
      request.onsuccess = () => {
        monitor.cacheWrites++;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[Cache] Error saving history:", err);
  }
}

export async function loadHistory(coin, range) {
  try {
    const db = await getDB();
    const key = getKey("history", coin, range);
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    return await new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        monitor.cacheReads++;
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[Cache] Error loading history:", err);
    return null;
  }
}

export async function appendHistory(coin, range, newDocs) {
  try {
    const existing = await loadHistory(coin, range);
    if (!existing || !Array.isArray(existing)) {
      // If no existing data, just save new docs
      await saveHistory(coin, range, newDocs);
      return;
    }

    // Merge: avoid duplicates by time
    const existingMap = new Map();
    existing.forEach((item) => {
      if (item?.time) {
        existingMap.set(item.time, item);
      }
    });

    newDocs.forEach((item) => {
      if (item?.time) {
        existingMap.set(item.time, item);
      }
    });

    // Sort by time
    const merged = Array.from(existingMap.values()).sort((a, b) => {
      const timeA = a?.time ? new Date(a.time).getTime() : 0;
      const timeB = b?.time ? new Date(b.time).getTime() : 0;
      return timeA - timeB;
    });

    await saveHistory(coin, range, merged);
  } catch (err) {
    console.error("[Cache] Error appending history:", err);
  }
}

export async function saveIndicators(coin, range, data) {
  try {
    const db = await getDB();
    const key = getKey("indicators", coin, range);
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = store.put(data, key);
      request.onsuccess = () => {
        monitor.cacheWrites++;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[Cache] Error saving indicators:", err);
  }
}

export async function loadIndicators(coin, range) {
  try {
    const db = await getDB();
    const key = getKey("indicators", coin, range);
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    return await new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        monitor.cacheReads++;
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[Cache] Error loading indicators:", err);
    return null;
  }
}

export async function appendIndicators(coin, range, newDocs) {
  try {
    const existing = await loadIndicators(coin, range);
    if (!existing || !Array.isArray(existing)) {
      // If no existing data, just save new docs
      await saveIndicators(coin, range, newDocs);
      return;
    }

    // Merge: avoid duplicates by time
    const existingMap = new Map();
    existing.forEach((item) => {
      if (item?.time) {
        existingMap.set(item.time, item);
      }
    });

    newDocs.forEach((item) => {
      if (item?.time) {
        existingMap.set(item.time, item);
      }
    });

    // Sort by time
    const merged = Array.from(existingMap.values()).sort((a, b) => {
      const timeA = a?.time ? new Date(a.time).getTime() : 0;
      const timeB = b?.time ? new Date(b.time).getTime() : 0;
      return timeA - timeB;
    });

    await saveIndicators(coin, range, merged);
  } catch (err) {
    console.error("[Cache] Error appending indicators:", err);
  }
}

export async function clearMarketCache() {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    console.log("[Cache] Market cache cleared");
  } catch (err) {
    console.error("[Cache] Error clearing cache:", err);
  }
}

