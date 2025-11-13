"use client";

import { useEffect, useState } from "react";
import { monitor } from "@/lib/monitor";

function formatTime(timestamp) {
  if (!timestamp) return "Never";
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 1000) return "Just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return date.toLocaleTimeString();
}

function formatDate(timestamp) {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleString();
}

// Safe copy function to avoid reference issues
function getMonitorSnapshot() {
  // Ensure monitor is accessible
  if (typeof monitor === "undefined") {
    console.error("[Monitor] monitor object is undefined!");
    return {
      firestoreReads: 0,
      firestoreWrites: 0,
      firestoreErrors: 0,
      firestoreLastReadTime: null,
      firestoreLastWriteTime: null,
      cacheReads: 0,
      cacheWrites: 0,
      fullFetchCount: 0,
      incrementalFetchCount: 0,
      pollingEvents: 0,
      lastFullFetchTimestamp: null,
      lastIncrementalTimestamp: null,
      lastFrontendHeartbeat: null,
      tabVisible: true,
      fps: 0,
      errors: [],
    };
  }
  
  return {
    firestoreReads: monitor.firestoreReads || 0,
    firestoreWrites: monitor.firestoreWrites || 0,
    firestoreErrors: monitor.firestoreErrors || 0,
    firestoreLastReadTime: monitor.firestoreLastReadTime || null,
    firestoreLastWriteTime: monitor.firestoreLastWriteTime || null,
    cacheReads: monitor.cacheReads || 0,
    cacheWrites: monitor.cacheWrites || 0,
    fullFetchCount: monitor.fullFetchCount || 0,
    incrementalFetchCount: monitor.incrementalFetchCount || 0,
    pollingEvents: monitor.pollingEvents || 0,
    lastFullFetchTimestamp: monitor.lastFullFetchTimestamp || null,
    lastIncrementalTimestamp: monitor.lastIncrementalTimestamp || null,
    lastFrontendHeartbeat: monitor.lastFrontendHeartbeat || null,
    tabVisible: monitor.tabVisible !== undefined ? monitor.tabVisible : true,
    fps: monitor.fps || 0,
    errors: Array.isArray(monitor.errors) ? [...monitor.errors] : [],
  };
}

export default function MonitorPage() {
  const [state, setState] = useState(() => getMonitorSnapshot());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Initialize heartbeat on mount
    if (typeof monitor !== "undefined") {
      monitor.lastFrontendHeartbeat = Date.now();
      // Debug: log monitor state
      console.log("[Monitor] Initial state:", {
        firestoreReads: monitor.firestoreReads,
        fullFetchCount: monitor.fullFetchCount,
        incrementalFetchCount: monitor.incrementalFetchCount,
      });
    }
    
    // Update state immediately
    setState(getMonitorSnapshot());
    
    // Then update every 1 second
    const id = setInterval(() => {
      try {
        const snapshot = getMonitorSnapshot();
        setState(snapshot);
      } catch (err) {
        console.error("Error updating monitor state:", err);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const getColor = (value, thresholds) => {
    if (value >= thresholds.good) return "text-green-400";
    if (value >= thresholds.warning) return "text-yellow-400";
    return "text-red-400";
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading Monitor...</h1>
          <p className="text-gray-400">Initializing monitoring dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">🔥 Monitoring Dashboard</h1>
        <p className="text-gray-400 mb-8">Local & Free - Zero Cost Monitoring</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Firestore Section */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400">Firestore</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">Reads</p>
                <p className={`text-2xl font-bold ${getColor(state.firestoreReads || 0, { good: 0, warning: 1000 })}`}>
                  {(state.firestoreReads || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Writes</p>
                <p className={`text-2xl font-bold ${getColor(state.firestoreWrites || 0, { good: 0, warning: 100 })}`}>
                  {(state.firestoreWrites || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Errors</p>
                <p className={`text-2xl font-bold ${getColor(state.firestoreErrors, { good: 0, warning: 1 })}`}>
                  {state.firestoreErrors}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Last Read</p>
                <p className="text-sm text-gray-300">{formatTime(state.firestoreLastReadTime)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Last Write</p>
                <p className="text-sm text-gray-300">{formatTime(state.firestoreLastWriteTime)}</p>
              </div>
            </div>
          </div>

          {/* Cache Section */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-orange-400">Cache (IndexedDB)</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">Cache Reads</p>
                <p className="text-2xl font-bold text-orange-400">
                  {(state.cacheReads || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Cache Writes</p>
                <p className="text-2xl font-bold text-orange-300">
                  {(state.cacheWrites || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Polling Section */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-purple-400">Polling & Fetches</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">Full Fetches</p>
                <p className="text-2xl font-bold text-blue-400">
                  {(state.fullFetchCount || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Incremental Fetches</p>
                <p className="text-2xl font-bold text-green-400">
                  {(state.incrementalFetchCount || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Polling Events</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {(state.pollingEvents || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Last Full Fetch</p>
                <p className="text-sm text-gray-300">{formatTime(state.lastFullFetchTimestamp)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Last Incremental</p>
                <p className="text-sm text-gray-300">{formatTime(state.lastIncrementalTimestamp)}</p>
              </div>
            </div>
          </div>

          {/* Performance Section */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-green-400">Performance</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">FPS</p>
                <p className={`text-2xl font-bold ${getColor(state.fps || 0, { good: 30, warning: 20 })}`}>
                  {state.fps || 0}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Tab Visible</p>
                <p className={`text-2xl font-bold ${state.tabVisible ? "text-green-400" : "text-red-400"}`}>
                  {state.tabVisible ? "✓ Yes" : "✗ No"}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Last Heartbeat</p>
                <p className="text-sm text-gray-300">{formatTime(state.lastFrontendHeartbeat)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Error Log Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4 text-red-400">Error Log</h2>
          {!state.errors || state.errors.length === 0 ? (
            <p className="text-gray-400">No errors recorded</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {state.errors.slice().reverse().map((error, index) => (
                <div
                  key={index}
                  className="bg-gray-800 border border-red-900/50 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-red-400 font-semibold">{error?.message || "Unknown error"}</p>
                    <p className="text-gray-500 text-xs">{formatDate(error?.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cost Estimation */}
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4 text-yellow-400">Cost Estimation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-400 text-sm">Total Reads</p>
              <p className="text-2xl font-bold text-white">
                {(state.firestoreReads || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ~${((state.firestoreReads || 0) * 0.00006).toFixed(4)} (at $0.06/100k reads)
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Writes</p>
              <p className="text-2xl font-bold text-white">
                {(state.firestoreWrites || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ~${((state.firestoreWrites || 0) * 0.00018).toFixed(4)} (at $0.18/100k writes)
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Estimated Total</p>
              <p className="text-2xl font-bold text-yellow-400">
                ${(((state.firestoreReads || 0) * 0.00006) + ((state.firestoreWrites || 0) * 0.00018)).toFixed(4)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Current session estimate</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

