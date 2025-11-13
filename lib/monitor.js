export const monitor = {
  // Firestore operations
  firestoreReads: 0,
  firestoreWrites: 0,
  firestoreErrors: 0,
  firestoreLastReadTime: null,
  firestoreLastWriteTime: null,

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

