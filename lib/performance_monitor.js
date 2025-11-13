let lastFrame = performance.now();
let frameCount = 0;
let rafId = null;

function updateFPS(now) {
  frameCount++;
  if (now - lastFrame >= 1000) {
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

