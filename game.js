
/* Load the Barbell 3D
   Three.js + Vanilla JavaScript
   Para Powerlifting Championship
*/

const $ = id => document.getElementById(id);

// ==============================
// GAME CONFIGURATION
// ==============================

const targets = [60, 80, 100, 120, 135];

const plates = [
  [25, 0xc8102e],
  [20, 0x1f5fbf],
  [15, 0xe3b341],
  [10, 0x2e9d57],
  [5, 0xf4f1e8],
  [2.5, 0x232a33],
  [1.25, 0xaab4c2]
];

let round = 0;
let stack = [];
let moves = 0;
let score = 0;
let active = false;
let timer;
let next;
let deadline;
let remaining = 30;
let results = [];
let best = 0;

let visual = () => {};

// ==============================
// PERSONAL BEST
// ==============================

try {
  best = Number(
    localStorage.getItem('loadTheBarbell.best3d')
  ) || 0;
} catch {}

$('best').textContent = best;

// ==============================
// WEIGHT CALCULATION
// ==============================

const weight = () =>
  20 + 2 * stack.reduce((a, b) => a + b, 0);

function par(target) {
  const n = (target - 20) / 2 / 1.25;
  const d = Array(n + 1).fill(Infinity);

  d[0] = 0;

  for (let i = 1; i <= n; i++) {
    for (const [kg] of plates) {
      const v = kg / 1.25;

      if (v <= i) {
        d[i] = Math.min(d[i], d[i - v] + 1);
      }
    }
  }

  return d[n];
}

// ==============================
// UPDATE GAME INTERFACE
// ==============================

function render() {
  $('round').textContent = `${round + 1}/5`;
  $('moves').textContent = moves;
  $('score').textContent = score;
  $('target').textContent = targets[round] + ' kg';
  $('current').textContent = weight() + ' kg';

  $('undo').disabled = !active || !stack.length;

  for (const b of $('rack').children) {
    b.disabled = !active;
  }

  visual(stack);
}

// ==============================
// TIMER
// ==============================

function tick() {
  remaining = Math.max(
    0,
    (deadline - performance.now()) / 1000
  );

  $('time').textContent = remaining.toFixed(1);

  $('fill').style.transform =
    `scaleX(${remaining / 30})`;

  if (!remaining && active) {
    endRound(false);
  }
}

// ==============================
// ADD / REMOVE WEIGHT PLATES
// ==============================

function change(kg) {
  if (!active) return;

  tick();

  if (!active) return;

  if (kg === null) {
    if (!stack.length) return;

    stack.pop();
  } else {
    if (stack.length >= 8) {
      $('hint').textContent =
        'Sleeves full. Undo a plate pair.';

      return;
    }

    stack.push(kg);
  }

  moves++;

  render();

  const delta = targets[round] - weight();

  if (!delta) {
    endRound(true);
  } else {
    $('hint').textContent = delta > 0
      ? `${delta} kg to go!`
      : `${-delta} kg too much. Try Undo.`;
  }
}

// ==============================
// END ROUND
// ==============================

function endRound(ok) {
  active = false;

  clearInterval(timer);

  const p = par(targets[round]);

  const points = ok
    ? Math.max(
        0,
        500 - 50 * Math.max(0, moves - p)
      ) + Math.round(remaining * 10)
    : 0;

  score += points;

  results.push(
    `${targets[round]} kg — ${
      ok
        ? moves + ' moves (par ' + p + ')'
        : 'Time up'
    } — ${points} pts`
  );

  render();

  $('hint').textContent = ok
    ? `Great load! +${points} points`
    : 'Time up. Keep going!';

  if (ok) {
  }

  next = setTimeout(() => {
    if (round === 4) {
      finish();
    } else {
      round++;
      startRound();
    }
  }, 1500);
}

// ==============================
// START ROUND
// ==============================

function startRound() {
  clearInterval(timer);
  clearTimeout(next);

  stack = [];
  moves = 0;
  active = true;

  deadline = performance.now() + 30000;

  render();

  $('hint').textContent = `Load ${targets[round]} kg!`;

  tick();

  timer = setInterval(tick, 100);
}

// ==============================
// FINISH GAME
// ==============================

function finish() {
  if (score > best) {
    best = score;

    try {
      localStorage.setItem(
        'loadTheBarbell.best3d',
        best
      );
    } catch {}
  }

  $('best').textContent = best;

  $('title').textContent = 'Session complete';

  $('message').textContent =
    `${score} points — Well played!`;

  $('results').replaceChildren(
    ...results.map(s => {
      const li = document.createElement('li');

      li.textContent = s;

      return li;
    })
  );

  $('start').textContent = 'Play again';

  $('modal').showModal();
}

// ==============================
// RESTART GAME
// ==============================

function restart() {
  clearTimeout(next);
  clearInterval(timer);

  round = 0;
  score = 0;
  results = [];

  if ($('modal').open) {
    $('modal').close();
  }

  startRound();
}

// ==============================
// CREATE WEIGHT BUTTONS
// ==============================

for (const [kg, color] of plates) {
  const b = document.createElement('button');

  b.className = 'plate';

  b.style.background =
    '#' + color.toString(16).padStart(6, '0');

  b.style.color = [15, 5, 1.25].includes(kg)
    ? '#0b1626'
    : 'white';

  b.innerHTML = `${kg}<small>kg</small>`;

  b.setAttribute(
    'aria-label',
    `Add ${kg} kilogram plate to both sides`
  );

  b.onclick = () => change(kg);

  $('rack').append(b);
}

// ==============================
// EVENT LISTENERS
// ==============================

$('undo').onclick = () => change(null);

$('restart').onclick = restart;

$('start').onclick = restart;

$('modal').addEventListener('cancel', e => {
  e.preventDefault();
});

render();

$('modal').showModal();

// ==============================
// THREE.JS — 3D ENVIRONMENT
// ==============================

(async () => {
  try {

    // Import Three.js from CDN

    const T = await import(
      'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'
    );

    const host = $('scene');

    // Create scene

    const scene = new T.Scene();

    // Create perspective camera

    const camera = new T.PerspectiveCamera(
      36,
      1,
      0.1,
      100
    );

    camera.position.set(3, 3.2, 12);

    camera.lookAt(0, 1.3, 0);

    // Create WebGL renderer

    const renderer = new T.WebGLRenderer({
      alpha: true,
      antialias: true
    });

    renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.75)
    );

    host.append(renderer.domElement);

    // ==============================
    // LIGHTING
    // ==============================

    const ambientLight = new T.HemisphereLight(
      0xffffff,
      0x53627a,
      2.4
    );

    scene.add(ambientLight);

    const light = new T.DirectionalLight(
      0xffffff,
      3
    );

    light.position.set(3, 6, 5);

    scene.add(light);

    const rim = new T.DirectionalLight(
      0x8cbaff,
      2
    );

    rim.position.set(-4, 3, -4);

    scene.add(rim);

    // ==============================
    // CREATE 3D BARBELL
    // ==============================

    const bar = new T.Group();

    bar.position.y = 0.65;

    scene.add(bar);

    // Metallic steel material

    const steel = new T.MeshStandardMaterial({
      color: 0xbfcbd6,
      metalness: 0.75,
      roughness: 0.24
    });

    const goldSteel = new T.MeshStandardMaterial({
      color: 0xe3b341,
      metalness: 0.82,
      roughness: 0.2
    });

    // Cylinder creation helper

    function cylinder(
      radius,
      length,
      material,
      x
    ) {
      const geometry = new T.CylinderGeometry(
        radius,
        radius,
        length,
        48
      );

      const mesh = new T.Mesh(
        geometry,
        material
      );

      mesh.rotation.z = Math.PI / 2;

      mesh.position.x = x;

      return mesh;
    }

    // Gold bar shaft

    bar.add(
      cylinder(0.075, 7, goldSteel, 0)
    );

    // Left and right sleeves

    for (const s of [-1, 1]) {
      bar.add(
        cylinder(
          0.13,
          2.25,
          steel,
          s * 2.35
        )
      );

      // Barbell collars

      bar.add(
        cylinder(
          0.22,
          0.12,
          steel,
          s * 1.18
        )
      );
    }

    // Group containing loaded plates

    const loaded = new T.Group();

    bar.add(loaded);

    const reduced = matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let previous = [];

    // ==============================
    // RENDER 3D WEIGHT PLATES
    // ==============================

    visual = values => {
      // Remove previous plate meshes

      while (loaded.children.length) {
        const mesh = loaded.children[0];

        loaded.remove(mesh);

        mesh.geometry.dispose();

        mesh.material.dispose();
      }

      // Create new weight plates

      values.forEach((kg, i) => {

        const color = plates.find(
          p => p[0] === kg
        )[1];

        // Add plates to both sides

        for (const s of [-1, 1]) {

          const material =
            new T.MeshStandardMaterial({
              color: color,
              roughness: 0.38,
              metalness: 0.15
            });

          // Plate sizes based on weight

          const radius =
            kg >= 10
              ? 0.62
              : kg >= 5
                ? 0.45
                : kg >= 2.5
                  ? 0.33
                  : 0.25;

          const x = s * (1.36 + i * 0.25);

          const mesh = cylinder(
            radius,
            0.22,
            material,
            x
          );

          mesh.userData.target = x;

          // Slide new plates onto the bar

          if (!reduced && i >= previous.length) {
            mesh.position.x = x + s * 0.7;
          }

          loaded.add(mesh);
        }
      });

      previous = [...values];
    };

    // ==============================
    // RESPONSIVE 3D CANVAS
    // ==============================

    function resize() {
      const w = host.clientWidth;

      const h = host.clientHeight;

      renderer.setSize(w, h, false);

      camera.aspect = w / h;

      camera.position.z = Math.max(
        12,
        12 / camera.aspect
      );

      camera.lookAt(0, 1.3, 0);

      camera.updateProjectionMatrix();
    }

    new ResizeObserver(resize).observe(host);

    resize();

    visual(stack);

    // ==============================
    // ANIMATION LOOP
    // ==============================

    renderer.setAnimationLoop(() => {

      // Animate plates sliding onto barbell

      for (const mesh of loaded.children) {
        mesh.position.x += (
          mesh.userData.target -
          mesh.position.x
        ) * 0.18;
      }

      // Render every frame

      renderer.render(scene, camera);
    });

  } catch (error) {

    // Keep game playable if WebGL fails

    $('fallback').hidden = false;

    console.warn('3D unavailable', error);
  }
})();
