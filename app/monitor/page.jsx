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

export default function MonitorPage() {
  const [state, setState] = useState({ ...monitor });

  useEffect(() => {
    const id = setInterval(() => {
      setState({ ...monitor });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const getColor = (value, thresholds) => {
    if (value >= thresholds.good) return "text-green-400";
    if (value >= thresholds.warning) return "text-yellow-400";
    return "text-red-400";
  };

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
                <p className={`text-2xl font-bold ${getColor(state.firestoreReads, { good: 0, warning: 1000 })}`}>
                  {state.firestoreReads.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Writes</p>
                <p className={`text-2xl font-bold ${getColor(state.firestoreWrites, { good: 0, warning: 100 })}`}>
                  {state.firestoreWrites.toLocaleString()}
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

          {/* Polling Section */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-purple-400">Polling & Fetches</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">Full Fetches</p>
                <p className="text-2xl font-bold text-blue-400">
                  {state.fullFetchCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Incremental Fetches</p>
                <p className="text-2xl font-bold text-green-400">
                  {state.incrementalFetchCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Polling Events</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {state.pollingEvents.toLocaleString()}
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
                <p className={`text-2xl font-bold ${getColor(state.fps, { good: 30, warning: 20 })}`}>
                  {state.fps}
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
          {state.errors.length === 0 ? (
            <p className="text-gray-400">No errors recorded</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {state.errors.slice().reverse().map((error, index) => (
                <div
                  key={index}
                  className="bg-gray-800 border border-red-900/50 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-red-400 font-semibold">{error.message}</p>
                    <p className="text-gray-500 text-xs">{formatDate(error.time)}</p>
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
                {state.firestoreReads.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ~${(state.firestoreReads * 0.00006).toFixed(4)} (at $0.06/100k reads)
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Writes</p>
              <p className="text-2xl font-bold text-white">
                {state.firestoreWrites.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ~${(state.firestoreWrites * 0.00018).toFixed(4)} (at $0.18/100k writes)
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Estimated Total</p>
              <p className="text-2xl font-bold text-yellow-400">
                ${((state.firestoreReads * 0.00006) + (state.firestoreWrites * 0.00018)).toFixed(4)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Current session estimate</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

