/* =========================================================
   NEON STACK — a one-tap tower stacking game
   Tap to drop the sliding block. Overhang gets sliced off.
   Perfect stacks keep your width and build combos.
   Pure HTML5 Canvas + JavaScript.
   ========================================================= */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);

  // ---------- DOM ----------
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const comboEl = document.getElementById("combo");
  const startScreen = document.getElementById("start");
  const overScreen = document.getElementById("over");
  const finalEl = document.getElementById("final");
  const finalBestEl = document.getElementById("final-best");
  const newBestEl = document.getElementById("new-best");

  document.getElementById("play").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });
  document.getElementById("retry").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });

  // ---------- Constants ----------
  const BH = 44;                 // block height
  const PERFECT = 10;            // px tolerance for a "perfect" stack
  const STATE = { START: 0, PLAY: 1, OVER: 2 };

  let best = Number(localStorage.getItem("nstack_best") || 0);
  bestEl.textContent = "BEST " + best;

  // ---------- State ----------
  let state = STATE.START;
  let stack, moving, falling, particles;
  let camLevel, camTarget, score, combo, speed, lastTime, activeY, bgHue, shake;

  function hue(level) { return (200 + level * 8) % 360; }

  function reset() {
    activeY = H * 0.46;                 // screen-Y (top) where the active block sits
    const baseW = Math.min(W * 0.6, 320);
    const baseX = (W - baseW) / 2;
    stack = [{ x: baseX, w: baseW, level: 0 }];   // base block already placed
    moving = null;
    falling = [];
    particles = [];
    camLevel = 0;
    camTarget = 0;
    score = 0;
    combo = 0;
    speed = 230;
    bgHue = hue(0);
    shake = 0;
    spawnMoving();
    scoreEl.textContent = "0";
  }

  function spawnMoving() {
    const below = stack[stack.length - 1];
    const level = stack.length;
    const fromLeft = level % 2 === 0;
    moving = {
      x: fromLeft ? -below.w : W,       // start off-screen, slide in
      w: below.w,
      level,
      dir: fromLeft ? 1 : -1,
      hue: hue(level),
    };
  }

  // ---------- Screen position of a block top, given its level ----------
  function topY(level) { return activeY + (camLevel - level) * BH; }

  // ---------- Input ----------
  function drop() {
    if (state !== STATE.PLAY || !moving) return;
    const below = stack[stack.length - 1];
    const mL = moving.x, mR = moving.x + moving.w;
    const bL = below.x, bR = below.x + below.w;
    const overlapL = Math.max(mL, bL);
    const overlapR = Math.min(mR, bR);
    const overlapW = overlapR - overlapL;

    if (overlapW <= 0) {                 // total miss -> topple
      falling.push({ x: moving.x, y: topY(moving.level), w: moving.w, h: BH, vx: moving.dir * 40, vy: -60, rot: 0, vr: moving.dir * 4, hue: moving.hue });
      sfx("miss");
      moving = null;
      return gameOver();
    }

    const perfect = Math.abs(mL - bL) < PERFECT;
    let newX = overlapL, newW = overlapW;

    if (perfect) {
      // snap perfectly, keep width, small reward, combo up
      newX = bL; newW = below.w;
      combo++;
      if (combo >= 3) newW = Math.min(below.w + 12, Math.min(W * 0.6, 320)); // regrow a little
      burstLine(newX, topY(moving.level), newW, moving.hue);
      showCombo(combo);
      shake = 6;
      sfx("perfect");
    } else {
      combo = 0;
      // slice the overhang -> it falls
      if (mL < bL) {  // overhang on the left
        falling.push({ x: mL, y: topY(moving.level), w: bL - mL, h: BH, vx: -40, vy: -30, rot: 0, vr: -3, hue: moving.hue });
      }
      if (mR > bR) {  // overhang on the right
        falling.push({ x: bR, y: topY(moving.level), w: mR - bR, h: BH, vx: 40, vy: -30, rot: 0, vr: 3, hue: moving.hue });
      }
      sfx("place");
    }

    stack.push({ x: newX, w: newW, level: moving.level });
    score++;
    scoreEl.textContent = score;
    camTarget = stack.length - 1;        // camera follows the new top
    speed = Math.min(560, 240 + score * 6);
    moving = null;
    spawnMoving();
  }

  function press(e) {
    if (e && e.target && e.target.closest(".btn")) return;
    if (state === STATE.PLAY) { e && e.preventDefault(); drop(); }
  }
  canvas.addEventListener("pointerdown", press);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (state === STATE.PLAY) drop();
      else startGame();
    }
  });

  // ---------- Effects ----------
  function burstLine(x, y, w, h) {
    for (let i = 0; i < 18; i++) {
      particles.push({
        x: x + Math.random() * w, y: y + BH,
        vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 200 - 40,
        life: 1, size: Math.random() * 3 + 1.5, hue: h,
      });
    }
  }
  function showCombo(c) {
    if (c < 2) return;
    comboEl.textContent = "PERFECT ×" + c;
    comboEl.style.color = `hsl(${hue(stack.length)},90%,65%)`;
    comboEl.classList.remove("hidden");
    comboEl.classList.remove("combo"); void comboEl.offsetWidth; comboEl.classList.add("combo");
  }

  // ---------- Flow ----------
  function startGame() {
    resize();
    reset();
    state = STATE.PLAY;
    startScreen.classList.add("hidden");
    overScreen.classList.add("hidden");
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state = STATE.OVER;
    sfx("over");
    const record = score > best;
    if (record) { best = score; localStorage.setItem("nstack_best", String(best)); bestEl.textContent = "BEST " + best; }
    finalEl.textContent = score;
    finalBestEl.textContent = best;
    newBestEl.classList.toggle("hidden", !record);
    setTimeout(() => overScreen.classList.remove("hidden"), 700);
  }

  // ---------- Update ----------
  function update(dt) {
    // camera easing
    camLevel += (camTarget - camLevel) * Math.min(1, dt * 8);
    bgHue += (hue(stack.length) - bgHue) * Math.min(1, dt * 3);

    if (moving) {
      moving.x += moving.dir * speed * dt;
      const leftLimit = -moving.w * 0.15;
      const rightLimit = W - moving.w * 0.85;
      if (moving.x < leftLimit) { moving.x = leftLimit; moving.dir = 1; }
      if (moving.x > rightLimit) { moving.x = rightLimit; moving.dir = -1; }
    }

    for (const f of falling) {
      f.vy += 900 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
    }
    falling = falling.filter((f) => f.y < H + 200);

    for (const p of particles) {
      p.vy += 700 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.4;
    }
    particles = particles.filter((p) => p.life > 0);

    if (shake > 0) shake -= dt * 30;
  }

  // ---------- Render ----------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBlock(x, y, w, h, hu, glow) {
    ctx.save();
    if (glow) { ctx.shadowColor = `hsl(${hu},90%,60%)`; ctx.shadowBlur = 22; }
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, `hsl(${hu},75%,62%)`);
    g.addColorStop(1, `hsl(${hu},70%,44%)`);
    ctx.fillStyle = g;
    roundRect(x, y, w, h, 7);
    ctx.fill();
    // top highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsla(${hu},90%,80%,.55)`;
    roundRect(x + 4, y + 3, w - 8, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    // background gradient (shifts with height)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${(bgHue + 20) % 360},45%,10%)`);
    bg.addColorStop(1, `hsl(${bgHue},55%,5%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // placed blocks (skip ones off-screen)
    for (const b of stack) {
      const y = topY(b.level);
      if (y > H + BH || y < -BH) continue;
      drawBlock(b.x, y, b.w, BH, hue(b.level), false);
    }

    // falling / sliced pieces
    for (const f of falling) {
      ctx.save();
      ctx.translate(f.x + f.w / 2, f.y + f.h / 2);
      ctx.rotate(f.rot);
      drawBlock(-f.w / 2, -f.h / 2, f.w, f.h, f.hue, false);
      ctx.restore();
    }

    // moving block
    if (moving) drawBlock(moving.x, topY(moving.level), moving.w, BH, moving.hue, true);

    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = `hsl(${p.hue},90%,65%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ---------- Loop ----------
  function loop(now) {
    if (state !== STATE.PLAY && state !== STATE.OVER) return;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    if (state === STATE.PLAY || falling.length || particles.length) requestAnimationFrame(loop);
  }

  // ---------- Sound ----------
  let ac = null;
  function sfx(type) {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.connect(g); g.connect(ac.destination);
      const m = {
        place:   { ty: "square",   f: 300, f2: 380, d: 0.09, v: 0.05 },
        perfect: { ty: "triangle", f: 520 + Math.min(combo, 12) * 40, f2: 900, d: 0.16, v: 0.07 },
        miss:    { ty: "sawtooth", f: 260, f2: 70, d: 0.35, v: 0.07 },
        over:    { ty: "sawtooth", f: 300, f2: 60, d: 0.5, v: 0.08 },
      }[type];
      o.type = m.ty; o.frequency.setValueAtTime(m.f, t);
      o.frequency.exponentialRampToValueAtTime(m.f2, t + m.d);
      g.gain.setValueAtTime(m.v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + m.d + 0.04);
      o.start(t); o.stop(t + m.d + 0.05);
    } catch (_) {}
  }

  // ---------- Boot ----------
  resize();
  reset();
  // idle preview render on the start screen
  (function idle() {
    if (state === STATE.START) { draw(); requestAnimationFrame(idle); }
  })();
})();
