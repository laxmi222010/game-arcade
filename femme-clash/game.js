/* =========================================================
   FEMME CLASH — 2D fighting game engine
   Modes: vs CPU, 2-players-1-phone, online (host/guest via net.js)
   Fixed logical world (900x506) so online stays resolution-independent.
   ========================================================= */
const Game = (() => {
  "use strict";

  const WORLD_W = 900, WORLD_H = 506, GROUND = 470;
  const GRAV = 2000, MOVE = 260, JUMP = 720;
  const ROUND_TIME = 60, WIN_ROUNDS = 2;

  const ATTACKS = {
    P: { dur: 0.32, a0: 0.07, a1: 0.17, range: 96,  dmg: 7,  kb: 70,  h: 130 },
    K: { dur: 0.46, a0: 0.14, a1: 0.28, range: 120, dmg: 13, kb: 150, h: 150 },
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let VW = 0, VH = 0, scale = 1, offX = 0, offY = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    VW = r.width; VH = r.height;
    canvas.width = Math.round(VW * DPR);
    canvas.height = Math.round(VH * DPR);
    scale = Math.min(VW / WORLD_W, VH / WORLD_H);
    offX = (VW - WORLD_W * scale) / 2;
    offY = (VH - WORLD_H * scale) / 2;
  }
  window.addEventListener("resize", resize);

  // ---------- Fighter ----------
  function makeFighter(x, facing, color, colorB, hair, name) {
    return { x, y: GROUND, vx: 0, vy: 0, facing, color, colorB, hair, name,
      hp: 100, state: "idle", t: 0, atk: null, hitReg: false, stun: 0,
      onGround: true, anim: 0, flash: 0, pips: 0 };
  }
  let f1, f2, timer, round, state, announceT, winner, mode, role, paused;

  // input objects
  const blank = () => ({ L: false, R: false, J: false, P: false, K: false, B: false });
  let localInput = blank(), p2Input = blank(), netRemoteInput = blank();
  let input1 = blank(), input2 = blank();

  function resetFighters() {
    f1 = makeFighter(260, 1, "#ff3d81", "#ff8ac0", "#3a1030", "RUBY");
    f2 = makeFighter(640, -1, "#24e0ff", "#9af2ff", "#06303a", "JADE");
  }

  // ---------- Match flow ----------
  function start(m, r) {
    resize();
    mode = m; role = r || null; paused = false;
    resetFighters();
    round = 1; winner = null;
    beginRound();
    showGameUI();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function beginRound() {
    const p1 = f1 ? f1.pips : 0, p2 = f2 ? f2.pips : 0;   // keep round wins across rounds
    resetFighters();
    f1.pips = p1; f2.pips = p2;
    f1.hp = f2.hp = 100;
    timer = ROUND_TIME;
    state = "intro"; announceT = 1.4;
    setAnnounce("ROUND " + round);
    updateHUD();
  }

  function endRound(rWinner) {
    state = "roundend"; announceT = 2.2;
    if (rWinner === 1) f1.pips++; else if (rWinner === 2) f2.pips++;
    setAnnounce(rWinner === 0 ? "DRAW" : (rWinner === 1 ? f1.name + " WINS!" : f2.name + " WINS!"));
    updateHUD();
    if (f1.pips >= WIN_ROUNDS || f2.pips >= WIN_ROUNDS) {
      winner = f1.pips > f2.pips ? 1 : 2;
    }
  }

  function nextAfterRoundEnd() {
    if (winner) { endMatch(); return; }
    round++;
    beginRound();
  }

  function endMatch() {
    state = "matchover";
    showResult(winner);
  }

  // ---------- Update ----------
  function assembleInputs() {
    if (mode === "cpu") { input1 = localInput; input2 = aiInput(); }
    else if (mode === "local") { input1 = localInput; input2 = p2Input; }
    else if (mode === "online") {
      if (role === "host") { input1 = localInput; input2 = netRemoteInput; }
      // guest doesn't simulate
    }
  }

  function isSim() { return mode !== "online" || role === "host"; }

  function update(dt) {
    if (state === "intro") { announceT -= dt; if (announceT <= 0) { state = "fight"; setAnnounce("FIGHT!"); announceT = 0.7; } return; }
    if (state === "fightflash") { announceT -= dt; if (announceT <= 0) clearAnnounce(); }
    if (state === "roundend") { announceT -= dt; if (announceT <= 0) nextAfterRoundEnd(); return; }
    if (state === "matchover") return;
    if (state === "fight" && announceT > 0) { announceT -= dt; if (announceT <= 0) clearAnnounce(); }

    if (state !== "fight") return;
    assembleInputs();

    // face each other when neutral
    faceOff(f1, f2); faceOff(f2, f1);
    stepFighter(f1, input1, dt);
    stepFighter(f2, input2, dt);
    resolveHit(f1, f2); resolveHit(f2, f1);

    // separation so they don't overlap
    const minGap = 54;
    if (Math.abs(f1.x - f2.x) < minGap) {
      const mid = (f1.x + f2.x) / 2;
      f1.x = mid + (f1.x < f2.x ? -minGap / 2 : minGap / 2);
      f2.x = mid + (f2.x < f1.x ? -minGap / 2 : minGap / 2);
    }
    f1.x = clamp(f1.x, 40, WORLD_W - 40);
    f2.x = clamp(f2.x, 40, WORLD_W - 40);

    timer -= dt;
    if (f1.hp <= 0 || f2.hp <= 0) {
      const w = f1.hp <= 0 && f2.hp <= 0 ? 0 : (f1.hp <= 0 ? 2 : 1);
      (w === 1 ? f2 : f1); // koed one plays ko
      if (f1.hp <= 0) f1.state = "ko"; if (f2.hp <= 0) f2.state = "ko";
      setAnnounce("K.O."); endRound(w);
    } else if (timer <= 0) {
      timer = 0;
      const w = f1.hp === f2.hp ? 0 : (f1.hp > f2.hp ? 1 : 2);
      endRound(w);
    }
    updateHUD();
  }

  function faceOff(a, b) {
    if (a.state === "idle" || a.state === "walk") a.facing = a.x <= b.x ? 1 : -1;
  }

  function stepFighter(f, inp, dt) {
    f.anim += dt;
    if (f.flash > 0) f.flash -= dt;
    if (f.state === "ko") { applyPhysics(f, dt); return; }

    // hit stun
    if (f.state === "hit") {
      f.stun -= dt;
      applyPhysics(f, dt);
      if (f.stun <= 0) f.state = "idle";
      return;
    }
    // attacking (committed)
    if (f.state === "punch" || f.state === "kick") {
      f.t += dt;
      applyPhysics(f, dt);
      if (f.t >= f.atk.dur) { f.state = "idle"; f.atk = null; }
      return;
    }

    // free actions
    let moving = false;
    if (f.onGround) {
      if (inp.B) { f.state = "block"; f.vx = 0; applyPhysics(f, dt); return; }
      if (inp.P || inp.K) { startAttack(f, inp.P ? "P" : "K"); return; }
      if (inp.J) { f.vy = -JUMP; f.onGround = false; f.state = "jump"; }
    }
    if (inp.L) { f.vx = -MOVE; moving = true; }
    else if (inp.R) { f.vx = MOVE; moving = true; }
    else if (f.onGround) f.vx = 0;

    applyPhysics(f, dt);
    if (!f.onGround) f.state = "jump";
    else f.state = moving ? "walk" : "idle";
  }

  function startAttack(f, type) {
    f.state = type === "P" ? "punch" : "kick";
    f.atk = ATTACKS[type]; f.t = 0; f.hitReg = false; f.vx = 0;
  }

  function applyPhysics(f, dt) {
    f.vy += GRAV * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; if (!f.onGround) { f.onGround = true; if (f.state === "jump") f.state = "idle"; } }
    else f.onGround = false;
    // air drag on horizontal handled by keeping vx (momentum during jump)
  }

  function resolveHit(a, d) {
    if ((a.state !== "punch" && a.state !== "kick") || a.hitReg) return;
    const p = a.t / a.atk.dur;
    if (p < a.atk.a0 / a.atk.dur || p > a.atk.a1 / a.atk.dur) return;
    const dist = (d.x - a.x) * a.facing;         // positive = in front
    if (dist < 10 || dist > a.atk.range) return;
    if (Math.abs((GROUND - a.y) - (GROUND - d.y)) > 90) return; // rough vertical check
    a.hitReg = true;
    const blocking = d.state === "block" && d.facing === -a.facing;
    if (blocking) {
      d.hp -= a.atk.dmg * 0.22;
      d.vx = a.facing * 40;
      d.flash = 0.12; spark(d.x, d.y - 90, "#ffd23f", 8);
    } else {
      d.hp -= a.atk.dmg;
      d.vx = a.facing * a.atk.kb; d.vy = -140;
      d.state = "hit"; d.stun = 0.32; d.flash = 0.18;
      spark(d.x + a.facing * 20, d.y - 100, a.color, 16);
      shake = 8;
    }
    d.hp = Math.max(0, d.hp);
    onHit && onHit(blocking);
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- AI (tuned to be fair & beatable) ----------
  let aiDecide = 0, aiCool = 0, aiAct = blank();
  function aiInput() { return aiAct; }
  function runAI(dt) {
    if (mode !== "cpu" || state !== "fight") { aiAct = blank(); return; }
    aiDecide -= dt; aiCool -= dt;
    const me = f2, foe = f1;
    if (me.state === "hit" || me.state === "ko" || me.state === "punch" || me.state === "kick") { aiAct = blank(); return; }
    const dist = Math.abs(me.x - foe.x);
    const foeAttacking = foe.state === "punch" || foe.state === "kick";
    const toward = me.x < foe.x ? "R" : "L", away = me.x < foe.x ? "L" : "R";

    if (aiDecide <= 0) {
      aiAct = blank();
      aiDecide = 0.2 + Math.random() * 0.34;
      if (foeAttacking && dist < 150 && Math.random() < 0.4) { aiAct.B = true; }        // block sometimes
      else if (dist > 165) { aiAct[toward] = true; }                                     // approach
      else if (aiCool > 0) { if (Math.random() < 0.5) aiAct[away] = true; }              // resting: back off / wait
      else if (dist < 130 && Math.random() < 0.6) {                                      // strike, then rest
        if (Math.random() < 0.6) aiAct.P = true; else aiAct.K = true;
        aiCool = 0.55 + Math.random() * 0.7;
      } else { aiAct[toward] = true; }
      if (Math.random() < 0.03) aiAct.J = true;
    }
  }

  // ---------- Effects ----------
  let sparks = [], shake = 0;
  function spark(x, y, color, n) {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - .5) * 300, vy: (Math.random() - .5) * 300 - 60, life: 1, color, r: Math.random() * 3 + 1.5 });
  }
  function stepSparks(dt) {
    for (const s of sparks) { s.vy += 500 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 2; }
    sparks = sparks.filter(s => s.life > 0);
    if (shake > 0) shake -= dt * 40;
  }

  // ---------- Render ----------
  function W2S() { ctx.setTransform(scale * DPR, 0, 0, scale * DPR, (offX + (shake > 0 ? (Math.random() - .5) * shake : 0)) * DPR, (offY + (shake > 0 ? (Math.random() - .5) * shake : 0)) * DPR); }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, "#2a1250"); g.addColorStop(.6, "#3b1a63"); g.addColorStop(1, "#160a24");
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);

    W2S();
    // distant glow
    ctx.fillStyle = "rgba(255,90,180,.10)"; ctx.beginPath(); ctx.arc(300, 240, 220, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(60,200,255,.10)"; ctx.beginPath(); ctx.arc(640, 240, 220, 0, 7); ctx.fill();
    // floor
    const fg = ctx.createLinearGradient(0, GROUND, 0, WORLD_H);
    fg.addColorStop(0, "#241040"); fg.addColorStop(1, "#0c0618");
    ctx.fillStyle = fg; ctx.fillRect(0, GROUND, WORLD_W, WORLD_H - GROUND);
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(WORLD_W, GROUND); ctx.stroke();

    // shadows
    for (const f of [f1, f2]) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(f.x, GROUND + 6, 40, 10, 0, 0, 7); ctx.fill(); }

    drawFighter(f1); drawFighter(f2);

    for (const s of sparks) { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function drawFighter(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.facing, 1);
    if (f.flash > 0) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 20);

    const skin = "#f2c9a5";
    let armF = -0.5, armB = 0.6, legF = 0.2, legB = -0.2, lean = 0, bodyY = 0;

    if (f.state === "ko") { drawKO(f, skin); ctx.restore(); return; }
    if (f.state === "walk") { const s = Math.sin(f.anim * 10); legF = s * 0.5; legB = -s * 0.5; armF = -0.3 + s * 0.2; }
    else if (f.state === "idle") { bodyY = Math.sin(f.anim * 3) * 2; armF = -0.4; armB = 0.5; }
    else if (f.state === "jump") { legF = 0.7; legB = 0.5; armF = -0.9; }
    else if (f.state === "block") { armF = -1.6; armB = -1.4; lean = -0.06; }
    else if (f.state === "hit") { lean = 0.22; armF = 0.6; armB = 0.9; bodyY = -2; }
    else if (f.state === "punch") { const p = f.t / f.atk.dur; const ext = Math.sin(Math.min(1, p * 2.2) * Math.PI); armF = -0.2 - ext * 1.5; }
    else if (f.state === "kick") { const p = f.t / f.atk.dur; const ext = Math.sin(Math.min(1, p * 2) * Math.PI); legF = 0.2 + ext * 1.4; lean = -ext * 0.15; }

    ctx.rotate(lean);
    const H = 150;                 // total height in world units
    // legs
    drawLimb(0, -46, legB, 46, 12, f.colorB);   // back leg
    drawLimb(0, -46, legF, 46, 13, f.color);    // front leg
    // torso
    ctx.fillStyle = f.color;
    roundRectP(-16, -H + 34 + bodyY, 32, 62, 12);
    // skirt
    ctx.fillStyle = f.colorB; roundRectP(-20, -60 + bodyY, 40, 20, 6);
    // arms
    drawLimb(0, -H + 44 + bodyY, armB, 40, 10, f.colorB);
    drawLimb(0, -H + 44 + bodyY, armF, 40, 11, skin, f.color);
    // head
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(2, -H + 20 + bodyY, 17, 0, 7); ctx.fill();
    // hair + ponytail
    ctx.fillStyle = f.hair;
    ctx.beginPath(); ctx.arc(2, -H + 16 + bodyY, 18, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-12, -H + 16 + bodyY); ctx.quadraticCurveTo(-34, -H + 30 + bodyY, -22, -H + 60 + bodyY); ctx.quadraticCurveTo(-14, -H + 40 + bodyY, -10, -H + 24 + bodyY); ctx.fill();
    // eye
    ctx.fillStyle = "#1a1030"; ctx.beginPath(); ctx.arc(9, -H + 20 + bodyY, 2.4, 0, 7); ctx.fill();

    ctx.restore();
  }

  function drawLimb(px, py, ang, len, w, color, tipColor) {
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.fillStyle = color; roundRectP(-w / 2, 0, w, len, w / 2);
    if (tipColor) { ctx.fillStyle = tipColor; ctx.beginPath(); ctx.arc(0, len, w * 0.7, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function drawKO(f, skin) {
    ctx.rotate(f.facing > 0 ? 1.4 : 1.4);
    ctx.fillStyle = f.color; roundRectP(-30, -30, 90, 26, 12);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(70, -18, 16, 0, 7); ctx.fill();
    ctx.fillStyle = f.hair; ctx.beginPath(); ctx.arc(70, -22, 17, Math.PI, Math.PI * 2.1); ctx.fill();
  }
  function roundRectP(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }

  // ---------- HUD ----------
  const hp1El = document.getElementById("hp1"), hp2El = document.getElementById("hp2");
  const timerEl = document.getElementById("timer");
  const pips1El = document.getElementById("pips1"), pips2El = document.getElementById("pips2");
  function updateHUD() {
    hp1El.style.width = Math.max(0, f1.hp) + "%";
    hp2El.style.width = Math.max(0, f2.hp) + "%";
    timerEl.textContent = Math.ceil(timer);
    pips1El.innerHTML = pip(f1.pips); pips2El.innerHTML = pip(f2.pips);
  }
  function pip(n) { let s = ""; for (let i = 0; i < WIN_ROUNDS; i++) s += `<span class="pip ${i < n ? "on" : ""}"></span>`; return s; }

  const announceEl = document.getElementById("announce");
  function setAnnounce(t) { announceEl.textContent = t; announceEl.classList.remove("hidden"); announceEl.style.animation = "none"; void announceEl.offsetWidth; announceEl.style.animation = ""; }
  function clearAnnounce() { announceEl.classList.add("hidden"); }

  // ---------- Loop ----------
  let lastTime = 0, running = false;
  function loop(now) {
    let dt = (now - lastTime) / 1000; lastTime = now;
    if (dt > 0.05) dt = 0.05;
    if (!paused) {
      if (mode === "cpu") runAI(dt);
      if (isSim()) update(dt);
      else guestUpdate(dt);         // online guest: animate only
      stepSparks(dt);
    }
    draw();
    if (isSim() && role === "host" && onHostFrame) onHostFrame(getStateForNet());
    requestAnimationFrame(loop);
  }

  // guest: advance anim timers a little for smoothness, everything else from state
  function guestUpdate(dt) { f1.anim += dt; f2.anim += dt; if (f1.flash > 0) f1.flash -= dt; if (f2.flash > 0) f2.flash -= dt; if (announceT > 0) { announceT -= dt; if (announceT <= 0 && (state === "fight")) clearAnnounce(); } }

  // ---------- Net glue ----------
  function ser(f) { return { x: Math.round(f.x), y: Math.round(f.y), fc: f.facing, hp: Math.round(f.hp), st: f.state, pp: f.pips, fl: f.flash }; }
  function getStateForNet() {
    return { a: ser(f1), b: ser(f2), tm: Math.round(timer * 10) / 10, rd: round, gs: state, an: announceEl.classList.contains("hidden") ? "" : announceEl.textContent, wn: winner };
  }
  function applyState(s) {
    if (!f1) resetFighters();
    Object.assign(f1, { x: s.a.x, y: s.a.y, facing: s.a.fc, hp: s.a.hp, state: s.a.st, pips: s.a.pp });
    Object.assign(f2, { x: s.b.x, y: s.b.y, facing: s.b.fc, hp: s.b.hp, state: s.b.st, pips: s.b.pp });
    timer = s.tm; round = s.rd; state = s.gs; winner = s.wn;
    if (s.an) setAnnounceIfChanged(s.an); else clearAnnounce();
    updateHUD();
    if (s.wn && state === "matchover") showResult(s.wn);
  }
  let lastAnn = "";
  function setAnnounceIfChanged(t) { if (t !== lastAnn) { lastAnn = t; setAnnounce(t); } announceEl.textContent = t; announceEl.classList.remove("hidden"); }

  // hooks assigned by net.js / ui
  let onHit = null, onHostFrame = null, onLocalInputChange = null;

  // ---------- Input wiring ----------
  function setBtn(side, btn, val) {
    const tgt = side === "p2" ? p2Input : localInput;
    if (tgt[btn] === val) return;
    tgt[btn] = val;
    if (side !== "p2" && onLocalInputChange) onLocalInputChange({ ...localInput });
  }
  document.querySelectorAll("#controls .ctl").forEach(b => {
    const side = b.parentElement.dataset.side; const btn = b.dataset.btn;
    const on = e => { e.preventDefault(); setBtn(side, btn, true); };
    const off = e => { e.preventDefault(); setBtn(side, btn, false); };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointerleave", off);
    b.addEventListener("pointercancel", off);
  });
  // keyboard (testing / desktop)
  const K1 = { KeyA: "L", KeyD: "R", KeyW: "J", KeyF: "P", KeyG: "K", KeyS: "B" };
  const K2 = { ArrowLeft: "L", ArrowRight: "R", ArrowUp: "J", Digit1: "P", Digit2: "K", Digit3: "B" };
  window.addEventListener("keydown", e => { if (K1[e.code]) { e.preventDefault(); setBtn("p1", K1[e.code], true); } if (mode === "local" && K2[e.code]) { e.preventDefault(); setBtn("p2", K2[e.code], true); } });
  window.addEventListener("keyup", e => { if (K1[e.code]) setBtn("p1", K1[e.code], false); if (K2[e.code]) setBtn("p2", K2[e.code], false); });

  // ---------- UI hooks (assigned by net.js) ----------
  function showGameUI() {}
  function showResult() {}

  resize();

  // public
  return {
    start, resize,
    get mode() { return mode; }, get role() { return role; },
    setPaused: v => paused = v,
    setRemoteInput: inp => netRemoteInput = { ...blank(), ...inp },
    applyState, getStateForNet,
    set onHit(fn) { onHit = fn; }, set onHostFrame(fn) { onHostFrame = fn; }, set onLocalInputChange(fn) { onLocalInputChange = fn; },
    set showGameUI(fn) { showGameUI = fn; }, set showResult(fn) { showResult = fn; },
  };
})();
