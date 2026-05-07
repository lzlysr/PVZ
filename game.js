const ROWS = 5;
const COLS = 9;
const INITIAL_SUN = 150;
const SUN_VALUE = 25;

const PLANTS = {
  sunflower: {
    name: "向日葵",
    cost: 50,
    hp: 90,
    sunInterval: 6000,
  },
  peashooter: {
    name: "豌豆射手",
    cost: 100,
    hp: 120,
    fireInterval: 900,
  },
};

const WAVES = [
  { at: 4000, count: 1, gap: 3200 },
  { at: 22000, count: 2, gap: 4200 },
  { at: 44000, count: 3, gap: 4400 },
  { at: 70000, count: 4, gap: 4600 },
];

const board = document.querySelector("#game-board");
const sunCount = document.querySelector("#sun-count");
const waveLabel = document.querySelector("#wave-label");
const statusText = document.querySelector("#status-text");
const restartButton = document.querySelector("#restart-button");
const plantButtons = [...document.querySelectorAll(".plant-card")];

let selectedPlant = "sunflower";
let sunlight = INITIAL_SUN;
let plants = [];
let zombies = [];
let peas = [];
let suns = [];
let cells = [];
let waveQueue = [];
let gameState = "playing";
let startedAt = 0;
let lastFrame = 0;
let nextId = 1;
let animationId = 0;
let overlay;

function setupBoard() {
  board.innerHTML = "";
  cells = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.style.left = `${(col / COLS) * 100}%`;
      cell.style.top = `${(row / ROWS) * 100}%`;
      cell.style.width = `${100 / COLS}%`;
      cell.style.height = `${100 / ROWS}%`;
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列`);
      cell.addEventListener("click", () => plantAt(row, col));
      board.appendChild(cell);
      cells.push(cell);
    }
  }

  overlay = document.createElement("div");
  overlay.className = "message-overlay hidden";
  overlay.innerHTML = `
    <div class="message-card">
      <h2 id="result-title"></h2>
      <p id="result-copy"></p>
    </div>
  `;
  board.appendChild(overlay);
}

function resetGame() {
  cancelAnimationFrame(animationId);
  sunlight = INITIAL_SUN;
  plants = [];
  zombies = [];
  peas = [];
  suns = [];
  waveQueue = buildWaveQueue();
  gameState = "playing";
  nextId = 1;
  startedAt = performance.now();
  lastFrame = startedAt;
  selectedPlant = "sunflower";

  document.querySelectorAll(".entity, .pea, .sun-drop").forEach((node) => node.remove());
  clearOccupiedCells();
  overlay.classList.add("hidden");
  plantButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.plant === selectedPlant);
  });

  setStatus("选择植物，再点击草坪格子种植。");
  updateHud();
  animationId = requestAnimationFrame(gameLoop);
}

function buildWaveQueue() {
  const queue = [];
  WAVES.forEach((wave, waveIndex) => {
    for (let i = 0; i < wave.count; i += 1) {
      queue.push({
        spawnAt: wave.at + i * wave.gap,
        wave: waveIndex + 1,
      });
    }
  });
  return queue;
}

function plantAt(row, col) {
  if (gameState !== "playing") return;
  const config = PLANTS[selectedPlant];

  if (plants.some((plant) => plant.row === row && plant.col === col)) {
    setStatus("这个格子已经有植物了，请点击旁边的空格。");
    return;
  }

  if (sunlight < config.cost) {
    setStatus(`阳光不足，${config.name} 需要 ${config.cost} 阳光。`);
    return;
  }

  sunlight -= config.cost;
  const plant = {
    id: nextId++,
    type: selectedPlant,
    row,
    col,
    hp: config.hp,
    maxHp: config.hp,
    lastSunAt: performance.now(),
    lastFireAt: 0,
    element: createPlantElement(selectedPlant),
  };

  plants.push(plant);
  setCellOccupied(row, col, true);
  board.appendChild(plant.element);
  positionPlant(plant);
  setStatus(`${config.name} 已种下。`);
  updateHud();
}

function createPlantElement(type) {
  const element = document.createElement("div");
  element.className = `entity plant ${type}`;
  if (type === "peashooter") {
    const eye = document.createElement("span");
    eye.className = "eye";
    element.appendChild(eye);
  }
  return element;
}

function createZombie(row, now) {
  const element = document.createElement("div");
  element.className = "entity zombie";
  element.innerHTML = `
    <span class="face"></span>
    <span class="health-bar"><span class="health-fill"></span></span>
  `;
  board.appendChild(element);

  const zombie = {
    id: nextId++,
    row,
    x: board.clientWidth + 44,
    y: rowCenter(row),
    hp: 120,
    maxHp: 120,
    speed: 7 + Math.random() * 4,
    damage: 22,
    attackInterval: 900,
    lastAttackAt: now,
    targetPlantId: null,
    element,
  };

  zombies.push(zombie);
  positionZombie(zombie);
}

function createPea(plant, now) {
  const element = document.createElement("div");
  element.className = "entity pea";
  board.appendChild(element);

  const pea = {
    id: nextId++,
    row: plant.row,
    x: colCenter(plant.col) + 29,
    y: rowCenter(plant.row) - 12,
    damage: 35,
    speed: 260,
    createdAt: now,
    element,
  };

  peas.push(pea);
  positionPea(pea);
}

function createSun(row, col) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "sun-drop";
  element.textContent = `+${SUN_VALUE}`;
  const sun = {
    id: nextId++,
    row,
    col,
    x: colCenter(col),
    y: rowCenter(row) - 18,
    expiresAt: performance.now() + 7000,
    element,
  };

  element.addEventListener("click", () => collectSun(sun.id));
  suns.push(sun);
  board.appendChild(element);
  positionSun(sun);
}

function collectSun(id) {
  const sun = suns.find((item) => item.id === id);
  if (!sun || gameState !== "playing") return;
  sunlight += SUN_VALUE;
  sun.element.remove();
  suns = suns.filter((item) => item.id !== id);
  setStatus(`收集了 ${SUN_VALUE} 阳光。`);
  updateHud();
}

function gameLoop(now) {
  if (gameState !== "playing") return;

  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  const elapsed = now - startedAt;
  lastFrame = now;

  spawnZombies(elapsed, now);
  updatePlants(now);
  updatePeas(delta);
  updateZombies(now, delta);
  updateSuns(now);
  cleanupEntities();
  updateHud();
  checkEndState();

  if (gameState === "playing") {
    animationId = requestAnimationFrame(gameLoop);
  }
}

function spawnZombies(elapsed, now) {
  while (waveQueue.length && waveQueue[0].spawnAt <= elapsed) {
    const next = waveQueue.shift();
    createZombie(Math.floor(Math.random() * ROWS), now);
    waveLabel.textContent = `第 ${next.wave} 波`;
    setStatus(`第 ${next.wave} 波僵尸出现了。`);
  }
}

function updatePlants(now) {
  plants.forEach((plant) => {
    if (plant.type === "sunflower" && now - plant.lastSunAt >= PLANTS.sunflower.sunInterval) {
      createSun(plant.row, plant.col);
      plant.lastSunAt = now;
    }

    if (plant.type === "peashooter" && now - plant.lastFireAt >= PLANTS.peashooter.fireInterval) {
      const target = zombies
        .filter((zombie) => zombie.row === plant.row && zombie.x > colCenter(plant.col))
        .sort((a, b) => a.x - b.x)[0];
      if (target) {
        createPea(plant, now);
        plant.lastFireAt = now;
      }
    }
  });
}

function updatePeas(delta) {
  peas.forEach((pea) => {
    pea.x += pea.speed * delta;
    const target = zombies.find((zombie) => (
      zombie.row === pea.row &&
      Math.abs(zombie.x - pea.x) < 24 &&
      zombie.hp > 0
    ));

    if (target) {
      target.hp -= pea.damage;
      pea.hit = true;
      updateZombieHealth(target);
    }

    positionPea(pea);
  });
}

function updateZombies(now, delta) {
  zombies.forEach((zombie) => {
    const plant = plants
      .filter((candidate) => candidate.row === zombie.row)
      .find((candidate) => Math.abs(zombie.x - colCenter(candidate.col)) < 34);

    if (plant) {
      zombie.targetPlantId = plant.id;
      if (now - zombie.lastAttackAt >= zombie.attackInterval) {
        plant.hp -= zombie.damage;
        zombie.lastAttackAt = now;
        if (plant.hp <= 0) {
          plant.element.remove();
          setCellOccupied(plant.row, plant.col, false);
          plants = plants.filter((item) => item.id !== plant.id);
          setStatus("一株植物被吃掉了。");
        }
      }
    } else {
      zombie.targetPlantId = null;
      zombie.x -= zombie.speed * delta;
    }

    positionZombie(zombie);

    if (zombie.x < 0) {
      endGame(false);
    }
  });
}

function updateSuns(now) {
  suns.forEach((sun) => {
    if (now > sun.expiresAt) {
      sun.expired = true;
      sun.element.remove();
    }
  });
}

function cleanupEntities() {
  zombies.forEach((zombie) => {
    if (zombie.hp <= 0) zombie.element.remove();
  });
  peas.forEach((pea) => {
    if (pea.hit || pea.x > board.clientWidth + 24) pea.element.remove();
  });

  zombies = zombies.filter((zombie) => zombie.hp > 0);
  peas = peas.filter((pea) => !pea.hit && pea.x <= board.clientWidth + 24);
  suns = suns.filter((sun) => !sun.expired);
}

function checkEndState() {
  if (gameState !== "playing") return;
  if (waveQueue.length === 0 && zombies.length === 0) {
    endGame(true);
  }
}

function endGame(won) {
  if (gameState !== "playing") return;
  gameState = won ? "won" : "lost";
  cancelAnimationFrame(animationId);

  const title = overlay.querySelector("#result-title");
  const copy = overlay.querySelector("#result-copy");
  title.textContent = won ? "胜利！" : "防线被突破";
  copy.textContent = won ? "所有僵尸都被清理掉了，草坪安全。" : "有僵尸闯进了屋子，点击重新开始再守一次。";
  overlay.classList.remove("hidden");
  setStatus(won ? "胜利！你守住了草坪。" : "失败，僵尸突破了防线。");
}

function updateHud() {
  sunCount.textContent = sunlight;
  plantButtons.forEach((button) => {
    const type = button.dataset.plant;
    button.classList.toggle("disabled", sunlight < PLANTS[type].cost);
  });
}

function setStatus(message) {
  statusText.textContent = message;
}

function cellFor(row, col) {
  return cells[row * COLS + col];
}

function setCellOccupied(row, col, occupied) {
  const cell = cellFor(row, col);
  if (!cell) return;
  cell.classList.toggle("occupied", occupied);
  cell.setAttribute("aria-label", `第 ${row + 1} 行，第 ${col + 1} 列${occupied ? "，已有植物" : ""}`);
}

function clearOccupiedCells() {
  cells.forEach((cell) => {
    cell.classList.remove("occupied");
    cell.setAttribute("aria-label", `第 ${Number(cell.dataset.row) + 1} 行，第 ${Number(cell.dataset.col) + 1} 列`);
  });
}

function positionPlant(plant) {
  plant.element.style.left = `${colCenter(plant.col)}px`;
  plant.element.style.top = `${rowCenter(plant.row)}px`;
}

function positionZombie(zombie) {
  zombie.element.style.left = `${zombie.x}px`;
  zombie.element.style.top = `${zombie.y}px`;
}

function positionPea(pea) {
  pea.element.style.left = `${pea.x}px`;
  pea.element.style.top = `${pea.y}px`;
}

function positionSun(sun) {
  sun.element.style.left = `${sun.x}px`;
  sun.element.style.top = `${sun.y}px`;
}

function updateZombieHealth(zombie) {
  const fill = zombie.element.querySelector(".health-fill");
  fill.style.width = `${Math.max(0, zombie.hp / zombie.maxHp) * 100}%`;
}

function colCenter(col) {
  return (col + 0.5) * (board.clientWidth / COLS);
}

function rowCenter(row) {
  return (row + 0.5) * (board.clientHeight / ROWS);
}

function repositionAll() {
  plants.forEach(positionPlant);
  suns.forEach((sun) => {
    sun.x = colCenter(sun.col);
    sun.y = rowCenter(sun.row) - 18;
    positionSun(sun);
  });
  peas.forEach(positionPea);
  zombies.forEach((zombie) => {
    zombie.y = rowCenter(zombie.row);
    positionZombie(zombie);
  });
}

plantButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedPlant = button.dataset.plant;
    plantButtons.forEach((item) => item.classList.toggle("selected", item === button));
    setStatus(`已选择${PLANTS[selectedPlant].name}。`);
  });
});

restartButton.addEventListener("click", resetGame);
window.addEventListener("resize", repositionAll);

setupBoard();
resetGame();
