"use client";

// Global runtime monitor - SINGLE INSTANCE ONLY
// Stored in window for guaranteed single instance across all modules
export const runtimeMonitor = {
  fullFetchCount: 0,
  incrementalFetchCount: 0,
  pollingCount: 0,
  cacheReads: 0,
  cacheWrites: 0,
  graphUpdates: 0,
  indicatorUpdates: 0,
};

// Store in window to guarantee single instance
if (typeof window !== "undefined") {
  window.RUNTIME_MONITOR = runtimeMonitor;
  console.log("[RUNTIME_MONITOR] Initialized:", runtimeMonitor);
}

