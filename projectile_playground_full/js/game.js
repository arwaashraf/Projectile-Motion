// ========= Canvas & DPI =========
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
function fitDPI() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  // set CSS size first
  if (!canvas.style.width) canvas.style.width = "100%";
  if (!canvas.style.height) canvas.style.height = "70vh";
  // then map CSS pixels to actual pixels
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(640, Math.floor(rect.width * dpr));
  canvas.height = Math.max(360, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
new ResizeObserver(fitDPI).observe(canvas);
window.addEventListener("orientationchange", fitDPI);
window.addEventListener("load", fitDPI);
fitDPI();

// ========= UI Elements =========
const angleEl = document.getElementById("angle");
const powerEl = document.getElementById("power");
const gravityEl = document.getElementById("gravity");
const angleVal = document.getElementById("angleVal");
const powerVal = document.getElementById("powerVal");
const gravityVal = document.getElementById("gravityVal");
const windChk = document.getElementById("wind");
const movingChk = document.getElementById("moving");
const obstChk = document.getElementById("obst");
const scoreEl = document.getElementById("score");
const highEl = document.getElementById("high");
const shotsEl = document.getElementById("shots");
const windaxEl = document.getElementById("windax");

angleEl.addEventListener(
  "input",
  () => (angleVal.textContent = angleEl.value + "°")
);
powerEl.addEventListener("input", () => (powerVal.textContent = powerEl.value));
gravityEl.addEventListener(
  "input",
  () => (gravityVal.textContent = gravityEl.value)
);

document.getElementById("launch").onclick = () => shoot();
document.getElementById("reset").onclick = () => resetLevel(true);
document.getElementById("next").onclick = () => nextLevel();
document.getElementById("clearHS").onclick = () => {
  localStorage.removeItem("pp_high");
  highEl.textContent = "0";
};

// ========= Game State =========
const W = () => canvas.clientWidth;
const H = () => canvas.clientHeight;
const launcher = { x: 80, y: () => H() - 60, r: 16 };
let g = +gravityEl.value; // px/s^2 downward
let ax = 0; // wind accel px/s^2
let level = 1;
let score = 0;
let shots = 0;
let projectiles = [];
let targets = [];
let obstacles = [];
let particles = [];
const HIGH_KEY = "pp_high";
highEl.textContent = localStorage.getItem(HIGH_KEY) || "0";

// ========= Utility =========
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => {
  const dx = a.x - b.x,
    dy = a.y - b.y;
  return dx * dx + dy * dy;
};

// ========= Entities =========
function spawnTargets() {
  targets = [];
  const Y = H();
  const picks = [
    { x: rand(W() * 0.45, W() * 0.6), y: Y - rand(140, 220), r: 20 },
    { x: rand(W() * 0.65, W() * 0.8), y: Y - rand(240, 300), r: 24 },
    { x: rand(W() * 0.55, W() * 0.9), y: Y - rand(120, 180), r: 18 },
    { x: rand(W() * 0.35, W() * 0.75), y: Y - rand(260, 340), r: 22 },
  ];
  for (const p of picks)
    targets.push({ ...p, hit: false, moving: false, vx: 0 });
  if (movingChk.checked) {
    const i = Math.floor(Math.random() * targets.length);
    targets[i].moving = true;
    targets[i].vx = rand(40, 80) * (Math.random() < 0.5 ? -1 : 1);
  }
}
function spawnObstacles() {
  obstacles = [];
  if (!obstChk.checked) return;
  obstacles.push({ x: W() * 0.5, y: H() - 160, w: 20, h: 140 });
  obstacles.push({ x: W() * 0.75, y: H() - 200, w: 24, h: 180 });
}

function resetLevel(hard = false) {
  projectiles.length = 0;
  particles.length = 0;
  spawnTargets();
  spawnObstacles();
  if (windChk.checked) ax = rand(-140, 140);
  else ax = 0;
  windaxEl.textContent = ax.toFixed(0);
  if (hard) {
    score = 0;
    level = 1;
    shots = 0;
  }
  scoreEl.textContent = score;
  shotsEl.textContent = shots;
}
function nextLevel() {
  level++;
  g = clamp(+gravityEl.value + level * 10, 400, 1600);
  gravityEl.value = g;
  gravityVal.textContent = g;
  resetLevel(false);
}

// ========= Projectile =========
function shoot(dirFromDrag = null) {
  let theta, v0;
  if (dirFromDrag) {
    theta = Math.atan2(-dirFromDrag.y, dirFromDrag.x);
    theta = clamp(theta, (5 * Math.PI) / 180, (85 * Math.PI) / 180);
    v0 = clamp(Math.hypot(dirFromDrag.x, dirFromDrag.y) * 6, 200, 1200);
    angleEl.value = Math.round((theta * 180) / Math.PI);
    angleVal.textContent = angleEl.value + "°";
    powerEl.value = Math.round(v0);
    powerVal.textContent = powerEl.value;
  } else {
    theta = (+angleEl.value * Math.PI) / 180;
    v0 = +powerEl.value;
  }
  g = +gravityEl.value;
  if (windChk.checked) ax = rand(-140, 140);
  else ax = 0;
  windaxEl.textContent = ax.toFixed(0);

  const now = performance.now() / 1000;
  projectiles.push({
    x: launcher.x,
    y: launcher.y(),
    vx0: Math.cos(theta) * v0,
    vy0: -Math.sin(theta) * v0,
    t0: now,
    alive: true,
  });
  shots++;
  shotsEl.textContent = shots;
}

// ========= Predicted Path (ghost) =========
function samplePath(theta, v0, steps = 40, dt = 0.08) {
  const pts = [];
  let x0 = launcher.x,
    y0 = launcher.y();
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    const x = x0 + Math.cos(theta) * v0 * t + 0.5 * ax * t * t;
    const y = y0 + -Math.sin(theta) * v0 * t + 0.5 * g * t * t;
    if (y > H()) break;
    pts.push({ x, y });
  }
  return pts;
}

// ========= Particles (hit feedback) =========
function spawnHitParticles(x, y, color) {
  for (let i = 0; i < 28; i++) {
    particles.push({
      x,
      y,
      vx: rand(-180, 180),
      vy: rand(-220, -40),
      life: rand(0.4, 0.8),
      t: 0,
      color,
    });
  }
}

// ========= Input (drag to aim/shoot) =========
let dragging = false;
let dragStart = null,
  dragNow = null;
function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x: cx, y: cy };
}
function nearLauncher(p) {
  return dist2(p, { x: launcher.x, y: launcher.y() }) < 900;
}

canvas.addEventListener("mousedown", (e) => {
  const p = getCanvasPos(e);
  if (nearLauncher(p)) {
    dragging = true;
    dragStart = p;
    dragNow = p;
  }
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  dragNow = getCanvasPos(e);
});
window.addEventListener("mouseup", () => {
  if (!dragging) return;
  const dir = { x: dragStart.x - dragNow.x, y: dragStart.y - dragNow.y };
  dragging = false;
  shoot(dir);
});

// Touch
canvas.addEventListener(
  "touchstart",
  (e) => {
    const p = getCanvasPos(e);
    if (nearLauncher(p)) {
      dragging = true;
      dragStart = p;
      dragNow = p;
    }
  },
  { passive: true }
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (dragging) dragNow = getCanvasPos(e);
  },
  { passive: true }
);
canvas.addEventListener("touchend", (e) => {
  if (!dragging) return;
  const dir = { x: dragStart.x - dragNow.x, y: dragStart.y - dragNow.y };
  dragging = false;
  shoot(dir);
});

// Keys
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    shoot();
  }
  if (e.code === "KeyR") resetLevel(true);
  if (e.code === "KeyN") nextLevel();
  if (e.code === "ArrowLeft")
    (angleEl.value = clamp(+angleEl.value + -1, 5, 85)),
      (angleVal.textContent = angleEl.value + "°");
  if (e.code === "ArrowRight")
    (angleEl.value = clamp(+angleEl.value + 1, 5, 85)),
      (angleVal.textContent = angleEl.value + "°");
  if (e.code === "ArrowUp")
    (powerEl.value = clamp(+powerEl.value + 20, 200, 1200)),
      (powerVal.textContent = powerEl.value);
  if (e.code === "ArrowDown")
    (powerEl.value = clamp(+powerEl.value - 20, 200, 1200)),
      (powerVal.textContent = powerEl.value);
});

// ========= Collision Helpers =========
function circleHit(px, py, cx, cy, r) {
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}
function rectHit(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

// ========= Scoring =========
function awardScore(p, target) {
  if (target.hit) return;
  target.hit = true;
  const d = Math.sqrt(dist2(p, target));
  let pts = 100;
  pts += Math.max(0, Math.round((target.r * 1.2 - d) * 2));
  score += pts;
  scoreEl.textContent = score;
  spawnHitParticles(target.x, target.y, "#7bf59b");
  const best = +(localStorage.getItem(HIGH_KEY) || 0);
  if (score > best) {
    localStorage.setItem(HIGH_KEY, score);
    highEl.textContent = score;
  }
}

// ========= Simulation =========
let lastT = performance.now() / 1000;
function step() {
  const now = performance.now() / 1000;
  let dt = now - lastT;
  lastT = now;
  dt = Math.min(dt, 1 / 30);
  g = +gravityEl.value;

  // Move moving target
  for (const t of targets) {
    if (!t.moving) continue;
    t.x += t.vx * dt;
    if (t.x < W() * 0.35 || t.x > W() * 0.95) t.vx *= -1;
  }

  // Integrate projectiles
  for (const p of projectiles) {
    if (!p.alive) continue;
    const t = now - p.t0;
    p.x = launcher.x + p.vx0 * t + 0.5 * ax * t * t;
    p.y = launcher.y() + p.vy0 * t + 0.5 * g * t * t;
    if (p.y > H() + 200 || p.x < -200 || p.x > W() + 200) p.alive = false;

    // obstacle collision
    for (const ob of obstacles) {
      if (rectHit(p.x, p.y, ob.x, ob.y, ob.w, ob.h)) {
        p.alive = false;
        spawnHitParticles(p.x, p.y, "#f7b84f");
      }
    }

    // target collision
    for (const t of targets) {
      if (!t.hit && circleHit(p.x, p.y, t.x, t.y, t.r)) {
        awardScore({ x: p.x, y: p.y }, t);
        p.alive = false;
      }
    }
  }

  // Particles
  for (const q of particles) {
    q.t += dt;
    q.vy += g * dt * 0.6;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
  particles = particles.filter((q) => q.t < q.life);

  draw(now);
  requestAnimationFrame(step);
}

// ========= Render =========
function draw(now) {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  // ground
  ctx.fillStyle = "#0f1219";
  ctx.fillRect(0, H() - 40, W(), 40);

  // obstacles
  if (obstacles.length) {
    ctx.fillStyle = "#f7b84f";
    obstacles.forEach((o) => ctx.fillRect(o.x, o.y, o.w, o.h));
  }

  // launcher base
  ctx.fillStyle = "#2a2f45";
  ctx.beginPath();
  ctx.arc(launcher.x, launcher.y(), 20, 0, Math.PI * 2);
  ctx.fill();

  // predicted path
  let theta = (+angleEl.value * Math.PI) / 180,
    v0 = +powerEl.value;
  if (dragging) {
    const dir = {
      x: dragStart.x - dragNow.x,
      y: dragStart.y - dragNow.y,
    };
    const th = Math.atan2(-dir.y, dir.x);
    theta = clamp(th, (5 * Math.PI) / 180, (85 * Math.PI) / 180);
    v0 = clamp(Math.hypot(dir.x, dir.y) * 6, 200, 1200);
  }
  const pred = samplePath(theta, v0, 60, 0.06);
  ctx.strokeStyle = "#9aa8ff";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  pred.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);

  // projectiles + their trail
  for (const p of projectiles) {
    if (!p.alive) continue;
    ctx.strokeStyle = "#7aa2f7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const trailSteps = 12,
      dt = 0.03;
    for (let i = trailSteps; i >= 0; i--) {
      const t = performance.now() / 1000 - p.t0 - i * dt;
      if (t <= 0) continue;
      const x = launcher.x + p.vx0 * t + 0.5 * ax * t * t;
      const y = launcher.y() + p.vy0 * t + 0.5 * g * t * t;
      if (i === trailSteps) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#e1e7ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // targets
  for (const t of targets) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fillStyle = t.hit ? "#2a3c34" : "#7bf59b";
    ctx.fill();
    if (!t.hit) {
      ctx.strokeStyle = "rgba(0,0,0,.25)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      const pulse = 1 + 0.08 * Math.sin(now * 10);
      ctx.strokeStyle = "rgba(123,245,155,0.25)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // drag aim line
  if (dragging) {
    ctx.strokeStyle = "#e1e7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(launcher.x, launcher.y());
    ctx.lineTo(dragNow.x, dragNow.y);
    ctx.stroke();
  }

  // particles
  for (const q of particles) {
    const a = 1 - q.t / q.life;
    let rgba = `rgba(255,255,255,${a})`;
    if (q.color && q.color.startsWith("#")) {
      // keep white fallback with alpha
    }
    ctx.fillStyle = rgba;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // UI text
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`Level ${level}`, 12, 18);
  ctx.fillText(
    `g = ${g.toFixed(0)} px/s², ax = ${ax.toFixed(0)} px/s²`,
    12,
    34
  );
}

// ========= Init =========
resetLevel(true);
requestAnimationFrame(step);
