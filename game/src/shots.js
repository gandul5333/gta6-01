// shots.js — the four staged scenes behind ?shot=cover|street|mission|coast.
// Each one plays the real rules forward from a fresh world for a few seconds,
// steered by a small autopilot, so the frame is what real play looks like and
// the same seed always stages the same frame.

import { roadCenter } from './city.js';

/** Drive the player's car toward a point: throttle and steer like a driver. */
function driveInput(world, tx, tz) {
  const car = world.player.inCar;
  if (!car) return { fx: 0, fz: 0, run: false, jump: false, throttle: 0, steer: 0, brake: false };
  const dx = tx - car.x;
  const dz = tz - car.z;
  const targetHeading = Math.atan2(dx, dz);
  let turn = targetHeading - car.heading;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  return {
    fx: 0, fz: 0, run: false, jump: false,
    throttle: 1, steer: Math.max(-1, Math.min(1, turn * 1.4)), brake: false,
  };
}

/** Run the world forward for `seconds` with the given input provider. */
function playForward(world, seconds, inputFor) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    world.step(1 / 60, inputFor(world));
  }
}

/** Put the player in a car of the given kind at (x, z), facing heading. */
function giveCar(world, kind, x, z, heading) {
  const car = world.spawnPlayerCar(kind, x, z, heading);
  world.player.enterCar(car);
  return car;
}

function stageCover(world) {
  // A chase downtown: Rico driving, three stars, two police cars on his tail,
  // mid-delivery of the package. Afternoon sun.
  world.city.setTimeOfDay(0.5);
  const x = roadCenter(4);
  const z = roadCenter(5) - 60;
  giveCar(world, 'sport', x, z, 0);
  // The hero car is always the same bright red, so it reads as Rico's car.
  world.player.inCar.mesh.userData.body.material.color.setHex(0xc23b2e);
  world.missions.startNext(); // First Wheels
  world.missions.completeMission();
  world.missions.startNext(); // The Pickup
  world.missions.stepIndex = 2; // delivering to Club Neon
  world.police.setHeat(3);
  // Two cruisers right on his tail, on the same avenue, already rolling.
  world.police.spawnCarAt(x - 1.5, z - 16, 0, 40);
  world.police.spawnCarAt(x + 3, z - 30, 0, 42);
  world.player.inCar.setSpeed(26);
  playForward(world, 2.2, (w) => driveInput(w, roadCenter(4), roadCenter(5) + 120));
  const car = world.player.inCar;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  // Chase framing: the camera sits just ahead and to the side, looking back
  // at Rico's car as it drives toward it — the cruisers on his tail fill
  // the street behind him.
  world.shotCamera = {
    pos: [car.x + fx * 13 + 8, 4.5, car.z + fz * 13 + 5],
    look: [car.x - fx * 8, 1.5, car.z - fz * 8],
  };
}

function stageStreet(world) {
  // On foot at a downtown crossing: traffic rolling past, pedestrians on the
  // sidewalks, the towers behind. Morning light, no heat.
  world.city.setTimeOfDay(0.32);
  const x = roadCenter(4) + 4;
  const z = roadCenter(4) + 4;
  world.player.reset(x, z);
  world.player.heading = Math.PI * 0.85;
  playForward(world, 1.6, () => ({ fx: 0, fz: 0, run: false, jump: false, throttle: 0, steer: 0, brake: false }));
  world.shotCamera = { pos: [world.player.x - 7, 4, world.player.z - 9], look: [world.player.x + 4, 1.5, world.player.z + 10] };
}

function stageMission(world) {
  // The Palmera Job: Rico outside Bay Bank with the cash, four stars, police
  // converging through the golden hour.
  world.city.setTimeOfDay(0.8);
  const bank = world.city.landmarks.bank;
  world.player.reset(bank.x + 6, bank.z + 10);
  world.player.heading = Math.PI;
  world.missions.startNext();
  world.missions.completeMission();
  world.missions.startNext();
  world.missions.completeMission();
  world.missions.startNext();
  world.missions.completeMission();
  world.missions.startNext(); // The Palmera Job
  world.missions.stepIndex = 2; // escape to the safehouse
  world.police.setHeat(4);
  world.police.spawnCar(bank.x - 20, bank.z - 40);
  world.police.spawnCar(bank.x + 24, bank.z - 30);
  world.police.spawnCar(bank.x, bank.z - 60);
  playForward(world, 1.2, () => ({ fx: 0, fz: 0, run: false, jump: false, throttle: 0, steer: 0, brake: false }));
  const p = world.player;
  // Camera south of Rico, looking north: the cruisers converging from the
  // bank fill the street behind him.
  world.shotCamera = { pos: [p.x + 8, 5, p.z + 14], look: [p.x - 2, 1.5, p.z - 8] };
}

function stageCoast(world) {
  // Sunset on the beach road: the sea on one side, palms on the other, Rico
  // cruising with the top down and nowhere to be.
  world.city.setTimeOfDay(0.92);
  const x = roadCenter(5);
  const z = world.city.landmarks.beach.z - 4;
  giveCar(world, 'sport', x, z, Math.PI / 2);
  world.player.inCar.mesh.userData.body.material.color.setHex(0xe07830); // sunset orange
  world.player.inCar.setSpeed(30);
  playForward(world, 2.5, (w) => driveInput(w, roadCenter(8), z));
  const car = world.player.inCar;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  // Low camera on the beach side, looking east down the beach road: the car
  // in the middle, the towers on the left, the sea on the right.
  world.shotCamera = {
    pos: [car.x - fx * 12, 5, car.z + 9],
    look: [car.x + fx * 12, 2, car.z],
  };
}

const SCENES = { cover: stageCover, street: stageStreet, mission: stageMission, coast: stageCoast };

/**
 * Set `world` to the named scene and freeze it: main.js keeps rendering but
 * stops the simulation, so the screenshot is stable.
 */
export function stageShot(name, world) {
  world.reset();
  const stage = SCENES[name] ?? SCENES.cover;
  stage(world);
  world.frozen = true;
}
