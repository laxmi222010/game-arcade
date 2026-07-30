/* =========================================================
   GRAVITY FLIP RUNNER
   A neon endless runner. Flip gravity to dodge the spikes.
   Pure HTML5 Canvas + JavaScript — no libraries.
   ========================================================= */

(() => {
  "use strict";

  // ---------- Canvas setup ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Keep the flip feel consistent no matter how tall the screen is
    GRAVITY = Math.max(2000, H * 5.2);

    // When not mid-run (menu / game-over), keep the player parked on its
    // surface and refresh the starfield for the new dimensions.
    if (player && state !== STATE.PLAY) {
      player.x = W * 0.22;
      player.y = player.gDir === 1 ? H - GROUND - PH : GROUND;
      makeStars();
    }
  }
  window.addEventListener("resize", resize);

  // ---------- DOM ----------
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const finalScoreEl = document.getElementById("final-score");
  const finalBestEl = document.getElementById("final-best");
  const newBestEl = document.getElementById("new-best");

  const startScreen = document.getElementById("start-screen");
  const overScreen = document.getElementById("over-screen");
  const pauseScreen = document.getElementById("pause-screen");

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("retry-btn").addEventListener("click", startGame);
  document.getElementById("resume-btn").addEventListener("click", togglePause);

  // ---------- Game constants ----------
  const GROUND = 46;          // thickness of floor / ceiling band
  const PW = 34, PH = 34;     // player size
  let GRAVITY = 2600;         // px / s^2 — recalculated per screen height in resize()
  const START_SPEED = 330;    // px / s
  const MAX_SPEED = 680;
  const ACCEL = 6;            // speed gained per second

  const STATE = { START: 0, PLAY: 1, PAUSE: 2, OVER: 3 };

  // ---------- Best score (persisted) ----------
  let best = Number(localStorage.getItem("gfr_best") || 0);
  bestEl.textContent = best;

  // ---------- Game state ----------
  let state = STATE.START;
  let player, obstacles, orbs, particles, stars;
  let speed, distance, score, spawnX, shake, lastTime, orbScore;

  function reset() {
    player = {
      x: W * 0.22,
      y: H - GROUND - PH,
      w: PW,
      h: PH,
      vy: 0,
      gDir: 1,          // 1 = gravity down, -1 = gravity up
      grounded: true,
      trail: [],
      rot: 0,
    };
    obstacles = [];
    orbs = [];
    particles = [];
    speed = START_SPEED;
    distance = 0;
    score = 0;
    orbScore = 0;
    spawnX = W + 500;   // runway before the first spike
    shake = 0;
    makeStars();
  }

  // ---------- Starfield background ----------
  function makeStars() {
    stars = [];
    const n = 60;
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: GROUND + Math.random() * (H - GROUND * 2),
        r: Math.random() * 1.8 + 0.4,
        z: Math.random() * 0.7 + 0.3, // parallax depth
      });
    }
  }

  // ---------- Obstacle spawning ----------
  function spawnObstacle() {
    // Difficulty scales with speed
    const t = (speed - START_SPEED) / (MAX_SPEED - START_SPEED); // 0..1
    const onCeiling = Math.random() < 0.5;
    const spikeCount = Math.random() < 0.35 + t * 0.3 ? 2 : 1;
    const spikeW = 34;

    for (let i = 0; i < spikeCount; i++) {
      obstacles.push({
        x: spawnX + i * spikeW,
        w: spikeW,
        h: 40 + Math.random() * 14,
        ceiling: onCeiling,
        passed: false,
      });
    }

    // Sometimes drop a collectible orb on the opposite (safe) side
    if (Math.random() < 0.6) {
      const oy = onCeiling
        ? H - GROUND - 60 - Math.random() * 40
        : GROUND + 40 + Math.random() * 40;
      orbs.push({ x: spawnX + spikeW * spikeCount + 60, y: oy, r: 11, got: false, pulse: Math.random() * 6 });
    }

    // Gap before next spawn — shrinks as speed rises but stays fair
    const gap = 260 + Math.random() * 160 - t * 60;
    spawnX += spikeW * spikeCount + gap;
  }

  // ---------- Particles ----------
  function burst(x, y, color, count, spread) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        color,
        size: Math.random() * 3 + 1.5,
      });
    }
  }

  // ---------- Input ----------
  function flip() {
    if (state !== STATE.PLAY) return;
    player.gDir *= -1;
    player.grounded = false;
    player.vy = player.gDir * 120; // little kick off the surface
    burst(player.x + PW / 2, player.y + PH / 2, "#00f0ff", 10, 160);
    sfx("flip");
  }

  function onKey(e) {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (state === STATE.START) startGame();
      else if (state === STATE.OVER) startGame();
      else flip();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      togglePause();
    } else if (e.code === "KeyM") {
      muted = !muted;
    }
  }
  window.addEventListener("keydown", onKey);

  function onPointer(e) {
    // Ignore clicks that land on UI buttons
    if (e.target.closest(".btn")) return;
    if (state === STATE.PLAY) {
      e.preventDefault();
      flip();
    }
  }
  canvas.addEventListener("pointerdown", onPointer);

  // ---------- Sound (Web Audio, no files) ----------
  let audioCtx = null;
  let muted = false;
  function sfx(type) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === "flip") { o.type = "square"; o.frequency.setValueAtTime(520, now); o.frequency.exponentialRampToValueAtTime(760, now + 0.08); g.gain.setValueAtTime(0.05, now); }
      else if (type === "score") { o.type = "triangle"; o.frequency.setValueAtTime(880, now); o.frequency.exponentialRampToValueAtTime(1320, now + 0.1); g.gain.setValueAtTime(0.06, now); }
      else if (type === "die") { o.type = "sawtooth"; o.frequency.setValueAtTime(320, now); o.frequency.exponentialRampToValueAtTime(70, now + 0.4); g.gain.setValueAtTime(0.08, now); }
      g.gain.exponentialRampToValueAtTime(0.0001, now + (type === "die" ? 0.4 : 0.12));
      o.start(now);
      o.stop(now + (type === "die" ? 0.42 : 0.14));
    } catch (_) { /* audio not available — ignore */ }
  }

  // ---------- Flow ----------
  function startGame() {
    resize();
    reset();
    state = STATE.PLAY;
    startScreen.classList.add("hidden");
    overScreen.classList.add("hidden");
    pauseScreen.classList.add("hidden");
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function togglePause() {
    if (state === STATE.PLAY) {
      state = STATE.PAUSE;
      pauseScreen.classList.remove("hidden");
    } else if (state === STATE.PAUSE) {
      state = STATE.PLAY;
      pauseScreen.classList.add("hidden");
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function gameOver() {
    state = STATE.OVER;
    shake = 16;
    sfx("die");
    burst(player.x + PW / 2, player.y + PH / 2, "#ff2e97", 40, 340);
    const newRecord = score > best;
    if (newRecord) {
      best = score;
      localStorage.setItem("gfr_best", String(best));
      bestEl.textContent = best;
    }
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    newBestEl.classList.toggle("hidden", !newRecord);
    // Slight delay so the death particles are visible
    setTimeout(() => overScreen.classList.remove("hidden"), 350);
  }

  // ---------- Collision helpers ----------
  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Update ----------
  function update(dt) {
    // Speed ramps up
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    const dx = speed * dt;
    distance += dx;

    // Score from distance
    const newScore = Math.floor(distance / 12);
    score = newScore + orbScore;
    scoreEl.textContent = score;

    // Player physics
    player.vy += GRAVITY * player.gDir * dt;
    player.y += player.vy * dt;

    const floorTop = H - GROUND - PH;
    const ceilBottom = GROUND;
    if (player.gDir === 1 && player.y >= floorTop) {
      player.y = floorTop; player.vy = 0; player.grounded = true;
    } else if (player.gDir === -1 && player.y <= ceilBottom) {
      player.y = ceilBottom; player.vy = 0; player.grounded = true;
    }
    player.rot += dx * 0.02;

    // Trail
    player.trail.unshift({ x: player.x + PW / 2, y: player.y + PH / 2 });
    if (player.trail.length > 12) player.trail.pop();

    // Spawn obstacles — spawnX scrolls left with the world; when the next
    // spawn point reaches the spawn zone, drop an obstacle and push it forward.
    spawnX -= dx;
    while (spawnX < W + 200) spawnObstacle();

    // Move & check obstacles
    for (const o of obstacles) {
      o.x -= dx;
      // Build a slightly forgiving hitbox for the spike
      const pad = 6;
      const box = o.ceiling
        ? { x: o.x + pad, y: GROUND, w: o.w - pad * 2, h: o.h }
        : { x: o.x + pad, y: H - GROUND - o.h, w: o.w - pad * 2, h: o.h };
      if (hit(player, box)) { gameOver(); return; }
    }
    obstacles = obstacles.filter((o) => o.x + o.w > -10);

    // Orbs
    for (const orb of orbs) {
      orb.x -= dx;
      orb.pulse += dt * 6;
      if (!orb.got) {
        const cx = player.x + PW / 2, cy = player.y + PH / 2;
        const d = Math.hypot(cx - orb.x, cy - orb.y);
        if (d < orb.r + PW / 2) {
          orb.got = true;
          orbScore += 5;
          burst(orb.x, orb.y, "#ffd23f", 16, 200);
          sfx("score");
        }
      }
    }
    orbs = orbs.filter((o) => !o.got && o.x + o.r > -10);

    // Particles
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt * 1.8;
    }
    particles = particles.filter((p) => p.life > 0);

    // Stars parallax
    for (const s of stars) {
      s.x -= dx * s.z * 0.5;
      if (s.x < 0) { s.x = W; s.y = GROUND + Math.random() * (H - GROUND * 2); }
    }

    if (shake > 0) shake -= dt * 40;
  }

  // ---------- Render ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // camera shake
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    // Stars
    for (const s of stars) {
      ctx.globalAlpha = 0.3 + s.z * 0.5;
      ctx.fillStyle = "#5ff8ff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floor & ceiling neon bands
    drawBand(H - GROUND, H, "#00f0ff");
    drawBand(0, GROUND, "#ff2e97");

    // Orbs
    for (const orb of orbs) {
      const r = orb.r + Math.sin(orb.pulse) * 2;
      ctx.save();
      ctx.shadowColor = "#ffd23f";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(orb.x - r * 0.3, orb.y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Obstacles (spikes)
    for (const o of obstacles) {
      ctx.save();
      ctx.shadowColor = o.ceiling ? "#ff2e97" : "#00f0ff";
      ctx.shadowBlur = 14;
      ctx.fillStyle = o.ceiling ? "#ff2e97" : "#00f0ff";
      ctx.beginPath();
      if (o.ceiling) {
        ctx.moveTo(o.x, GROUND);
        ctx.lineTo(o.x + o.w, GROUND);
        ctx.lineTo(o.x + o.w / 2, GROUND + o.h);
      } else {
        const base = H - GROUND;
        ctx.moveTo(o.x, base);
        ctx.lineTo(o.x + o.w, base);
        ctx.lineTo(o.x + o.w / 2, base - o.h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Player trail
    for (let i = player.trail.length - 1; i >= 0; i--) {
      const t = player.trail[i];
      ctx.globalAlpha = (1 - i / player.trail.length) * 0.4;
      ctx.fillStyle = "#00f0ff";
      const s = PW * (1 - i / player.trail.length) * 0.5;
      ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // Player
    ctx.save();
    ctx.translate(player.x + PW / 2, player.y + PH / 2);
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 20;
    const grad = ctx.createLinearGradient(-PW / 2, -PH / 2, PW / 2, PH / 2);
    grad.addColorStop(0, "#8ffcff");
    grad.addColorStop(1, "#00a8ff");
    ctx.fillStyle = grad;
    roundRect(ctx, -PW / 2, -PH / 2, PW, PH, 8);
    ctx.fill();
    // eyes for character feel
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0a16";
    const eo = player.gDir === 1 ? -3 : 3;
    ctx.fillRect(-8, eo, 5, 6);
    ctx.fillRect(4, eo, 5, 6);
    ctx.restore();

    // Particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawBand(y0, y1, color) {
    const h = y1 - y0;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, color === "#00f0ff" ? "rgba(0,240,255,0.35)" : "rgba(255,46,151,0.35)");
    g.addColorStop(1, "rgba(10,10,22,0.05)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, h);
    // bright edge line
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    const edge = color === "#00f0ff" ? y0 : y1;
    ctx.moveTo(0, edge);
    ctx.lineTo(W, edge);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- Main loop ----------
  function loop(now) {
    if (state !== STATE.PLAY) {
      // Still render one last frame for pause overlays etc.
      draw();
      return;
    }
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05; // clamp big frame gaps (tab switch)

    update(dt);
    if (state === STATE.PLAY) draw();
    requestAnimationFrame(loop);
  }

  // ---------- Boot ----------
  resize();
  reset();
  // Idle animation on the start screen
  (function idle() {
    if (state === STATE.START) {
      draw();
      requestAnimationFrame(idle);
    }
  })();
})();
