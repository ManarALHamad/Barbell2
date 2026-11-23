/* Load the Barbell
   Tap a plate to load it on both sides of the bar. Reach the target weight
   with the fewest moves before the 30 second timer runs out.
   Edit LOGO_SRC, TARGETS and the timings below to tune the game. */

(() => {
  'use strict';

  // ---------- CONFIG ----------
  const LOGO_SRC = 'assets/logo.png';
  const BAR_WEIGHT = 20;          // kg, empty bar
  const ROUND_TIME = 30;          // seconds per round
  const MAX_PER_SIDE = 8;         // plates that fit on one sleeve
  const TARGETS = [60, 80, 100, 120, 135];  // kg, one per round
  const NEXT_ROUND_DELAY = 1500;  // ms pause between rounds

  // Plate weights in kg, with standard competition colours
  const PLATES = [
    { kg: 25,   bg: '#c8102e', fg: '#ffffff', h: 100 },
    { kg: 20,   bg: '#1f5fbf', fg: '#ffffff', h: 92 },
    { kg: 15,   bg: '#e3b341', fg: '#0b1626', h: 84 },
    { kg: 10,   bg: '#2e9d57', fg: '#ffffff', h: 76 },
    { kg: 5,    bg: '#f4f1e8', fg: '#0b1626', h: 62 },
    { kg: 2.5,  bg: '#232a33', fg: '#ffffff', h: 50 },
    { kg: 1.25, bg: '#aab4c2', fg: '#0b1626', h: 40 }
  ];
  // ----------------------------

  const BEST_KEY = 'loadTheBarbell.best';
  const UNIT = 1.25; // smallest plate, used for the par calculation

  const el = (id) => document.getElementById(id);
  const roundEl = el('round');
  const movesEl = el('moves');
  const totalEl = el('total');
  const bestEl = el('best');
  const timeFill = el('timeFill');
  const timeLeftEl = el('timeLeft');
  const targetEl = el('target');
  const currentEl = el('current');
  const hintEl = el('hint');
  const leftSide = el('leftSide');
  const rightSide = el('rightSide');
  const rack = el('rack');
  const undoBtn = el('undo');
  const startModal = el('startModal');
  const endModal = el('endModal');

  let roundIndex = 0;
  let stack = [];            // plate weights loaded, one entry per pair
  let moves = 0;
  let totalScore = 0;
  let results = [];
  let active = false;
  let timerId = null;
  let roundStart = 0;
  let timeLeft = ROUND_TIME;

  // Logo with graceful fallback
  ['logo', 'startLogo', 'endLogo'].forEach((id) => {
    const img = el(id);
    img.src = LOGO_SRC;
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  // Fewest plate pairs needed to reach a target (the "par" for moves)
  function parMoves(target) {
    const perSide = (target - BAR_WEIGHT) / 2;
    const units = Math.round(perSide / UNIT);
    const values = PLATES.map((p) => Math.round(p.kg / UNIT));
    const best = new Array(units + 1).fill(Infinity);
    best[0] = 0;
    for (let u = 1; u <= units; u++) {
      for (const v of values) {
        if (v <= u && best[u - v] + 1 < best[u]) best[u] = best[u - v] + 1;
      }
    }
    return best[units];
  }

  const weightOnBar = () => BAR_WEIGHT + 2 * stack.reduce((sum, kg) => sum + kg, 0);
  const fmt = (kg) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/0$/, '')) + ' kg';

  function loadBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)); } catch (e) { return null; }
  }
  function saveBest(score) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify({ score })); } catch (e) { /* ignore */ }
  }
  function showBest() {
    const best = loadBest();
    bestEl.textContent = best ? String(best.score) : '–';
  }

  function plateNode(p) {
    const d = document.createElement('div');
    d.className = 'plate';
    // Plate heights are pixel sizes. Percentages here resolve against the
    // sleeve's stretched flex height in some layouts, making plates tower
    // over the bar and cover the rack and action buttons.
    d.style.height = p.h + 'px';
    d.style.background = p.bg;
    d.style.color = p.fg;
    const label = document.createElement('span');
    label.textContent = p.kg;
    d.append(label);
    return d;
  }

  function buildRack() {
    rack.replaceChildren(...PLATES.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rack-plate';
      b.style.background = p.bg;
      b.style.color = p.fg;
      b.setAttribute('aria-label', 'Add ' + p.kg + ' kg plate to both sides');
      b.innerHTML = p.kg + '<small>kg</small>';
      b.addEventListener('click', () => addPlate(p.kg));
      return b;
    }));
  }

  function plateByKg(kg) {
    return PLATES.find((p) => p.kg === kg);
  }

  function renderBar() {
    leftSide.replaceChildren(...stack.map((kg) => plateNode(plateByKg(kg))));
    rightSide.replaceChildren(...stack.map((kg) => plateNode(plateByKg(kg))));
    const w = weightOnBar();
    currentEl.textContent = fmt(w);
    movesEl.textContent = moves;
    undoBtn.disabled = !active || stack.length === 0;
    rack.querySelectorAll('button').forEach((b) => { b.disabled = !active; });
  }

  function setStatus(w, target) {
    const box = currentEl.parentElement;
    box.classList.remove('over', 'done');
    hintEl.classList.remove('over', 'good');
    if (w === target) {
      box.classList.add('done');
    } else if (w > target) {
      box.classList.add('over');
      hintEl.classList.add('over');
      hintEl.textContent = 'Over by ' + fmt(w - target) + '. Tap Undo to remove a plate pair.';
    } else {
      hintEl.textContent = 'Need ' + fmt(target - w) + ' more.';
    }
  }

  function addPlate(kg) {
    if (!active) return;
    if (stack.length >= MAX_PER_SIDE) {
      hintEl.classList.add('over');
      hintEl.textContent = 'The sleeves are full. Tap Undo to remove a plate pair.';
      return;
    }
    stack.push(kg);
    moves++;
    afterChange();
  }

  function undo() {
    if (!active || stack.length === 0) return;
    stack.pop();
    moves++;
    afterChange();
  }

  function afterChange() {
    const target = TARGETS[roundIndex];
    renderBar();
    setStatus(weightOnBar(), target);
    if (weightOnBar() === target) winRound();
  }

  function startTimer() {
    roundStart = performance.now();
    timeLeft = ROUND_TIME;
    updateTimeUI();
    timerId = setInterval(() => {
      timeLeft = Math.max(0, ROUND_TIME - (performance.now() - roundStart) / 1000);
      updateTimeUI();
      if (timeLeft <= 0) timeUp();
    }, 100);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  function updateTimeUI() {
    timeLeftEl.textContent = timeLeft.toFixed(1);
    timeFill.style.transform = 'scaleX(' + (timeLeft / ROUND_TIME) + ')';
    timeFill.classList.toggle('low', timeLeft <= 8);
  }

  // Score: 500 for the right weight, minus 50 for each move above par,
  // plus 10 points for every second left on the clock.
  function roundScore(par) {
    const extra = Math.max(0, moves - par);
    return Math.max(0, 500 - extra * 50) + Math.round(timeLeft * 10);
  }

  function winRound() {
    stopTimer();
    active = false;
    const target = TARGETS[roundIndex];
    const par = parMoves(target);
    const score = roundScore(par);
    totalScore += score;
    totalEl.textContent = totalScore;
    results.push({ target, moves, par, score, ok: true });

    hintEl.classList.remove('over');
    hintEl.classList.add('good');
    hintEl.textContent = moves <= par
      ? 'Perfect load! ' + moves + ' moves, +' + score + ' pts.'
      : 'Lifted! ' + moves + ' moves (par ' + par + '), +' + score + ' pts.';

    renderBar();
    nextRoundSoon();
  }

  function timeUp() {
    stopTimer();
    active = false;
    const target = TARGETS[roundIndex];
    results.push({ target, moves, par: parMoves(target), score: 0, ok: false });
    hintEl.classList.remove('good');
    hintEl.classList.add('over');
    hintEl.textContent = 'Time up! The target was ' + fmt(target) + '.';
    renderBar();
    nextRoundSoon();
  }

  function nextRoundSoon() {
    setTimeout(() => {
      roundIndex++;
      if (roundIndex >= TARGETS.length) finishSession();
      else startRound();
    }, NEXT_ROUND_DELAY);
  }

  function startRound() {
    stack = [];
    moves = 0;
    active = true;
    const target = TARGETS[roundIndex];
    roundEl.textContent = (roundIndex + 1) + '/' + TARGETS.length;
    targetEl.textContent = fmt(target);
    currentEl.parentElement.classList.remove('over', 'done');
    hintEl.classList.remove('over', 'good');
    hintEl.textContent = 'Tap a plate to load it on both sides. The empty bar weighs ' + BAR_WEIGHT + ' kg.';
    renderBar();
    setStatus(weightOnBar(), target);
    startTimer();
  }

  function finishSession() {
    const best = loadBest();
    const isNewBest = totalScore > 0 && (!best || totalScore > best.score);
    if (isNewBest) saveBest(totalScore);

    el('finalScore').textContent = totalScore;
    el('newBest').hidden = !isNewBest;
    el('breakdown').replaceChildren(...results.map((r) => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = fmt(r.target);
      const mid = document.createElement('span');
      mid.className = 'muted';
      mid.textContent = r.ok ? r.moves + ' moves (par ' + r.par + ')' : 'Time up';
      const right = document.createElement('span');
      right.textContent = r.score + ' pts';
      li.append(left, mid, right);
      return li;
    }));
    showBest();
    endModal.hidden = false;
    el('playAgain').focus();
  }

  function newSession() {
    stopTimer();
    roundIndex = 0;
    totalScore = 0;
    results = [];
    totalEl.textContent = '0';
    endModal.hidden = true;
    startModal.hidden = true;
    showBest();
    startRound();
  }

  function init() {
    buildRack();
    showBest();
    targetEl.textContent = fmt(TARGETS[0]);
    roundEl.textContent = '1/' + TARGETS.length;
    renderBar();
    undoBtn.addEventListener('click', undo);
    el('restart').addEventListener('click', newSession);
    el('playAgain').addEventListener('click', newSession);
    el('startBtn').addEventListener('click', newSession);
    el('startBtn').focus();
  }

  init();
})();