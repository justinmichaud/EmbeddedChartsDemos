const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const width = 800;
const height = 800;
// Handle HiDPI displays
const dpr = window.devicePixelRatio || 1;
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width / dpr}px`;
canvas.style.height = `${height / dpr}px`;
ctx.scale(1.0 / dpr, 1.0 / dpr);
// FPS counter
let fpsElement = document.getElementById('fps') as HTMLDivElement;
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 0;

// Parameterized trail: start time for the fading trail
let trailStartTime = performance.now();

function animate() {
  const currentTime = performance.now();

  // Calculate FPS
  frameCount++;
  if (currentTime - lastFrameTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (currentTime - lastFrameTime));
    fpsElement.textContent = `FPS: ${fps}`;
    frameCount = 0;
    lastFrameTime = currentTime;
  }

  const trailDuration = 3000.0; // 3 seconds of trail

  // Update trail start time to maintain length
  const maxTrailTime = trailDuration;
  if (currentTime - trailStartTime > maxTrailTime) {
    trailStartTime = currentTime - maxTrailTime;
  }

  // Clear canvas with black background
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  // Draw the parameterized sine wave trail
  const segments = width * 2; // Number of segments for smooth curve
  const timeStep = maxTrailTime / segments;

  ctx.strokeStyle = 'white';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let lastX = -1;
  let lastY = -1;

  for (let i = 0; i <= segments; i++) {
    const t = trailStartTime + (i * timeStep);
    const age = currentTime - t;
    const progress = age / trailDuration;

    // Fade out exponentially over time (newer = brighter)
    const alpha = Math.exp(-progress * 15); // Exponential decay with factor 1.5
    ctx.globalAlpha = alpha;

    // Parameterized sine wave
    const animationTime = t * 0.005; // animation speed
    const x = (animationTime * 50) % width;
    const y = (height / 2) + Math.sin(animationTime) * height * 0.95 / 2;

    // Handle wrap-around: if x jumped backward significantly, reset last position
    if (lastX !== -1 && x < lastX - width * 0.5) {
      lastX = -1;
      lastY = -1;
    }

    // Draw line segment from last position to current
    if (lastX !== -1 && lastY !== -1) {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    lastX = x;
    lastY = y;
  }

  // Draw bright leading point
  ctx.globalAlpha = 1;
  const currentAnimationTime = currentTime * 0.005;
  const currentX = (currentAnimationTime * 50) % width;
  const currentY = (height / 2) + Math.sin(currentAnimationTime) * height * 0.95 / 2;

  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(animate);
}

animate();

// Hot reload for development
if (DEVELOPMENT) {
  let lastHash = 0;
  setInterval(async () => {
    try {
      const response = await fetch(`dist/index.js?t=${Date.now()}`);
      const text = await response.text();
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
      }
      if (lastHash && hash !== lastHash) {
        location.reload();
      }
      lastHash = hash;
    } catch (e) {
      // Ignore errors during development
    }
  }, 500);
}