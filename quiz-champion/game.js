/* ============================================================
   QUIZ CHAMPION — KBC-style game logic
   ============================================================ */
(() => {
  "use strict";

  // Money ladder (index 0 = Q1). Safe checkpoints at Q5 and Q10.
  const LADDER = [
    { label: "1,000" }, { label: "2,000" }, { label: "3,000" }, { label: "5,000" },
    { label: "10,000", safe: true }, { label: "20,000" }, { label: "40,000" },
    { label: "80,000" }, { label: "1,60,000" }, { label: "3,20,000", safe: true },
    { label: "6,40,000" }, { label: "12,50,000" }, { label: "25,00,000" },
    { label: "50,00,000" }, { label: "1,00,00,000" },
  ];
  const QTIME = 30; // seconds per question

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const homeScreen = $("home"), gameScreen = $("game"), resultScreen = $("result");
  const catGrid = $("category-grid");
  const ladderEl = $("ladder");
  const optionEls = Array.from(document.querySelectorAll(".option"));
  const qText = $("question-text"), qIndex = $("q-index"), qAmount = $("q-amount");
  const timerEl = $("timer");
  const catIcon = $("cat-icon"), catName = $("cat-name");
  const ll5050 = $("ll-5050"), llPoll = $("ll-poll"), llPhone = $("ll-phone");

  // ---------- State ----------
  let qs = [];            // the 15 questions for this game (with shuffled options)
  let level = 0;          // current question index 0..14
  let correctIdx = 0;     // correct option index of current question
  let hidden = [];        // options hidden by 50:50
  let locked = false;
  let usedLL = { fifty: false, poll: false, phone: false };
  let timeLeft = QTIME, timerId = null, paused = false;

  // ---------- Build category cards ----------
  Object.keys(CATEGORIES).forEach((key) => {
    const c = CATEGORIES[key];
    const card = document.createElement("button");
    card.className = "cat-card";
    card.innerHTML = `<span class="ic">${c.icon}</span><span class="nm">${c.name}</span><span class="bl">${c.blurb}</span>`;
    card.addEventListener("click", () => startGame(key));
    catGrid.appendChild(card);
  });

  // ---------- Build ladder ----------
  LADDER.forEach((rung, i) => {
    const li = document.createElement("li");
    if (rung.safe) li.classList.add("safe");
    li.dataset.i = i;
    li.innerHTML = `<span class="lvl">${i + 1}</span><span class="amt">₹${rung.label}</span>`;
    ladderEl.appendChild(li);
  });

  // ---------- Helpers ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Guaranteed (safe-haven) amount label if you fail at index `i`
  function guaranteedLabel(correctCount) {
    if (correctCount >= 10) return "3,20,000";
    if (correctCount >= 5) return "10,000";
    return "0";
  }

  function show(screen) {
    [homeScreen, gameScreen, resultScreen].forEach((s) => s.classList.add("hidden"));
    screen.classList.remove("hidden");
  }

  // ---------- Flow ----------
  function startGame(key) {
    const cat = CATEGORIES[key];
    catIcon.textContent = cat.icon;
    catName.textContent = cat.name;

    // Take 15 questions, shuffle each question's options
    qs = cat.questions.slice(0, 15).map((item) => {
      const opts = item.o.map((text, idx) => ({ text, correct: idx === item.a }));
      const shuffled = shuffle(opts);
      return { q: item.q, opts: shuffled, correct: shuffled.findIndex((o) => o.correct) };
    });

    level = 0;
    usedLL = { fifty: false, poll: false, phone: false };
    show(gameScreen);
    loadQuestion();
  }

  function loadQuestion() {
    const item = qs[level];
    correctIdx = item.correct;
    hidden = [];
    locked = false;

    qIndex.textContent = level + 1;
    qAmount.textContent = "₹" + LADDER[level].label;
    qText.textContent = item.q;

    optionEls.forEach((el, i) => {
      el.className = "option";
      el.disabled = false;
      el.querySelector(".opt-text").textContent = item.opts[i].text;
    });

    // Lifeline buttons reflect usage
    ll5050.classList.toggle("used", usedLL.fifty);
    llPoll.classList.toggle("used", usedLL.poll);
    llPhone.classList.toggle("used", usedLL.phone);
    ll5050.disabled = usedLL.fifty;
    llPoll.disabled = usedLL.poll;
    llPhone.disabled = usedLL.phone;

    updateLadder();
    startTimer();
  }

  function updateLadder() {
    Array.from(ladderEl.children).forEach((li) => {
      const i = Number(li.dataset.i);
      li.classList.toggle("current", i === level);
      li.classList.toggle("done", i < level);
    });
  }

  // ---------- Timer ----------
  function startTimer() {
    clearInterval(timerId);
    timeLeft = QTIME; paused = false;
    renderTimer();
    timerId = setInterval(() => {
      if (paused) return;
      timeLeft--;
      renderTimer();
      if (timeLeft <= 0) {
        clearInterval(timerId);
        timeOut();
      }
    }, 1000);
  }
  function renderTimer() {
    timerEl.textContent = timeLeft;
    timerEl.classList.toggle("warn", timeLeft <= 10);
  }

  function timeOut() {
    locked = true;
    optionEls.forEach((el) => (el.disabled = true));
    optionEls[correctIdx].classList.add("correct");
    setTimeout(() => endGame(false), 1600);
  }

  // ---------- Answering ----------
  optionEls.forEach((el) => {
    el.addEventListener("click", () => {
      if (locked || el.classList.contains("hide")) return;
      const i = Number(el.dataset.i);
      lockAnswer(i);
    });
  });

  function lockAnswer(i) {
    locked = true;
    paused = true;
    optionEls.forEach((el) => (el.disabled = true));
    setLifelinesEnabled(false);
    optionEls[i].classList.add("locked");

    setTimeout(() => {
      optionEls[correctIdx].classList.add("correct");
      const right = i === correctIdx;
      if (!right) optionEls[i].classList.remove("locked"), optionEls[i].classList.add("wrong");
      sfx(right ? "correct" : "wrong");

      setTimeout(() => {
        if (right) {
          if (level === 14) { endGame(true); }
          else { level++; loadQuestion(); }
        } else {
          endGame(false);
        }
      }, 1500);
    }, 1200);
  }

  // ---------- End ----------
  function endGame(won) {
    clearInterval(timerId);
    let amount, title, detail;
    if (won) {
      amount = "1,00,00,000";
      title = "🏆 JACKPOT!";
      detail = "You answered all 15 questions correctly. You are a Quiz Champion!";
    } else {
      amount = guaranteedLabel(level); // level = number answered correctly before failing
      title = "Game Over";
      detail = `You reached question ${level + 1}. Safe-checkpoint winnings secured.`;
    }
    $("result-title").textContent = title;
    $("result-sub").textContent = won ? "You won the grand prize" : "You walked away with";
    $("result-amount").textContent = "₹" + amount;
    $("result-detail").textContent = detail;
    sfx(won ? "win" : "lose");
    show(resultScreen);
  }

  function quit() {
    if (locked) return;
    clearInterval(timerId);
    const label = level === 0 ? "0" : LADDER[level - 1].label;
    $("result-title").textContent = "You Quit 🚪";
    $("result-sub").textContent = "You took home";
    $("result-amount").textContent = "₹" + label;
    $("result-detail").textContent = `Smart move — you kept your winnings after ${level} correct answer${level === 1 ? "" : "s"}.`;
    show(resultScreen);
  }

  // ---------- Lifelines ----------
  function setLifelinesEnabled(on) {
    [["fifty", ll5050], ["poll", llPoll], ["phone", llPhone]].forEach(([k, btn]) => {
      btn.disabled = usedLL[k] || !on;
    });
  }

  ll5050.addEventListener("click", () => {
    if (usedLL.fifty || locked) return;
    usedLL.fifty = true; ll5050.classList.add("used"); ll5050.disabled = true;
    // hide two wrong, still-visible options
    const wrong = optionEls.map((_, i) => i).filter((i) => i !== correctIdx && !optionEls[i].classList.contains("hide"));
    shuffle(wrong).slice(0, 2).forEach((i) => { optionEls[i].classList.add("hide"); hidden.push(i); });
    sfx("click");
  });

  llPoll.addEventListener("click", () => {
    if (usedLL.poll || locked) return;
    usedLL.poll = true; llPoll.classList.add("used"); llPoll.disabled = true;

    const visible = optionEls.map((el, i) => i).filter((i) => !optionEls[i].classList.contains("hide"));
    // correct gets a strong share, rest random
    const pcts = {};
    let correctShare = 45 + Math.floor(Math.random() * 25); // 45-69%
    if (visible.length === 2) correctShare = 60 + Math.floor(Math.random() * 20);
    pcts[correctIdx] = correctShare;
    let remaining = 100 - correctShare;
    const others = visible.filter((i) => i !== correctIdx);
    others.forEach((idx, k) => {
      if (k === others.length - 1) pcts[idx] = remaining;
      else { const v = Math.floor(Math.random() * (remaining - (others.length - 1 - k))); pcts[idx] = v; remaining -= v; }
    });

    const letters = ["A", "B", "C", "D"];
    const maxPct = Math.max(...visible.map((i) => pcts[i]), 1);
    const bars = $("poll-bars");
    bars.innerHTML = "";
    visible.forEach((i) => {
      const wrap = document.createElement("div");
      wrap.className = "poll-bar";
      wrap.innerHTML = `<span class="pct">${pcts[i]}%</span><div class="bar" style="height:0"></div><span class="lab">${letters[i]}</span>`;
      bars.appendChild(wrap);
      requestAnimationFrame(() => { wrap.querySelector(".bar").style.height = Math.max(8, (pcts[i] / maxPct) * 130) + "px"; });
    });
    openPopup($("poll-popup"));
    sfx("click");
  });

  llPhone.addEventListener("click", () => {
    if (usedLL.phone || locked) return;
    usedLL.phone = true; llPhone.classList.add("used"); llPhone.disabled = true;

    const visible = optionEls.map((el, i) => i).filter((i) => !optionEls[i].classList.contains("hide"));
    const letters = ["A", "B", "C", "D"];
    // friend is right ~70% of the time
    let pick = correctIdx;
    if (Math.random() > 0.7) {
      const wrong = visible.filter((i) => i !== correctIdx);
      if (wrong.length) pick = wrong[Math.floor(Math.random() * wrong.length)];
    }
    const conf = pick === correctIdx
      ? ["I'm pretty sure", "Almost certain it's", "Yes — go with"][Math.floor(Math.random() * 3)]
      : ["I think, but not 100% sure, it's", "Maybe try", "I'd guess"][Math.floor(Math.random() * 3)];
    const txt = qs[level].opts[pick].text;
    $("phone-text").innerHTML = `Your friend says:<br><br>"${conf} <b>${letters[pick]}: ${txt}</b>."`;
    openPopup($("phone-popup"));
    sfx("click");
  });

  // ---------- Popups ----------
  function openPopup(p) { paused = true; p.classList.remove("hidden"); }
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      b.closest(".popup").classList.add("hidden");
      if (!locked) paused = false;
    })
  );

  $("quit-btn").addEventListener("click", quit);
  $("again-btn").addEventListener("click", () => show(homeScreen));
  $("home-btn").addEventListener("click", () => show(homeScreen));

  // ---------- Sound (Web Audio, no files) ----------
  let ac = null;
  function sfx(type) {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime;
      const map = {
        click:   { type: "square",   f: 440, f2: 520, d: 0.08, v: 0.04 },
        correct: { type: "triangle", f: 660, f2: 990, d: 0.25, v: 0.06 },
        wrong:   { type: "sawtooth", f: 300, f2: 90,  d: 0.4,  v: 0.07 },
        win:     { type: "triangle", f: 880, f2: 1320,d: 0.5,  v: 0.07 },
        lose:    { type: "sawtooth", f: 260, f2: 70,  d: 0.5,  v: 0.07 },
      }[type] || {};
      o.type = map.type; o.frequency.setValueAtTime(map.f, t);
      o.frequency.exponentialRampToValueAtTime(map.f2, t + map.d);
      g.gain.setValueAtTime(map.v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + map.d + 0.05);
      o.start(t); o.stop(t + map.d + 0.06);
    } catch (_) {}
  }

  // start on the category screen
  show(homeScreen);
})();
