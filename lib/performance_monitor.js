import { monitor } from "./monitor";

let lastFrame = performance.now();
let frameCount = 0;
let rafId = null;

function updateFPS(now) {
  frameCount++;
  if (now - lastFrame >= 1000) {
    monitor.fps = frameCount;
    frameCount = 0;
    lastFrame = now;
  }
  rafId = requestAnimationFrame(updateFPS);
}

export function startFPSMonitor() {
  if (rafId !== null) {
    // Already started
    return;
  }
  lastFrame = performance.now();
  frameCount = 0;
  rafId = requestAnimationFrame(updateFPS);
}

export function stopFPSMonitor() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// Track tab visibility
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    monitor.tabVisible = document.visibilityState === "visible";
    monitor.lastFrontendHeartbeat = Date.now();
  });

  // Initial state
  monitor.tabVisible = document.visibilityState === "visible";
  monitor.lastFrontendHeartbeat = Date.now();
}

