// police.js — the wanted system: heat that rises with every crime, police cars
// that chase and ram, foot cops who make arrests, and the slow cool-down when
// the player slips out of sight.

import * as THREE from 'three';
import { POLICE, WANTED, CITY_HALF } from './config.js';
import { clamp, randFloat, randInt } from './utils.js';
import { Vehicle } from './vehicles.js';
import { roadCenter, nearestRoadPoint, nearestRoadLine } from './city.js';

function buildCopMesh() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), uniform);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.68;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), new THREE.MeshLambertMaterial({ color: 0x10151c }));
  cap.position.y = 1.88;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), uniform);
  legL.position.set(-0.16, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legL, legR);
  group.userData = { legL, legR };
  return group;
}

class Cop {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = buildCopMesh();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.health = 100;
    this.dead = false;
    this.radius = 0.6;
    this.walkPhase = 0;
    this.punchCooldown = 0;
  }

  takeHit(damage, fromX, fromZ) {
    if (this.dead) return;
    this.health -= damage;
    if (this.health <= 0) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
    }
  }

  update(dt, city, tx, tz, onPunch) {
    if (this.dead) return;
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    const speed = 6.5;
    if (dist > 1.2) {
      this.heading = Math.atan2(dx, dz);
      this.x += (dx / dist) * speed * dt;
      this.z += (dz / dist) * speed * dt;
      this.walkPhase += dt * speed * 2;
    }
    this.punchCooldown -= dt;
    if (dist < 1.8 && this.punchCooldown <= 0) {
      this.punchCooldown = 0.8;
      onPunch();
    }
    city.collideCircle(this, 0.5);
    const u = this.mesh.userData;
    const swing = dist > 1.2 ? Math.sin(this.walkPhase) * 0.5 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

export class PoliceManager {
  constructor(scene, city, random, events) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.events = events;
    this.heat = 0; // 0..5, fractional; stars are the floor
    this.cars = [];
    this.cops = [];
    this.bustTimer = 0;
    this.sirenOn = false;
  }

  get stars() {
    return Math.min(WANTED.maxStars, Math.floor(this.heat));
  }

  addHeat(amount, reason) {
    const before = this.stars;
    this.heat = clamp(this.heat + amount, 0, WANTED.maxStars);
    if (this.stars > before) this.events.onWantedUp(this.stars, reason);
  }

  setHeat(value) {
    this.heat = clamp(value, 0, WANTED.maxStars);
  }

  /** Spawn a police car at exact coordinates (used by screenshot staging). */
  spawnCarAt(x, z, heading, speed = 22) {
    const car = new Vehicle(this.scene, 'police', x, z, heading);
    car.setSpeed(speed);
    this.cars.push(car);
    return car;
  }

  /** Spawn a police car on a road some distance from the player. */
  spawnCar(px, pz) {
    const random = this.random;
    const angle = random() * Math.PI * 2;
    const dist = randFloat(random, 55, 95);
    const near = nearestRoadPoint(px + Math.cos(angle) * dist, pz + Math.sin(angle) * dist);
    const car = new Vehicle(this.scene, 'police', near.x, near.z, Math.atan2(px - near.x, pz - near.z));
    car.speed = 20;
    this.cars.push(car);
    return car;
  }

  spawnCop(px, pz) {
    const angle = this.random() * Math.PI * 2;
    const cop = new Cop(this.scene, px + Math.cos(angle) * 12, pz + Math.sin(angle) * 12);
    this.cops.push(cop);
    return cop;
  }

  update(dt, player, playerCar) {
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    // Wanted strength decides the force.
    const wantCars = this.stars >= 1 ? Math.min(POLICE.maxCars, this.stars + (this.stars >= 3 ? 1 : 0)) : 0;
    while (this.cars.length < wantCars) this.spawnCar(px, pz);
    while (this.cars.length > wantCars) {
      const car = this.cars.pop();
      car.remove();
    }
    const wantCops = this.stars >= 3 && !playerCar ? 2 : 0;
    while (this.cops.length < wantCops) this.spawnCop(px, pz);
    while (this.cops.length > wantCops) {
      const cop = this.cops.pop();
      this.scene.remove(cop.mesh);
    }
    // Chase: police cars hunt the player and ram. They always follow the
    // road grid (Manhattan pursuit) so the chase runs down avenues instead
    // of cutting through buildings and getting wedged; close in, the grid
    // target converges on the player and the ram takes over.
    let nearest = Infinity;
    for (const car of this.cars) {
      const d0 = Math.hypot(px - car.x, pz - car.z);
      let tx = px;
      let tz = pz;
      // If the car ended up inside a block, drive out to the nearest road
      // first; only then follow the grid toward the player.
      const near = nearestRoadPoint(car.x, car.z);
      if (Math.hypot(near.x - car.x, near.z - car.z) > 5) {
        tx = near.x;
        tz = near.z;
      } else if (Math.abs(px - car.x) > Math.abs(pz - car.z)) {
        tx = px;
        tz = nearestRoadLine(car.z);
      } else {
        tx = nearestRoadLine(car.x);
        tz = pz;
      }
      car.driveToward(tx, tz, POLICE.chaseSpeed, dt);
      car.collideCity(this.city);
      const d = Math.hypot(car.x - px, car.z - pz);
      nearest = Math.min(nearest, d);
      if (d < 4.5) {
        // Ram: shove the player's car, or hurt the player on foot.
        if (playerCar) {
          const push = 9 * dt;
          const dx = playerCar.x - car.x;
          const dz = playerCar.z - car.z;
          const len = Math.hypot(dx, dz) || 1;
          playerCar.x += (dx / len) * push;
          playerCar.z += (dz / len) * push;
          playerCar.health -= POLICE.ramDamage * dt;
          playerCar.speed *= 0.94;
        } else if (d < 3) {
          player.takeHit(POLICE.ramDamage * dt * 2);
        }
      }
      // Despawn a car that fell far behind a cooled chase.
      if (d > 260 && this.stars === 0) {
        car.remove();
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
    // Foot cops close in and try to arrest an on-foot player.
    let copNear = false;
    for (const cop of this.cops) {
      cop.update(dt, this.city, px, pz, () => {
        if (!playerCar) player.takeHit(12);
      });
      const d = Math.hypot(cop.x - px, cop.z - pz);
      if (d < POLICE.bustRange && !playerCar && Math.abs(player.speed) < 2) copNear = true;
      if (cop.dead) {
        this.cops.splice(this.cops.indexOf(cop), 1);
        this.addHeat(WANTED.killCop, 'cop down');
      }
    }
    // Busted: a cop stays close to a slow on-foot player.
    if (copNear || (nearest < POLICE.bustRange && !playerCar && Math.abs(player.speed) < 1.5)) {
      this.bustTimer += dt;
      if (this.bustTimer >= POLICE.bustTime) {
        this.bustTimer = 0;
        this.events.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    // Heat cools when the player is far from every police car.
    const seen = nearest < POLICE.loseDistance;
    if (!seen && this.stars > 0) {
      this.heat = Math.max(0, this.heat - POLICE.coolPerSecond * dt);
    }
    // Siren state for the audio engine.
    const siren = this.cars.length > 0;
    if (siren !== this.sirenOn) {
      this.sirenOn = siren;
      this.events.onSiren(siren);
    }
    if (player.dead) this.events.onWasted();
  }

  reset() {
    for (const car of this.cars) car.remove();
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cars = [];
    this.cops = [];
    this.heat = 0;
    this.bustTimer = 0;
  }
}
