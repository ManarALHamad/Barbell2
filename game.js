/* Load the Barbell
   Tap a plate to load it on both sides of the bar. Reach the target weight
   with the fewest moves before the 30 second timer runs out.
   Edit LOGO_SRC and the timings below to tune the game. */
(() => {
  'use strict';

  // ---------- CONFIG ----------
  const LOGO_SRC = 'assets/logo.png';
  const BAR_WEIGHT = 20;          // kg, empty bar
  const ROUND_TIME = 30;          // seconds per round
  const MAX_PER_SIDE = 8;         // plates that fit on one sleeve
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
  const bar3d = el('bar3d');
  const barWrap = document.querySelector('.bar-wrap');

  let roundIndex = 0;
  let targets = [];
  let stack = [];            // plate weights loaded, one entry per pair
  let moves = 0;
  let totalScore = 0;
  let results = [];
  let active = false;
  let timerId = null;
  let roundStart = 0;
  let timeLeft = ROUND_TIME;
  let updateThreeBar = () => {};

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

  // Pick a fresh reachable set each session, with difficulty rising by round.
  function makeTargets() {
    const tiers = [
      { minPar: 2, maxPar: 3, count: 2 },
      { minPar: 4, maxPar: 5, count: 2 },
      { minPar: 6, maxPar: 7, count: 1 }
    ];
    const candidates = [];
    for (let units = 1; units <= MAX_PER_SIDE * 20; units++) {
      const target = BAR_WEIGHT + 2 * units * UNIT;
      const par = parMoves(target);
      if (par <= MAX_PER_SIDE) candidates.push({ target, par });
    }
    const chosen = [];
    for (const tier of tiers) {
      const pool = candidates.filter((item) =>
        item.par >= tier.minPar && item.par <= tier.maxPar &&
        !chosen.some((selected) => selected.target === item.target)
      );
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      chosen.push(...pool.slice(0, tier.count));
    }
    return chosen.sort((a, b) => a.par - b.par || a.target - b.target)
      .map((item) => item.target);
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
    updateThreeBar(stack);
    const w = weightOnBar();
    currentEl.textContent = fmt(w);
    movesEl.textContent = moves;
    undoBtn.disabled = !active || stack.length === 0;
    rack.querySelectorAll('button').forEach((b) => { b.disabled = !active; });
  }

  async function initThreeBarbell() {
    try {
      const THREE = await import(
        'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'
      );
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(3.1, 2.7, 6.2);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      bar3d.replaceChildren(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x26364b, 2.1));

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
      keyLight.position.set(-3, 7, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x9fc4ff, 1.4);
      rimLight.position.set(4, 3, -5);
      scene.add(rimLight);

      const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(4.7, 4.85, 0.16, 64),
        new THREE.MeshStandardMaterial({
          color: 0x17283d,
          metalness: 0.32,
          roughness: 0.62
        })
      );
      platform.position.y = -1.02;
      platform.receiveShadow = true;
      scene.add(platform);

      const barbell = new THREE.Group();
      scene.add(barbell);

      const goldSteel = new THREE.MeshStandardMaterial({
        color: 0xe3b341,
        metalness: 0.82,
        roughness: 0.22
      });
      const sleeveSteel = new THREE.MeshStandardMaterial({
        color: 0xaab8c8,
        metalness: 0.85,
        roughness: 0.24
      });
      const gripSteel = new THREE.MeshStandardMaterial({
        color: 0x526174,
        metalness: 0.45,
        roughness: 0.4
      });

      function horizontalCylinder(radius, length, material, x = 0, y = 0) {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, length, 48),
          material
        );
        mesh.rotation.z = Math.PI / 2;
        mesh.position.set(x, y, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
      }

      // A metallic gold shaft, with a short textured grip and steel sleeves.
      barbell.add(horizontalCylinder(0.075, 7.5, goldSteel));
      barbell.add(horizontalCylinder(0.088, 1.25, gripSteel));
      for (const side of [-1, 1]) {
        barbell.add(horizontalCylinder(0.13, 2.1, sleeveSteel, side * 3.45));
        barbell.add(horizontalCylinder(0.2, 0.12, goldSteel, side * 1.72));
      }

      const loadedPlates = new THREE.Group();
      barbell.add(loadedPlates);

      function clearLoadedPlates() {
        while (loadedPlates.children.length) {
          const object = loadedPlates.children[0];
          loadedPlates.remove(object);
          object.userData.materials?.forEach((material) => material.dispose());
          object.traverse((child) => {
            child.geometry?.dispose();
          });
        }
      }

      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      updateThreeBar = (weights) => {
        clearLoadedPlates();

        weights.forEach((kg, index) => {
          const spec = plateByKg(kg);
          const radius = 0.37 + (spec.h / 100) * 0.34;
          const plateMaterial = new THREE.MeshStandardMaterial({
            color: spec.bg,
            metalness: 0.16,
            roughness: 0.34
          });
          const pair = new THREE.Group();
          if (!reducedMotion) pair.scale.setScalar(0.08);

          for (const side of [-1, 1]) {
            const x = side * (1.88 + index * 0.245);
            const disk = new THREE.Mesh(
              new THREE.CylinderGeometry(radius, radius, 0.22, 48),
              plateMaterial
            );
            disk.rotation.z = Math.PI / 2;
            disk.position.x = x;
            disk.castShadow = true;
            disk.receiveShadow = true;
            pair.add(disk);

            const hub = horizontalCylinder(
              radius * 0.24,
              0.25,
              sleeveSteel,
              x
            );
            pair.add(hub);
          }

          pair.userData.materials = [plateMaterial];
          loadedPlates.add(pair);
        });
      };

      const unitScale = new THREE.Vector3(1, 1, 1);

      function resize() {
        const width = Math.max(1, bar3d.clientWidth);
        const height = Math.max(1, bar3d.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(bar3d);
      resize();
      updateThreeBar(stack);

      renderer.setAnimationLoop(() => {
        if (!reducedMotion) {
          for (const pair of loadedPlates.children) {
            pair.scale.lerp(unitScale, 0.18);
          }
        }
        renderer.render(scene, camera);
      });
      barWrap.classList.add('webgl-ready');
    } catch (error) {
      console.warn('3D barbell could not be initialized; using the flat fallback.', error);
    }
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
    const target = targets[roundIndex];
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
    const target = targets[roundIndex];
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
    const target = targets[roundIndex];
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
      if (roundIndex >= targets.length) finishSession();
      else startRound();
    }, NEXT_ROUND_DELAY);
  }

  function startRound() {
    stack = [];
    moves = 0;
    active = true;
    const target = targets[roundIndex];
    roundEl.textContent = (roundIndex + 1) + '/' + targets.length;
    targetEl.textContent = fmt(target);
    currentEl.parentElement.classList.remove('over', 'done');
    hintEl.classList.remove('over', 'good');
    hintEl.textContent = 'Tap a plate to load it on both sides. The empty bar weighs ' + BAR_WEIGHT + ' kg.';
    renderBar();
    setStatus(weightOnBar(), target);
    startTimer();
  }

  function finishSession() {
    const wins = results.filter((result) => result.ok).length;
    const sessionWon = wins === targets.length;
    const best = loadBest();
    const isNewBest = totalScore > 0 && (!best || totalScore > best.score);
    if (isNewBest) saveBest(totalScore);

    el('endTitle').textContent = sessionWon ? 'You win!' : 'Try again';
    el('sessionSummary').textContent = sessionWon
      ? `You won ${wins} of ${targets.length} rounds. Great lifting!`
      : `You won ${wins} of ${targets.length} rounds. Win all ${targets.length} rounds to take the session.`;
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
    targets = makeTargets();
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
    targets = makeTargets();
    roundEl.textContent = '1/' + targets.length;
    targetEl.textContent = fmt(targets[0]);
    renderBar();
    undoBtn.addEventListener('click', undo);
    el('restart').addEventListener('click', newSession);
    el('playAgain').addEventListener('click', newSession);
    el('startBtn').addEventListener('click', newSession);
    el('startBtn').focus();
  }

  init();
  initThreeBarbell();
})();
