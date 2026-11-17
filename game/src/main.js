// main.js — Palmera Bay's bootstrap and game loop: it builds the world, reads
// the keys, chases the camera, and wires every system to the HUD and the audio.

import * as THREE from 'three';
import { CITY_HALF, CAR, PLAYER } from './config.js';
import { clamp, mulberry32, kmh, money } from './utils.js';
import { City } from './city.js';
import { Vehicle, TrafficManager } from './vehicles.js';
import { Player } from './player.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { PickupManager } from './pickups.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { hasSave, saveGame, loadGame, clearSave } from './save.js';
import { stageShot } from './shots.js';

window.__GAME_ERRORS__ = [];
window.addEventListener('error', (e) => {
  window.__GAME_ERRORS__.push(String(e.message));
  document.title = 'ERROR: ' + String(e.message).slice(0, 80);
});

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || (SHOT ? 7 : Date.now() % 2147483647));

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const random = mulberry32(SEED);
const city = new City(scene, random);

// ---- state ---------------------------------------------------------------
const state = {
  mode: 'menu', // menu | playing | paused | end
  cash: 1200,
  stats: { carsStolen: 0, missionsDone: 0, earned: 0, fares: 0 },
  nextMissionTimer: -1,
  cameraYaw: 0,
  orbitOffset: 0,
  muted: false,
  time: 0,
  shotMode: SHOT !== null,
};

const audio = new AudioEngine();

const world = {
  scene,
  city,
  random,
  frozen: false,
  shotCamera: null,
};

// ---- entities ------------------------------------------------------------
const playerEvents = {
  onPunch: (target) => {
    audio.punch();
    if (target) police.addHeat(1, 'assault');
  },
  onShoot: (target, hit) => {
    audio.gunshot();
    police.addHeat(1, 'shots fired');
  },
  onDamage: () => {},
};
const player = new Player(scene, city.landmarks.garage.x + 4, city.landmarks.garage.z + 4, playerEvents);
world.player = player;

const traffic = new TrafficManager(scene, city, random);
world.traffic = traffic;

const pedEvents = {
  onFareSpawned: (ped) => hud.showMessage('Taxi fare', 'Someone needs a ride — stop by the green marker in your car.'),
  onFarePickedUp: () => hud.showMessage('Fare aboard', 'Drive them to the green marker. Don\'t keep them waiting.'),
  onFarePaid: (pay) => {
    state.cash += pay;
    state.stats.earned += pay;
    state.stats.fares += 1;
    hud.setCash(state.cash);
    hud.showMessage('Fare paid', `You earned ${money(pay)} for the ride.`);
    audio.pickup();
  },
};
const peds = new PedestrianManager(scene, city, random, pedEvents);
world.peds = peds;

const policeEvents = {
  onWantedUp: (stars, reason) => hud.showMessage(`Wanted level ${stars}`, reason === 'cop down' ? 'You took down a cop. Every unit in Palmera Bay is coming.' : 'The police are on to you.'),
  onBusted: () => endGame('busted'),
  onWasted: () => endGame('wasted'),
  onSiren: (on) => audio.setSiren(on),
};
const police = new PoliceManager(scene, city, random, policeEvents);
world.police = police;

const missionEvents = {
  onObjective: (text) => hud.setObjective(text),
  onMessage: (title, body) => hud.showMessage(title, body, 7),
  onCash: (amount) => {
    state.cash += amount;
    state.stats.earned += amount;
    hud.setCash(state.cash);
  },
  onMissionComplete: (mission, reward) => {
    state.stats.missionsDone += 1;
    audio.missionComplete();
    hud.showMessage(`${mission.title} complete`, `Vera paid ${money(reward)}. Debt left: ${money(missions.debt)}.`);
    if (missions.completed.length < 4) state.nextMissionTimer = 4;
  },
  onStoryComplete: () => endGame('complete'),
  onHoldProgress: (p) => hud.showHold(p > 0 && p < 1 ? p : null),
};
const missions = new MissionManager(world, missionEvents);
world.missions = missions;

const pickupEvents = {
  onCash: (amount) => {
    state.cash += amount;
    state.stats.earned += amount;
    hud.setCash(state.cash);
  },
  onPickup: () => audio.pickup(),
};
const pickups = new PickupManager(scene, city, random, pickupEvents);
world.pickups = pickups;

// ---- parked cars: free to take, no owner, no heat -------------------------
const parkedCars = [];
function spawnParkedCars() {
  const spots = [
    [0.5, 2], [-0.5, 5], [1, 7], [-1, 3], [0.5, 6], [-0.5, 1],
  ];
  for (const [lane, road] of spots) {
    const x = -CITY_HALF + 7 + road * 58 + lane * 4;
    const z = -CITY_HALF + 7 + 3 * 58;
    const car = new Vehicle(scene, 'sedan', x, z, Math.PI / 2);
    car.parked = true;
    parkedCars.push(car);
  }
}
spawnParkedCars();

/** Spawn a car the player owns (used by screenshots and mission rewards). */
world.spawnPlayerCar = (kind, x, z, heading) => {
  const car = new Vehicle(scene, kind, x, z, heading);
  car.parked = false;
  car.owned = true;
  parkedCars.push(car);
  return car;
};

/** Reset the world to a fresh state (used by screenshots and restarts). */
world.reset = () => {
  police.reset();
  missions.reset();
  pickups.reset();
  player.reset(city.landmarks.garage.x + 4, city.landmarks.garage.z + 4);
  state.cash = 1200;
  state.stats = { carsStolen: 0, missionsDone: 0, earned: 0, fares: 0 };
  state.nextMissionTimer = -1;
  hud.setCash(state.cash);
  hud.setDebt(missions.debt);
  hud.setObjective('Free roam — explore Palmera Bay');
  hud.showHold(null);
};

// ---- input ----------------------------------------------------------------
const keys = new Set();
let mouseDown = false;
let lastMouseX = 0;
let mouseMoved = false;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  audio.ensure();
  if (e.code === 'KeyM') {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
  }
  if (e.code === 'KeyE' && state.mode === 'playing') tryEnterExitCar();
  if (e.code === 'KeyF' && state.mode === 'playing') player.punch(shootTargets());
  if (e.code === 'KeyR' && state.mode === 'playing') player.reload();
  if (e.code === 'KeyN' && state.mode === 'playing' && !missions.active) missions.startNext();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('mousedown', (e) => {
  mouseDown = true;
  lastMouseX = e.clientX;
  mouseMoved = false;
  audio.ensure();
});
window.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  if (Math.abs(dx) > 2) mouseMoved = true;
  state.orbitOffset -= dx * 0.005;
});
window.addEventListener('mouseup', (e) => {
  if (mouseDown && !mouseMoved && state.mode === 'playing' && !player.inCar && player.armed) {
    shootAtScreenCenter();
  }
  mouseDown = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/** Everything the player's fists and pistol can hit. */
function shootTargets() {
  const targets = [];
  for (const ped of peds.peds) if (!ped.dead) targets.push(ped);
  for (const cop of police.cops) if (!cop.dead) targets.push(cop);
  for (const car of [...traffic.cars, ...parkedCars, ...police.cars]) {
    if (!car.dead) targets.push({ x: car.x, z: car.z, radius: 2.2, dead: false, takeHit: (d) => { car.health -= d; if (car.health <= 0) car.dead = true; } });
  }
  return targets;
}

function shootAtScreenCenter() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const aimX = player.x + dir.x * 40;
  const aimZ = player.z + dir.z * 40;
  player.shoot(aimX, aimZ, shootTargets());
}

/** E: get in the nearest car, or get out of the one being driven. */
function tryEnterExitCar() {
  if (player.inCar) {
    player.exitCar(city);
    return;
  }
  let best = null;
  let bestD = 3.6;
  const all = [...traffic.cars, ...parkedCars, ...police.cars];
  for (const car of all) {
    if (car.dead || car.health <= 0) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (!best) return;
  player.enterCar(best);
  state.stats.carsStolen += 1;
  if (best.isPolice) {
    police.addHeat(2, 'you stole a police car');
  } else if (!best.parked && !best.owned) {
    // A traffic car has an owner: stealing it in sight of the law is a crime.
    const near = police.cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 80);
    police.addHeat(near ? 1 : 0.4, 'car stolen');
  }
  if (best.parked) {
    const i = parkedCars.indexOf(best);
    if (i >= 0) parkedCars.splice(i, 1);
  }
  // A stolen car leaves its old job: a traffic car taken by the player must
  // stop being driven by the traffic AI, and a cruiser must stop being
  // driven by the police AI, or both drivers fight over the same car.
  const ti = traffic.cars.indexOf(best);
  if (ti >= 0) {
    traffic.cars.splice(ti, 1);
    traffic.spawnCar(true); // keep the streets full
  }
  const pi = police.cars.indexOf(best);
  if (pi >= 0) police.cars.splice(pi, 1);
  audio.click();
}

// ---- HUD ------------------------------------------------------------------
const hud = new HUD({
  onStart: () => {
    audio.ensure();
    audio.click();
    state.mode = 'playing';
    hud.showScreen(null);
    hud.setCash(state.cash);
    hud.setDebt(missions.debt);
    missions.startNext();
  },
  onContinue: () => {
    audio.ensure();
    audio.click();
    const save = loadGame();
    if (save) applySave(save);
    state.mode = 'playing';
    hud.showScreen(null);
    hud.setCash(state.cash);
    hud.setDebt(missions.debt);
  },
  onResume: () => resumeGame(),
  onRestart: () => {
    clearSave();
    world.reset();
    state.mode = 'playing';
    hud.showScreen(null);
    missions.startNext();
  },
  onMenu: () => {
    state.mode = 'menu';
    hud.showScreen('menu');
  },
});
world.hud = hud;

function pauseGame() {
  state.mode = 'paused';
  hud.showScreen('pause');
  saveCurrent();
}

function resumeGame() {
  state.mode = 'playing';
  hud.showScreen(null);
  audio.click();
}

function endGame(kind) {
  if (state.mode === 'end') return;
  state.mode = 'end';
  audio.setEngine(0, false);
  audio.setSiren(false);
  audio.busted();
  const stats = `Cash ${money(state.cash)} · Missions ${missions.completed.length}/4 · Cars stolen ${state.stats.carsStolen} · Earned ${money(state.stats.earned)}`;
  hud.showEnd(kind, stats);
  if (kind === 'busted' || kind === 'wasted') {
    // Bail / hospital takes a cut; Rico wakes at the safehouse.
    state.cash = Math.max(0, Math.floor(state.cash * 0.9));
    setTimeout(() => {
      if (state.mode !== 'end') return;
      player.reset(city.landmarks.safehouse.x + 4, city.landmarks.safehouse.z + 4);
      police.reset();
      if (missions.active) {
        missions.stepIndex = 0;
        missions.holdTimer = 0;
      }
      hud.setCash(state.cash);
      hud.setHealth(player.health);
    }, 100);
  }
  saveCurrent();
}

function applySave(save) {
  state.cash = save.cash ?? 1200;
  missions.debt = save.debt ?? 50000;
  missions.completed = save.completed ?? [];
  player.reset(save.px ?? 0, save.pz ?? 0);
  player.health = save.health ?? 100;
  player.ammo = save.ammo ?? PLAYER.pistolAmmo;
  player.reserve = save.reserve ?? PLAYER.pistolReserve;
  state.stats = save.stats ?? state.stats;
  hud.setHealth(player.health);
  hud.setAmmo(player.ammo, player.reserve);
  hud.setObjective(missions.completed.length >= 4 ? 'Free roam — explore Palmera Bay' : 'Press N to start the next job');
}

function saveCurrent() {
  saveGame({
    cash: state.cash,
    debt: missions.debt,
    completed: missions.completed,
    px: player.inCar ? player.inCar.x : player.x,
    pz: player.inCar ? player.inCar.z : player.z,
    health: player.health,
    ammo: player.ammo,
    reserve: player.reserve,
    stats: state.stats,
  });
}

// ---- camera ---------------------------------------------------------------
function updateCamera(dt) {
  const target = player.inCar || player;
  const heading = player.inCar ? player.inCar.heading : player.heading;
  const desiredYaw = heading + state.orbitOffset;
  // Smooth the yaw toward the target, shortest way round.
  let d = desiredYaw - state.cameraYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  state.cameraYaw += d * Math.min(1, dt * 3.5);
  const dist = player.inCar ? 12 : 8.5;
  const height = player.inCar ? 4.6 : 3.4;
  const cx = target.x - Math.sin(state.cameraYaw) * dist;
  const cz = target.z - Math.cos(state.cameraYaw) * dist;
  camera.position.set(cx, height, cz);
  camera.lookAt(target.x + Math.sin(state.cameraYaw) * 6, 1.6, target.z + Math.cos(state.cameraYaw) * 6);
}

// ---- one fixed step of the whole simulation -------------------------------
world.step = (dt, input) => {
  state.time += dt;
  const car = player.inCar;
  if (car) {
    car.drivePlayer({ throttle: input.throttle, steer: input.steer, brake: input.brake }, dt);
    car.collideCity(city);
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      audio.crash();
      hud.showMessage('Car wrecked', 'That car is finished. Get out and find another.');
      player.exitCar(city);
    }
  } else {
    const fwdX = Math.sin(state.cameraYaw);
    const fwdZ = Math.cos(state.cameraYaw);
    const rightX = Math.cos(state.cameraYaw);
    const rightZ = -Math.sin(state.cameraYaw);
    const mx = (input.fz || 0) * fwdX + (input.fx || 0) * rightX;
    const mz = (input.fz || 0) * fwdZ + (input.fx || 0) * rightZ;
    player.updateOnFoot(dt, { fx: mx, fz: mz, run: input.run, jump: input.jump }, city);
  }
  traffic.update(dt, player.inCar);
  peds.update(dt, player, player.inCar);
  police.update(dt, player, player.inCar);
  missions.update(dt);
  pickups.update(dt, player);
  audio.setEngine(car ? Math.abs(car.speed) / CAR.maxSpeed : 0, !!car);
  audio.update(dt);
  // Day cycle drifts slowly; screenshots pin it instead.
  if (!state.shotMode) city.setTimeOfDay(0.42 + 0.12 * Math.sin(state.time / 300));
};

// ---- input for this frame -------------------------------------------------
function readInput() {
  const fz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const fx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  return {
    fx,
    fz,
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    jump: keys.has('Space'),
    throttle: fz,
    steer: -fx,
    brake: keys.has('Space'),
  };
}

// ---- main loop ------------------------------------------------------------
const clock = new THREE.Clock();
let minimapTimer = 0;
let saveTimer = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'playing' && !world.frozen) {
    world.step(dt, readInput());
    if (state.nextMissionTimer > 0) {
      state.nextMissionTimer -= dt;
      if (state.nextMissionTimer <= 0) missions.startNext();
    }
    // HUD refresh.
    hud.setHealth(player.health);
    hud.setAmmo(player.ammo, player.reserve);
    hud.setStars(police.stars);
    hud.setDebt(missions.debt);
    hud.setObjective(missions.currentObjectiveText());
    hud.setSpeed(player.inCar ? kmh(Math.abs(player.inCar.speed)) : 0, !!player.inCar, player.inCar ? player.inCar.health : 0);
    hud.updateMessage(dt);
    hud.setHint(
      player.inCar
        ? 'WASD drive · Space handbrake · E exit car'
        : 'WASD move · Shift run · E enter car · F punch · Click shoot · R reload · N next job · P pause',
    );
    minimapTimer -= dt;
    if (minimapTimer <= 0) {
      minimapTimer = 0.12;
      hud.drawMinimap(world);
    }
    saveTimer -= dt;
    if (saveTimer <= 0) {
      saveTimer = 10;
      saveCurrent();
    }
  }
  if (world.shotCamera) {
    camera.position.set(...world.shotCamera.pos);
    camera.lookAt(...world.shotCamera.look);
  } else if (state.mode === 'menu') {
    // Slow orbit high above downtown behind the title screen.
    const t = state.time * 0.04;
    state.time += dt;
    camera.position.set(Math.sin(t) * 200, 110, Math.cos(t) * 200);
    camera.lookAt(0, 8, 0);
  } else {
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}

// ---- boot -----------------------------------------------------------------
document.getElementById('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';
hud.setCash(state.cash);
hud.setDebt(missions.debt);
hud.showScreen('menu');
player.armed = true;
world.game = world;
window.__game = world;

if (SHOT) {
  // Screenshot mode: stage the scene, hide the menus, freeze the sim.
  hud.showScreen(null);
  state.mode = 'playing';
  stageShot(SHOT, world);
  hud.setCash(state.cash);
  hud.setDebt(missions.debt);
  hud.setHealth(player.health);
  hud.setAmmo(player.ammo, player.reserve);
  hud.setStars(police.stars);
  hud.setObjective(missions.currentObjectiveText());
  hud.setSpeed(player.inCar ? kmh(Math.abs(player.inCar.speed)) : 0, !!player.inCar, player.inCar ? player.inCar.health : 0);
  hud.drawMinimap(world);
  hud.showMessage('', '');
  hud.hideMessage();
}

loop();
