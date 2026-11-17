// player.js — Rico Marín on foot: walk, run, jump, punch, shoot, and steal
// cars. The character is a small articulated figure so the walk cycle reads
// at a glance in the screenshots.

import * as THREE from 'three';
import { PLAYER, WORLD } from './config.js';
import { clamp } from './utils.js';

function buildPersonMesh(shirtColor, skinColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.38), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 1.88;
  group.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legL.position.set(-0.16, 0.36, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armL.position.set(-0.42, 1.14, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armL, armR);
  // The pistol appears in the right hand when armed.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  gun.position.set(0.42, 0.86, 0.28);
  gun.visible = false;
  group.add(gun);
  group.userData = { legL, legR, armL, armR, gun, torso, head };
  return group;
}

export class Player {
  constructor(scene, x, z, events) {
    this.scene = scene;
    this.events = events;
    this.mesh = buildPersonMesh(0xd94f3d, 0xc98d64);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.vx = 0;
    this.vz = 0;
    this.health = PLAYER.health;
    this.ammo = PLAYER.pistolAmmo;
    this.reserve = PLAYER.pistolReserve;
    this.armed = false;
    this.inCar = null; // the Vehicle the player is driving, or null
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.walkPhase = 0;
    this.dead = false;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  /**
   * On-foot step. input: {fx, fz} camera-relative move dir (unit), run, jump.
   * Returns nothing; collisions are resolved against the city.
   */
  updateOnFoot(dt, input, city) {
    const wantSpeed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const tx = input.fx * wantSpeed;
    const tz = input.fz * wantSpeed;
    this.vx += (tx - this.vx) * Math.min(1, PLAYER.accel * dt / wantSpeed);
    this.vz += (tz - this.vz) * Math.min(1, PLAYER.accel * dt / wantSpeed);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.speed > 0.5) {
      this.heading = Math.atan2(this.vx, this.vz);
      this.walkPhase += dt * this.speed * 1.6;
    }
    if (input.jump && this.y === 0) this.vy = 8;
    this.vy += WORLD.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
    }
    city.collideCircle(this, PLAYER.radius);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.syncMesh();
  }

  syncMesh() {
    const u = this.mesh.userData;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = this.speed > 0.5 ? Math.sin(this.walkPhase) * 0.55 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    u.gun.visible = this.armed;
  }

  /** Enter a car: the player mesh hides and the car becomes the body. */
  enterCar(car) {
    this.inCar = car;
    this.mesh.visible = false;
    this.vx = 0;
    this.vz = 0;
  }

  /** Step out beside the car, on the side away from traffic. */
  exitCar(city) {
    const car = this.inCar;
    if (!car) return;
    this.inCar = null;
    const side = 2.6;
    this.x = car.x + Math.cos(car.heading) * side;
    this.z = car.z - Math.sin(car.heading) * side;
    this.heading = car.heading;
    city.collideCircle(this, PLAYER.radius);
    this.mesh.visible = true;
    this.syncMesh();
  }

  /**
   * Punch the nearest damageable thing in front. `targets` are objects with
   * x, z and takeHit(damage, fromX, fromZ). Returns the thing hit, or null.
   */
  punch(targets) {
    if (this.punchCooldown > 0 || this.inCar) return null;
    this.punchCooldown = 0.45;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let best = null;
    let bestD = PLAYER.punchRange + 0.6;
    for (const t of targets) {
      if (t.dead) continue;
      const dx = t.x - this.x;
      const dz = t.z - this.z;
      const d = Math.hypot(dx, dz);
      const along = dx * fx + dz * fz;
      if (d < bestD && along > 0) {
        best = t;
        bestD = d;
      }
    }
    if (best) {
      best.takeHit(PLAYER.punchDamage, this.x, this.z);
      this.events.onPunch(best);
    }
    return best;
  }

  /**
   * Fire the pistol along the camera aim. `targets` as in punch, plus an
   * optional list of cars. Returns the thing hit, or null on a miss.
   */
  shoot(aimX, aimZ, targets) {
    if (this.shootCooldown > 0 || this.inCar || this.ammo <= 0) return null;
    this.shootCooldown = 0.28;
    this.ammo -= 1;
    const dx = aimX - this.x;
    const dz = aimZ - this.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    let best = null;
    let bestAlong = PLAYER.pistolRange;
    for (const t of targets) {
      if (t.dead) continue;
      const rx = t.x - this.x;
      const rz = t.z - this.z;
      const along = rx * nx + rz * nz;
      if (along <= 0 || along > bestAlong) continue;
      const side = Math.abs(rx * nz - rz * nx);
      const radius = t.radius ?? 1.2;
      if (side < radius + 0.4) {
        best = t;
        bestAlong = along;
      }
    }
    if (best) {
      best.takeHit(PLAYER.pistolDamage, this.x, this.z);
      this.events.onShoot(best, true);
    } else {
      this.events.onShoot(null, false);
    }
    return best;
  }

  takeHit(damage) {
    if (this.dead) return;
    this.health -= damage;
    this.events.onDamage(damage);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, PLAYER.health);
  }

  reload() {
    const need = PLAYER.pistolAmmo - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
  }

  reset(x, z) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.health = PLAYER.health;
    this.ammo = PLAYER.pistolAmmo;
    this.reserve = PLAYER.pistolReserve;
    this.dead = false;
    this.inCar = null;
    this.mesh.visible = true;
    this.syncMesh();
  }
}
