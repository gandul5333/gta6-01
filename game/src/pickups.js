// pickups.js — cash lying around Palmera Bay: spinning gold stacks on the
// sidewalks, worth a few hundred dollars each, that come back after a while.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { randFloat, randInt } from './utils.js';
import { roadCenter } from './city.js';

const SPOTS = 14;

export class PickupManager {
  constructor(scene, city, random, events) {
    this.scene = scene;
    this.city = city;
    this.random = random;
    this.events = events; // { onCash }
    this.pickups = [];
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x664400 });
    for (let i = 0; i < SPOTS; i += 1) {
      const p = this.spot();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), mat);
      mesh.position.set(p.x, 0.7, p.z);
      mesh.castShadow = true;
      scene.add(mesh);
      this.pickups.push({
        x: p.x,
        z: p.z,
        value: 100 + randInt(random, 0, 3) * 50,
        mesh,
        active: true,
        timer: 0,
        phase: random() * 6,
      });
    }
  }

  spot() {
    const random = this.random;
    const line = roadCenter(randInt(random, 0, 8));
    const along = randFloat(random, -200, 200);
    const side = (random() < 0.5 ? 1 : -1) * (7 + 1.8);
    if (random() < 0.5) return { x: line + side, z: along };
    return { x: along, z: line + side };
  }

  update(dt, player) {
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    for (const p of this.pickups) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.active = true;
          p.mesh.visible = true;
        }
        continue;
      }
      p.phase += dt * 2;
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = 0.7 + Math.sin(p.phase) * 0.15;
      if (Math.hypot(px - p.x, pz - p.z) < 2.4) {
        p.active = false;
        p.mesh.visible = false;
        p.timer = WORLD.cashPickupRespawn;
        this.events.onCash(p.value);
        this.events.onPickup(p.value);
      }
    }
  }

  reset() {
    for (const p of this.pickups) {
      p.active = true;
      p.mesh.visible = true;
      p.timer = 0;
    }
  }
}
