// --- GLOBALS ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let gameMode = "single"; // 'single' or 'local'
let running = false;
let round = 1;
let playerScores = [0, 0];
let serveTeam = 0; // 0=left, 1=right
let difficulty = "normal";
let powerUps = [];
let activePowerUps = [null, null];
let bgmStarted = false;

// --- PLAYER and CONTROLS ---
const PLAYER_RADIUS = 38, MOVE_SPEED = 7, JUMP_POWER = 16, GRAVITY = 0.65;
const actionKeys = {
  player1: { left: 65, right: 68, up: 87, special: 83, bump: 81, set: 69, spike: 82, serve: 32 },
  player2: { left: 37, right: 39, up: 38, special: 40, bump: 191, set: 190, spike: 188, serve: 13 }
};
let keys = {};

let players = [
  { x: 180, y: 0, vx: 0, vy: 0, color: "#0288d1", controls: actionKeys.player1, grounded: true, canJump: true, specialReady: false, name: "Player 1", team: 0 },
  { x: 820, y: 0, vx: 0, vy: 0, color: "#c62828", controls: actionKeys.player2, grounded: true, canJump: true, specialReady: false, name: "Player 2", team: 1 }
];

// --- BALL ---
let ball = { x: 500, y: 150, vx: 0, vy: 0, radius: 22, lastHit: null, canBeHit: true };

// --- NET, COURT, POWERUPS ---
const NET = { x: 500 - 15, width: 30, height: 160 };
const GROUND = canvas ? canvas.height - 40 : 510;

// --- SOUNDS ---
function playSFX(id) {
  const audio = document.getElementById(id);
  if (audio) {
    audio.currentTime = 0;
    audio.play();
  }
}
function playBGM() {
  if (!bgmStarted) {
    const bgm = document.getElementById("bgm");
    if (bgm) { bgm.volume = 0.5; bgm.play(); }
    bgmStarted = true;
  }
}

// --- GAME LOOP ---
function startGame(mode) {
  document.getElementById("menu").style.display = "none";
  document.getElementById("instructions").style.display = "none";
  document.getElementById("settings").style.display = "none";
  document.getElementById("gameArea").style.display = "";
  gameMode = mode;
  round = 1;
  playerScores = [0, 0];
  serveTeam = Math.floor(Math.random() * 2);
  resetPlayers();
  resetBall(true);
  powerUps = [];
  activePowerUps = [null, null];
  running = true;
  playBGM();
  requestAnimationFrame(gameLoop);
}

function gameLoop() {
  if (!running) return;
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// --- GAME UPDATE ---
function update() {
  // AI for single player mode
  if (gameMode === "single") aiMove(players[1]);

  // Player controls
  players.forEach((p, idx) => handlePlayerInput(p, idx));

  // Physics
  players.forEach(applyPhysics);
  updateBall();
  updatePowerUps();
}

function handlePlayerInput(p, idx) {
  // Move left/right
  if (keys[p.controls.left]) p.x -= MOVE_SPEED;
  if (keys[p.controls.right]) p.x += MOVE_SPEED;
  // Jump
  if (keys[p.controls.up] && p.grounded && p.canJump) {
    p.vy = -JUMP_POWER;
    p.grounded = false;
    p.canJump = false;
    setTimeout(() => p.canJump = true, 300);
  }
  // Serve
  if (isServeAllowed(idx) && keys[p.controls.serve]) {
    serveBall(idx);
  }
  // Bump, Set, Spike, Special
  if (keys[p.controls.bump]) tryAction("bump", p, idx);
  if (keys[p.controls.set]) tryAction("set", p, idx);
  if (keys[p.controls.spike]) tryAction("spike", p, idx);
  if (keys[p.controls.special]) tryAction("special", p, idx);

  // Keep players within their half
  const leftBound = idx === 0 ? PLAYER_RADIUS : NET.x + NET.width + PLAYER_RADIUS;
  const rightBound = idx === 0 ? NET.x - PLAYER_RADIUS : canvas.width - PLAYER_RADIUS;
  p.x = Math.max(leftBound, Math.min(rightBound, p.x));
}

// --- AI MOVEMENT ---
function aiMove(ai) {
  // Simple AI: track ball x, jump if ball is close and falling
  if (ball.x > NET.x + NET.width && ball.vy > 0 && ball.y < ai.y - 60) {
    if (ai.grounded && ai.canJump) {
      ai.vy = -JUMP_POWER;
      ai.grounded = false;
      ai.canJump = false;
      setTimeout(() => ai.canJump = true, 300);
    }
  }
  if (ball.x > ai.x + 10) ai.x += MOVE_SPEED * 0.65;
  if (ball.x < ai.x - 10) ai.x -= MOVE_SPEED * 0.65;
  // Action: bump/spike if close
  if (Math.abs(ball.x - ai.x) < 50 && ball.y > GROUND - 160) {
    tryAction("spike", ai, 1);
  }
}

function tryAction(type, p, idx) {
  if (canHitBall(p)) {
    let force = { x: 0, y: 0 };
    if (type === "bump") force = { x: (ball.x - p.x) * 0.15, y: -14 };
    if (type === "set") force = { x: (ball.x - p.x) * 0.09, y: -20 };
    if (type === "spike") force = { x: (ball.x - p.x) * 0.1, y: -25 };
    if (type === "special" && activePowerUps[idx]) {
      force = { x: (ball.x - p.x) * 0.25, y: -35 };
      activePowerUps[idx] = null;
      playSFX("sfx-power");
    }
    if (type !== "special" || (type === "special" && force.y !== 0)) {
      ball.vx = force.x;
      ball.vy = force.y;
      ball.lastHit = idx;
      ball.canBeHit = false;
      setTimeout(() => ball.canBeHit = true, 350);
      playSFX("sfx-hit");
    }
  }
}

// --- PHYSICS ---
function applyPhysics(p) {
  p.vy += GRAVITY;
  p.y += p.vy;
  if (p.y > GROUND) {
    p.y = GROUND;
    p.vy = 0;
    p.grounded = true;
  }
}

// --- BALL PHYSICS & COLLISIONS ---
function updateBall() {
  ball.vy += GRAVITY;
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Bounce on ground
  if (ball.y + ball.radius > GROUND) {
    scorePoint(ball.x < canvas.width / 2 ? 1 : 0);
    playSFX("sfx-score");
    resetBall();
    return;
  }
  // Walls
  if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) {
    ball.vx *= -0.8;
    ball.x = Math.max(ball.radius, Math.min(canvas.width - ball.radius, ball.x));
  }
  // Ceiling
  if (ball.y - ball.radius < 0) {
    ball.vy *= -1;
    ball.y = ball.radius + 2;
  }
  // Net
  if (
    ball.x + ball.radius > NET.x &&
    ball.x - ball.radius < NET.x + NET.width &&
    ball.y + ball.radius > GROUND - NET.height
  ) {
    // Collide left/right
    if (ball.x < canvas.width / 2) {
      ball.x = NET.x - ball.radius;
    } else {
      ball.x = NET.x + NET.width + ball.radius;
    }
    ball.vx *= -0.95;
  }
  // Player collision
  players.forEach((p, idx) => {
    if (canHitBall(p)) {
      let dx = ball.x - p.x, dy = ball.y - p.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_RADIUS + ball.radius) {
        // Default bounce
        ball.vx = dx * 0.16;
        ball.vy = -Math.abs(dy * 0.25) - 10;
        ball.lastHit = idx;
        ball.canBeHit = false;
        setTimeout(() => ball.canBeHit = true, 350);
        playSFX("sfx-hit");
      }
    }
  });
  // Power-up collision
  powerUps.forEach((pu, idx) => {
    let dx = ball.x - pu.x, dy = ball.y - pu.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ball.radius + pu.radius) {
      let team = ball.lastHit;
      if (team !== null) activePowerUps[team] = pu.type;
      playSFX("sfx-power");
      powerUps.splice(idx, 1);
    }
  });
}

function canHitBall(p) {
  return ball.canBeHit && Math.abs(ball.x - p.x) < PLAYER_RADIUS + ball.radius + 2 && Math.abs(ball.y - p.y) < PLAYER_RADIUS + ball.radius + 4;
}

// --- POWERUPS ---
function updatePowerUps() {
  // Spawn randomly
  if (Math.random() < 0.002) {
    let x = Math.random() * (canvas.width - 80) + 40;
    powerUps.push({
      x, y: 80 + Math.random() * 200,
      radius: 22,
      type: "super",
      color: "#ffd600"
    });
  }
}

// --- SCORE & ROUNDS ---
function scorePoint(team) {
  playerScores[team]++;
  if (playerScores[team] >= 15 && Math.abs(playerScores[team] - playerScores[1-team]) >= 2) {
    // Win round
    running = false;
    setTimeout(() => {
      alert(`${players[team].name} wins the round!`);
      round++;
      playerScores = [0, 0];
      resetPlayers();
      resetBall(true);
      running = true;
      requestAnimationFrame(gameLoop);
    }, 400);
  }
}
function resetBall(isServe = false) {
  ball.x = serveTeam === 0 ? 220 : 780;
  ball.y = 180;
  ball.vx = 0;
  ball.vy = 0;
  ball.lastHit = null;
  ball.canBeHit = true;
  if (isServe) setTimeout(() => {}, 200);
}
function serveBall(idx) {
  if (serveTeam !== idx) return;
  ball.vx = (idx === 0 ? 7 : -7);
  ball.vy = -12;
  serveTeam = 1 - serveTeam;
}
function isServeAllowed(idx) {
  // Only serve if ball is at serve position and not moving
  return serveTeam === idx && Math.abs(ball.vx) + Math.abs(ball.vy) < 0.1 && !gameStarted();
}
function resetPlayers() {
  players[0].x = 180; players[0].y = GROUND; players[0].vy = 0; players[0].vx = 0; players[0].grounded = true;
  players[1].x = 820; players[1].y = GROUND; players[1].vy = 0; players[1].vx = 0; players[1].grounded = true;
}

// --- DRAW ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Ground
  ctx.fillStyle = "#ffecb3";
  ctx.fillRect(0, GROUND, canvas.width, canvas.height - GROUND);
  // Net
  ctx.fillStyle = "#a1887f";
  ctx.fillRect(NET.x, GROUND - NET.height, NET.width, NET.height);
  // Powerups
  powerUps.forEach(pu => {
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.radius, 0, Math.PI * 2);
    ctx.fillStyle = pu.color;
    ctx.fill();
    ctx.font = "18px Arial";
    ctx.fillStyle = "#444";
    ctx.fillText("★", pu.x - 8, pu.y + 7);
  });
  // Players
  players.forEach((p, idx) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.stroke();
    // Powerup indicator
    if (activePowerUps[idx]) {
      ctx.font = "24px Arial";
      ctx.fillStyle = "#ffd600";
      ctx.fillText("★", p.x - 14, p.y - 50);
    }
  });
  // Ball
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#fff176";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.stroke();

  // Scoreboard
  document.getElementById("scoreboard").innerHTML =
    `<span style="color:${players[0].color}">${players[0].name}: ${playerScores[0]}</span> &nbsp;|&nbsp; 
    <span style="color:${players[1].color}">${players[1].name}: ${playerScores[1]}</span> &nbsp;|&nbsp; 
    <b>Round: ${round}</b>`;
}

// --- UI NAVIGATION ---
function showInstructions() {
  document.getElementById("menu").style.display = "none";
  document.getElementById("instructions").style.display = "";
}
function showSettings() {
  document.getElementById("menu").style.display = "none";
  document.getElementById("settings").style.display = "";
}
function saveSettings() {
  const sel = document.getElementById("difficultySelect");
  difficulty = sel.value;
  goToMenu();
}
function goToMenu() {
  document.getElementById("menu").style.display = "";
  document.getElementById("instructions").style.display = "none";
  document.getElementById("settings").style.display = "none";
  document.getElementById("gameArea").style.display = "none";
  running = false;
}

// --- RESTART ---
function restartGame() {
  round = 1;
  playerScores = [0, 0];
  serveTeam = Math.floor(Math.random() * 2);
  resetPlayers();
  resetBall(true);
  powerUps = [];
  activePowerUps = [null, null];
  running = true;
  requestAnimationFrame(gameLoop);
}

// --- KEY HANDLERS ---
document.addEventListener("keydown", (e) => {
  keys[e.keyCode] = true;
});
document.addEventListener("keyup", (e) => {
  keys[e.keyCode] = false;
});

// --- UTILITY ---
function gameStarted() {
  return Math.abs(ball.vx) > 0.1 || Math.abs(ball.vy) > 0.1;
}

// --- FOR DEMO: AUTO-START MENU ---
if (canvas) {
  document.getElementById("menu").style.display = "";
  document.getElementById("gameArea").style.display = "none";
}