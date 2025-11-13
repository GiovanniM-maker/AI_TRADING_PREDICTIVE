"use client";

// Global singleton monitor object - ONE INSTANCE ONLY
// This object is shared across all modules in the application
export const monitor = {
  // Firestore operations
  firestoreReads: 0,
  firestoreWrites: 0,
  firestoreErrors: 0,
  firestoreLastReadTime: null,
  firestoreLastWriteTime: null,

  // Cache operations
  cacheReads: 0,
  cacheWrites: 0,

  // Polling + fetches
  fullFetchCount: 0,
  incrementalFetchCount: 0,
  pollingEvents: 0,
  lastFullFetchTimestamp: null,
  lastIncrementalTimestamp: null,

  // UI & performance
  lastFrontendHeartbeat: null,
  tabVisible: true,
  fps: 0,

  // Errors
  errors: [],
};

// Log monitor reference on first load (for debugging)
if (typeof window !== "undefined") {
  console.log("[MONITOR INIT] Monitor object created at:", monitor);
  console.log("[MONITOR INIT] Monitor ref:", monitor);
}

export function logError(err) {
  monitor.errors.push({
    message: err?.message || String(err),
    time: Date.now(),
  });
  monitor.firestoreErrors++;
  
  // Keep only last 100 errors to prevent memory issues
  if (monitor.errors.length > 100) {
    monitor.errors.shift();
  }
}

