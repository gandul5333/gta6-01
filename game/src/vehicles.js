// vehicles.js — low-poly cars, arcade driving, and the traffic that fills the
// roads. One Vehicle class serves the player, the police and the traffic: the
// player drives it with keys, the others with a target point to chase.

import * as THREE from 'three';
import { CAR, TRAFFIC, CITY_HALF } from './config.js';
import { clamp, angleDelta, randFloat, randInt, pick } from './utils.js';
import { roadCenter, nearestRoadPoint } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xd8d8d8, 0x22262c, 0x7a4dbb, 0xe07830, 0x4dbbc2];
const CAR_LENGTH = 4.4;
const CAR_WIDTH = 2.0;

/**
 * Build a car from boxes: body, cabin, wheels, lights. `kind` changes the
 * shape and colour: sedan, sport, taxi, van or police.
 */
export function makeCarMesh(kind, colorHex) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const bodyH = kind === 'van' ? 1.5 : 0.75;
  const bodyL = kind === 'van' ? 5.2 : CAR_LENGTH;
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, bodyH, bodyL), paint);
  body.position.y = 0.55 + bodyH / 2 - 0.35;
  body.castShadow = true;
  group.add(body);
  if (kind !== 'van') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH - 0.3, 0.62, bodyL * 0.45), glass);
    cabin.position.set(0, 0.55 + bodyH - 0.35 + 0.31, -bodyL * 0.05);
    cabin.castShadow = true;
    group.add(cabin);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x554411 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa2211, emissive: 0x330000 });
  for (const hx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    head.position.set(hx, 0.62, bodyL / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tail.position.set(hx, 0.62, -bodyL / 2 - 0.02);
    group.add(tail);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x664400 }),
    );
    sign.position.set(0, 1.55, 0);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x881111 }),
    );
    red.position.x = -0.28;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2266cc, emissive: 0x112288 }),
    );
    blue.position.x = 0.28;
    bar.add(red, blue);
    bar.position.set(0, 1.62, -0.1);
    group.add(bar);
    group.userData.lightBar = { red, blue };
  }
  group.userData.wheels = wheels;
  group.userData.body = body;
  return group;
}

export class Vehicle {
  constructor(scene, kind, x, z, heading, colorHex) {
    this.scene = scene;
    this.kind = kind;
    // Police cruisers are always white with the light bar, so they read as
    // police at a glance; every other car takes a random street colour.
    this.mesh = makeCarMesh(kind, colorHex ?? (kind === 'police' ? 0xf0f0f0 : pick(Math.random, CAR_COLORS)));
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0; // signed, along the heading
    this.health = CAR.health;
    this.steerAngle = 0;
    this.braking = false;
    this.dead = false;
    this.isPolice = kind === 'police';
    this.isTaxi = kind === 'taxi';
    this.flashPhase = 0;
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }

  /** Arcade drive step for the player's car. input: {throttle, steer, brake}. */
  drivePlayer(input, dt) {
    const fwd = this.speed >= 0 ? 1 : -1;
    let target = this.speed;
    if (input.throttle > 0) target += CAR.accel * input.throttle * dt;
    else if (input.throttle < 0) {
      if (this.speed > 0.5) target -= CAR.brake * dt; // brake first
      else target -= CAR.reverseAccel * dt; // then reverse
    } else {
      target -= Math.sign(this.speed) * 6 * dt; // coast drag
      if (Math.abs(target) < 0.3) target = 0;
    }
    target = clamp(target, -CAR.maxReverse, CAR.maxSpeed);
    const steerAuthority = clamp(Math.abs(target) / 8, 0, 1);
    this.heading += input.steer * CAR.steer * steerAuthority * fwd * dt * (input.brake ? 1.35 : 1);
    this.steerAngle = input.steer * 0.5;
    this.braking = input.throttle < 0 || input.brake;
    this.integrate(dt, input.brake ? CAR.handbrakeGrip : CAR.grip, target);
  }

  /** AI drive step: steer toward a target point at a desired speed. */
  driveToward(tx, tz, desiredSpeed, dt) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    const turn = clamp(angleDelta(this.heading, targetHeading), -1, 1);
    // Slow down for a sharp turn, or the car sweeps a wide arc off the road.
    const speedForTurn = desiredSpeed * (1 - 0.5 * Math.abs(turn));
    const target = clamp(this.speed + clamp(speedForTurn - this.speed, -CAR.brake * dt, CAR.accel * 0.7 * dt), 0, desiredSpeed + 4);
    // Steering authority never drops to zero: a stopped car must still be
    // able to turn its way out of a wedge against a building.
    this.heading += turn * CAR.steer * 0.8 * clamp(Math.abs(target) / 10, 0.5, 1) * dt;
    this.steerAngle = turn * 0.5;
    this.integrate(dt, CAR.grip, target);
    return dist;
  }

  /** Set the speed directly (used by screenshot staging): velocity follows. */
  setSpeed(s) {
    this.speed = s;
    this.vx = this.forwardX * s;
    this.vz = this.forwardZ * s;
  }

  /**
   * Move the car: the velocity is rebuilt from the forward speed along the
   * (possibly new) heading, with the old lateral slip damped by grip.
   */
  integrate(dt, grip, fwdSpeed) {
    const fx = this.forwardX;
    const fz = this.forwardZ;
    const latX = this.vx - (this.vx * fx + this.vz * fz) * fx;
    const latZ = this.vz - (this.vx * fx + this.vz * fz) * fz;
    const damp = Math.exp(-grip * dt);
    this.vx = fwdSpeed * fx + latX * damp;
    this.vz = fwdSpeed * fz + latZ * damp;
    this.speed = fwdSpeed;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Body roll and wheel spin for feel.
    this.mesh.rotation.z = -this.steerAngle * clamp(Math.abs(this.speed) / 20, 0, 1) * 0.12;
    const spin = (this.speed * dt) / 0.36;
    for (const wheel of this.mesh.userData.wheels) wheel.rotation.x += spin;
    // Police light bar flashes.
    if (this.isPolice) {
      this.flashPhase += dt * 6;
      const on = Math.sin(this.flashPhase) > 0;
      const bar = this.mesh.userData.lightBar;
      bar.red.material.emissive.setHex(on ? 0xff2222 : 0x220000);
      bar.blue.material.emissive.setHex(on ? 0x000022 : 0x2244ff);
    }
  }

  /** Push this car out of buildings; returns true on a hard hit. */
  collideCity(city) {
    const before = this.speed;
    const hit = city.collideCircle(this, CAR.radius);
    if (hit) {
      this.speed *= 0.4;
      this.vx *= 0.4;
      this.vz *= 0.4;
      // Capped so one bad corner does not total the car outright.
      this.health -= Math.min(6, Math.abs(before) * 0.4);
    }
    return hit;
  }

  remove() {
    this.dead = true;
    this.scene.remove(this.mesh);
  }
}

/** Traffic: cars that cruise the road grid, turn at intersections, and queue. */
export class TrafficManager {
  constructor(scene, city, random) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.cars = [];
    for (let i = 0; i < TRAFFIC.count; i += 1) this.spawnCar(true);
  }

  spawnCar(anywhere) {
    const random = this.random;
    const line = roadCenter(randInt(random, 0, 8));
    const along = randFloat(random, -CITY_HALF, CITY_HALF);
    const horizontal = random() < 0.5;
    const x = horizontal ? along : line;
    const z = horizontal ? line : along;
    const heading = horizontal ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : random() < 0.5 ? 0 : Math.PI;
    const kind = random() < 0.12 ? 'taxi' : random() < 0.1 ? 'van' : 'sedan';
    const car = new Vehicle(this.scene, kind, x, z, heading, kind === 'taxi' ? 0xf2c230 : undefined);
    car.speed = TRAFFIC.speed * randFloat(random, 0.8, 1.1);
    car.vx = car.forwardX * car.speed;
    car.vz = car.forwardZ * car.speed;
    car.route = this.nextRoutePoint(car);
    car.waitTime = 0;
    this.cars.push(car);
    return car;
  }

  /** Next waypoint: keep going along the current road, turn at a junction. */
  nextRoutePoint(car) {
    const random = this.random;
    const near = nearestRoadPoint(car.x, car.z);
    // Snap to the road centre, then choose a direction along it.
    const horizontal = Math.abs(car.x - near.x) < Math.abs(car.z - near.z);
    const dir = random() < 0.5 ? 1 : -1;
    const far = randFloat(random, 60, 200);
    if (horizontal) return { x: car.x + dir * far, z: near.z };
    return { x: near.x, z: car.z + dir * far };
  }

  /** A car is ahead of me on my lane within the gap. */
  carAhead(me) {
    let closest = Infinity;
    for (const other of this.cars) {
      if (other === me) continue;
      const dx = other.x - me.x;
      const dz = other.z - me.z;
      const along = dx * me.forwardX + dz * me.forwardZ;
      const side = Math.abs(dx * me.forwardZ - dz * me.forwardX);
      if (along > 0 && along < TRAFFIC.minGap + 6 && side < 2.5) closest = Math.min(closest, along);
    }
    return closest;
  }

  update(dt, playerCar) {
    const all = [...this.cars];
    if (playerCar) all.push(playerCar);
    for (const car of this.cars) {
      const gap = this.carAhead(car);
      const want = gap < Infinity ? 0 : TRAFFIC.speed;
      const dist = car.driveToward(car.route.x, car.route.z, want, dt);
      if (dist < 4 || car.waitTime > 6) {
        car.route = this.nextRoutePoint(car);
        car.waitTime = 0;
      }
      if (want === 0) car.waitTime += dt;
      car.collideCity(this.city);
      // Keep traffic inside the city.
      if (Math.abs(car.x) > CITY_HALF + 30 || Math.abs(car.z) > CITY_HALF + 30) {
        car.remove();
        this.cars.splice(this.cars.indexOf(car), 1);
        this.spawnCar(true);
      }
    }
    // Soft car-vs-car separation so traffic does not pile through itself.
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 3.4;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
          a.speed *= 0.92;
          b.speed *= 0.92;
        }
      }
    }
  }
}
