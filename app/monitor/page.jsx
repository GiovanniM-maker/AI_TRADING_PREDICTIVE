"use client";

import { useEffect, useState } from "react";
import { runtimeMonitor } from "@/lib/runtime_monitor";

export default function MonitorPage() {
  const [state, setState] = useState(() => ({
    fullFetchCount: 0,
    incrementalFetchCount: 0,
    pollingCount: 0,
    cacheReads: 0,
    cacheWrites: 0,
    graphUpdates: 0,
    indicatorUpdates: 0,
  }));

  useEffect(() => {
    // Update every 1 second
    const id = setInterval(() => {
      if (typeof window !== "undefined" && window.RUNTIME_MONITOR) {
        const monitor = window.RUNTIME_MONITOR;
        setState({
          fullFetchCount: monitor.fullFetchCount || 0,
          incrementalFetchCount: monitor.incrementalFetchCount || 0,
          pollingCount: monitor.pollingCount || 0,
          cacheReads: monitor.cacheReads || 0,
          cacheWrites: monitor.cacheWrites || 0,
          graphUpdates: monitor.graphUpdates || 0,
          indicatorUpdates: monitor.indicatorUpdates || 0,
        });
      } else if (runtimeMonitor) {
        // Fallback to direct import
        setState({
          fullFetchCount: runtimeMonitor.fullFetchCount || 0,
          incrementalFetchCount: runtimeMonitor.incrementalFetchCount || 0,
          pollingCount: runtimeMonitor.pollingCount || 0,
          cacheReads: runtimeMonitor.cacheReads || 0,
          cacheWrites: runtimeMonitor.cacheWrites || 0,
          graphUpdates: runtimeMonitor.graphUpdates || 0,
          indicatorUpdates: runtimeMonitor.indicatorUpdates || 0,
        });
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">📊 Runtime Monitor</h1>
        <p className="text-gray-400 mb-8">Simple, client-side only monitoring</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fetch Operations */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-blue-400">Fetch Operations</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">Full Fetches</p>
                <p className="text-3xl font-bold text-blue-400">
                  {state.fullFetchCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Incremental Fetches</p>
                <p className="text-3xl font-bold text-green-400">
                  {state.incrementalFetchCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Polling Events</p>
                <p className="text-3xl font-bold text-yellow-400">
                  {state.pollingCount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Cache Operations */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-orange-400">Cache Operations</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">Cache Reads</p>
                <p className="text-3xl font-bold text-orange-400">
                  {state.cacheReads.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Cache Writes</p>
                <p className="text-3xl font-bold text-orange-300">
                  {state.cacheWrites.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Graph Updates */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-purple-400">Graph Updates</h2>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">History Updates</p>
                <p className="text-3xl font-bold text-purple-400">
                  {state.graphUpdates.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Indicator Updates</p>
                <p className="text-3xl font-bold text-purple-300">
                  {state.indicatorUpdates.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400">Summary</h2>
            <div className="space-y-2 text-sm">
              <p className="text-gray-400">
                Total Operations:{" "}
                <span className="text-white font-bold">
                  {(
                    state.fullFetchCount +
                    state.incrementalFetchCount +
                    state.pollingCount +
                    state.cacheReads +
                    state.cacheWrites +
                    state.graphUpdates +
                    state.indicatorUpdates
                  ).toLocaleString()}
                </span>
              </p>
              <p className="text-gray-400">
                Last Update: <span className="text-white">{new Date().toLocaleTimeString()}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
