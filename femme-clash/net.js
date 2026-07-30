/* =========================================================
   FEMME CLASH — UI + online (PeerJS) glue
   ========================================================= */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const screens = ["menu", "online", "pause", "result"];
  const show = id => { screens.forEach(s => $(s).classList.add("hidden")); if (id) $(id).classList.remove("hidden"); };
  const gameEls = ["hud", "controls", "pause-btn"];
  const showGameUI = on => gameEls.forEach(e => $(e).classList.toggle("hidden", !on));

  let peer = null, conn = null, myRole = null, curMode = null;

  // ---------- start a match ----------
  function launch(mode, role) {
    curMode = mode; myRole = role || null;
    // control layout
    const c = $("controls");
    c.classList.toggle("two", mode === "local");
    document.querySelectorAll("#controls .p2only").forEach(p => p.classList.toggle("hidden", mode !== "local"));
    show(null);            // hide menus
    showGameUI(true);
    Game.start(mode, role);
  }

  // ---------- Menu ----------
  document.querySelectorAll(".mbtn").forEach(b => b.addEventListener("click", () => {
    const mode = b.dataset.mode;
    if (mode === "online") { show("online"); resetOnlineUI(); }
    else launch(mode);
  }));
  document.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => { cleanupPeer(); show("menu"); }));

  // ---------- Pause ----------
  $("pause-btn").addEventListener("click", () => { if (curMode === "online") return; Game.setPaused(true); show("pause"); });
  $("resume").addEventListener("click", () => { Game.setPaused(false); show(null); });
  $("quit").addEventListener("click", () => { Game.setPaused(false); cleanupPeer(); showGameUI(false); show("menu"); });

  // ---------- Result ----------
  $("to-menu").addEventListener("click", () => { cleanupPeer(); showGameUI(false); show("menu"); });
  $("rematch").addEventListener("click", () => {
    if (curMode === "online") {
      if (myRole === "host") { send({ t: "start" }); launch("online", "host"); }
      else { send({ t: "rematch" }); $("result-sub").textContent = "Waiting for host…"; }
    } else launch(curMode, myRole);
  });

  // Game asks us to show result
  Game.showResult = (winner) => {
    let youWin;
    if (curMode === "online") youWin = (myRole === "host" ? winner === 1 : winner === 2);
    else youWin = winner === 1;                 // P1 is the human in cpu/local -> "P1 wins"
    const t = $("result-title"), sub = $("result-sub");
    if (curMode === "local") { t.textContent = (winner === 1 ? "RUBY WINS!" : "JADE WINS!"); t.className = "result-title win"; sub.textContent = "Player " + winner + " takes the match"; }
    else { t.textContent = youWin ? "YOU WIN!" : "YOU LOSE"; t.className = "result-title " + (youWin ? "win" : "lose"); sub.textContent = youWin ? "Flawless, champion! 🏆" : "Rematch and take revenge!"; }
    show("result");
  };
  Game.showGameUI = () => showGameUI(true);

  // ---------- Online (PeerJS) ----------
  function resetOnlineUI() {
    $("room-info").classList.add("hidden");
    $("room-code").textContent = "----";
    $("host-status").textContent = "Waiting for player 2…";
    $("guest-status").textContent = "";
    $("join-code").value = "";
  }
  function code4() { const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = ""; for (let i = 0; i < 4; i++) r += s[Math.floor(Math.random() * s.length)]; return r; }
  function noPeer() { return typeof Peer === "undefined"; }

  $("create-room").addEventListener("click", () => {
    if (noPeer()) { $("host-status").textContent = "⚠ No internet — online needs a connection."; $("room-info").classList.remove("hidden"); return; }
    cleanupPeer();
    const code = code4();
    $("room-info").classList.remove("hidden");
    $("room-code").textContent = code;
    $("host-status").textContent = "Starting room…";
    peer = new Peer("fc-" + code);
    peer.on("open", () => { $("host-status").textContent = "Waiting for player 2 to join…"; });
    peer.on("error", e => { $("host-status").textContent = "⚠ " + (e.type === "unavailable-id" ? "Code busy, try again" : "Error: " + e.type); });
    peer.on("connection", c => {
      conn = c;
      c.on("open", () => { $("host-status").textContent = "Player 2 connected! Fighting…"; hookHost(); send({ t: "start" }); setTimeout(() => launch("online", "host"), 300); });
      c.on("data", onHostData);
      c.on("close", () => backToMenuMsg("Opponent left."));
    });
  });

  $("join-room").addEventListener("click", () => {
    if (noPeer()) { $("guest-status").textContent = "⚠ No internet — online needs a connection."; return; }
    const code = ($("join-code").value || "").trim().toUpperCase();
    if (code.length < 4) { $("guest-status").textContent = "Enter the 4-letter code."; return; }
    cleanupPeer();
    $("guest-status").textContent = "Connecting…";
    peer = new Peer();
    peer.on("open", () => {
      conn = peer.connect("fc-" + code, { reliable: false });
      conn.on("open", () => { $("guest-status").textContent = "Connected! Waiting for host…"; hookGuest(); });
      conn.on("data", onGuestData);
      conn.on("close", () => backToMenuMsg("Host left."));
      conn.on("error", () => { $("guest-status").textContent = "⚠ Could not connect. Check the code."; });
    });
    peer.on("error", e => { $("guest-status").textContent = "⚠ " + (e.type === "peer-unavailable" ? "Room not found." : e.type); });
  });

  // host receives guest input
  function onHostData(d) { if (d && d.t === "in") Game.setRemoteInput(d.u); else if (d && d.t === "rematch") { send({ t: "start" }); launch("online", "host"); } }
  // guest receives host state
  function onGuestData(d) {
    if (!d) return;
    if (d.t === "start") { launch("online", "guest"); }
    else if (d.t === "st") { Game.applyState(d.s); }
  }

  function hookHost() {
    let last = 0;
    Game.onHostFrame = (state) => { const now = performance.now(); if (now - last < 33) return; last = now; send({ t: "st", s: state }); };
    Game.onLocalInputChange = null;   // host input is local-sim, no need to send
  }
  function hookGuest() {
    Game.onLocalInputChange = (inp) => send({ t: "in", u: inp });
    Game.onHostFrame = null;
  }

  function send(obj) { try { if (conn && conn.open) conn.send(obj); } catch (_) {} }
  function backToMenuMsg(msg) { showGameUI(false); show("online"); resetOnlineUI(); $("host-status").textContent = msg; $("guest-status").textContent = msg; }
  function cleanupPeer() { try { conn && conn.close(); } catch (_) {} try { peer && peer.destroy(); } catch (_) {} conn = null; peer = null; }

  // ---------- Sound ----------
  let ac = null;
  Game.onHit = (blocking) => {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.connect(g); g.connect(ac.destination);
      if (blocking) { o.type = "square"; o.frequency.setValueAtTime(220, t); }
      else { o.type = "sawtooth"; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12); }
      g.gain.setValueAtTime(blocking ? 0.04 : 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    } catch (_) {}
  };

  // auto-uppercase join code
  $("join-code").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase(); });
})();
