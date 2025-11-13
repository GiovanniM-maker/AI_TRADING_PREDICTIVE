"use client";

import { useEffect } from "react";
import { startFPSMonitor } from "@/lib/performance_monitor";

export default function PerformanceMonitorInit() {
  useEffect(() => {
    startFPSMonitor();
  }, []);

  return null;
}

