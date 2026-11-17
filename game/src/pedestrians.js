// pedestrians.js — the people of Palmera Bay: sidewalk walkers, panicked
// runners, and the occasional taxi fare waving for a ride.

import * as THREE from 'three';
import { PEDS, CITY, PITCH, CITY_HALF } from './config.js';
import { clamp, randFloat, randInt, pick } from './utils.js';
import { roadCenter } from './city.js';

const SHIRTS = [0x3aa655, 0xc2a23b, 0x7a4dbb, 0x4dbbc2, 0xd94f8b, 0x8a9a3b, 0xe07830, 0x5a6fc2];
const SKINS = [0xc98d64, 0x8a5a3b, 0xe8b48c, 0x6b4226, 0xdb9a6a];

function buildPedMesh(shirtColor, skinColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pick(Math.random, [0x2c3242, 0x4a3a2c, 0x333333]) });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), shirt);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), pants);
  legL.position.set(-0.15, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legL, legR);
  group.userData = { legL, legR };
  return group;
}

export class Ped {
  constructor(scene, x, z, random) {
    this.scene = scene;
    this.mesh = buildPedMesh(pick(random, SHIRTS), pick(random, SKINS));
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = random() * Math.PI * 2;
    this.health = 100;
    this.dead = false;
    this.fallen = false;
    this.state = 'walk'; // walk | flee | waitFare | toCar | riding
    this.target = { x, z };
    this.fleeTimer = 0;
    this.walkPhase = random() * 6;
    this.speed = PEDS.walkSpeed * randFloat(random, 0.8, 1.25);
    this.radius = 0.6;
    this.isFare = false;
    this.fareDestination = null;
  }

  takeHit(damage, fromX, fromZ) {
    if (this.dead) return;
    this.health -= damage;
    // Run away from whoever hit them.
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.target = { x: this.x + (dx / d) * 30, z: this.z + (dz / d) * 30 };
    this.state = 'flee';
    this.fleeTimer = 3;
    if (this.health <= 0) {
      this.dead = true;
      this.fallen = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
    }
  }

  update(dt, city, danger) {
    if (this.dead) return;
    if (this.state === 'riding') {
      this.mesh.visible = false;
      return;
    }
    if (danger && this.state !== 'flee') {
      const d = Math.hypot(this.x - danger.x, this.z - danger.z);
      if (d < 14) {
        this.state = 'flee';
        this.fleeTimer = 2.5;
        const dx = this.x - danger.x;
        const dz = this.z - danger.z;
        const len = Math.hypot(dx, dz) || 1;
        this.target = { x: this.x + (dx / len) * 30, z: this.z + (dz / len) * 30 };
      }
    }
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.state = 'walk';
    }
    const dx = this.target.x - this.x;
    const dz = this.target.z - this.z;
    const dist = Math.hypot(dx, dz);
    const speed = this.state === 'flee' ? PEDS.fleeSpeed : this.speed;
    if (dist > 0.6) {
      this.heading = Math.atan2(dx, dz);
      this.x += (dx / dist) * speed * dt;
      this.z += (dz / dist) * speed * dt;
      this.walkPhase += dt * speed * 2.2;
    }
    city.collideCircle(this, 0.5);
    const u = this.mesh.userData;
    const swing = dist > 0.6 ? Math.sin(this.walkPhase) * 0.5 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

export class PedestrianManager {
  constructor(scene, city, random, events) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.events = events;
    this.peds = [];
    for (let i = 0; i < PEDS.count; i += 1) this.spawnPed();
    this.fare = null; // the current taxi fare ped, if any
    this.fareTimer = 0;
  }

  /** A point on a sidewalk: just off a road line, along a block edge. */
  sidewalkPoint() {
    const random = this.random;
    const line = roadCenter(randInt(random, 0, CITY.blocks));
    const along = randFloat(random, -CITY_HALF + 10, CITY_HALF - 10);
    const side = (random() < 0.5 ? 1 : -1) * (CITY.roadWidth / 2 + 1.6);
    if (random() < 0.5) return { x: line + side, z: along };
    return { x: along, z: line + side };
  }

  spawnPed() {
    const p = this.sidewalkPoint();
    const ped = new Ped(this.scene, p.x, p.z, this.random);
    ped.target = this.sidewalkPoint();
    this.peds.push(ped);
    return ped;
  }

  /** Pick a fresh fare: a ped waiting on a sidewalk with a destination. */
  startFare() {
    const candidates = this.peds.filter((p) => !p.dead && p.state === 'walk');
    if (candidates.length === 0) return null;
    const ped = pick(this.random, candidates);
    ped.isFare = true;
    ped.state = 'waitFare';
    ped.fareDestination = this.sidewalkPoint();
    this.fare = ped;
    this.events.onFareSpawned(ped);
    return ped;
  }

  /** The player picked the fare up; they ride along now. */
  pickupFare() {
    if (!this.fare) return;
    this.fare.state = 'riding';
    this.events.onFarePickedUp(this.fare);
  }

  /** The fare arrived: pay out and free the ped. */
  completeFare() {
    if (!this.fare) return 0;
    const pay = 150 + Math.floor(this.random() * 250);
    const ped = this.fare;
    ped.isFare = false;
    ped.state = 'walk';
    ped.mesh.visible = true;
    ped.x = this.fareDestinationDrop.x;
    ped.z = this.fareDestinationDrop.z;
    ped.target = this.sidewalkPoint();
    this.fare = null;
    this.events.onFarePaid(pay);
    return pay;
  }

  update(dt, player, playerCar) {
    // Danger: gunfire or a speeding car nearby makes peds flee.
    const danger = playerCar && Math.abs(playerCar.speed) > 18
      ? { x: playerCar.x, z: playerCar.z }
      : null;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (ped.state === 'walk') {
        const dx = ped.target.x - ped.x;
        const dz = ped.target.z - ped.z;
        if (Math.hypot(dx, dz) < 1) ped.target = this.sidewalkPoint();
      }
      ped.update(dt, this.city, danger);
    }
    // Fare logic: waiting ped boards when the player's car stops nearby.
    if (this.fare && this.fare.state === 'waitFare' && playerCar) {
      const d = Math.hypot(this.fare.x - playerCar.x, this.fare.z - playerCar.z);
      if (d < 5 && Math.abs(playerCar.speed) < 2) {
        this.fare.state = 'toCar';
        this.fare.target = { x: playerCar.x, z: playerCar.z };
      }
    }
    if (this.fare && this.fare.state === 'toCar' && playerCar) {
      const d = Math.hypot(this.fare.x - playerCar.x, this.fare.z - playerCar.z);
      if (d < 2.2) {
        this.pickupFare();
        this.fareDestinationDrop = this.fare.fareDestination;
      }
    }
    if (this.fare && this.fare.state === 'riding' && playerCar) {
      const d = Math.hypot(this.fareDestinationDrop.x - playerCar.x, this.fareDestinationDrop.z - playerCar.z);
      if (d < 6 && Math.abs(playerCar.speed) < 2) this.completeFare();
    }
    // Keep the streets full: replace the dead.
    if (this.peds.filter((p) => !p.dead).length < PEDS.count - 4) this.spawnPed();
    // A new fare appears now and then when none is active.
    this.fareTimer -= dt;
    if (!this.fare && this.fareTimer <= 0) {
      this.fareTimer = 25 + this.random() * 20;
      this.startFare();
    }
  }
}
