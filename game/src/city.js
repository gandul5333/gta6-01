// city.js — builds Palmera Bay: a procedural coastal city of roads, towers,
// palms and signs, plus the collision data every moving thing in the game uses.

import * as THREE from 'three';
import { CITY, PITCH, CITY_HALF, PALETTE } from './config.js';
import { randFloat, randInt, pick } from './utils.js';
import { makeBuildingTexture, makeGroundTexture, makeSignTexture } from './textures.js';

/** Centreline coordinate of road line i (0..blocks). */
export function roadCenter(i) {
  return -CITY_HALF + CITY.roadWidth / 2 + i * PITCH;
}

/** The nearest road centreline coordinate for one axis (roads are PITCH apart). */
export function nearestRoadLine(c) {
  const i = Math.round((c + CITY_HALF - CITY.roadWidth / 2) / PITCH);
  return roadCenter(Math.max(0, Math.min(CITY.blocks, i)));
}

/** The nearest point on the road network to (x, z): used for spawning cars
 * and for getting a wedged car back onto asphalt. Whichever axis snaps
 * closer wins, so the point is always on a real road. */
export function nearestRoadPoint(x, z) {
  let bestX = roadCenter(0);
  let bestZ = z;
  let best = Infinity;
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const rx = roadCenter(i);
    const d = Math.abs(x - rx);
    if (d < best) {
      best = d;
      bestX = rx;
      bestZ = z;
    }
  }
  let best2 = Infinity;
  let bx = x;
  let bz = roadCenter(0);
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const rz = roadCenter(i);
    const d = Math.abs(z - rz);
    if (d < best2) {
      best2 = d;
      bz = rz;
      bx = x;
    }
  }
  return best <= best2 ? { x: bestX, z: bestZ } : { x: bx, z: bz };
}

export class City {
  constructor(scene, random) {
    this.scene = scene;
    this.random = random;
    this.colliders = []; // {minX, maxX, minZ, maxZ} building footprints
    this.palmPositions = [];
    this.landmarks = {};
    this.sun = null;
    this.hemi = null;
    this.skyMesh = null;
    this.buildGround();
    this.buildBlocks();
    this.buildPalmsAndLights();
    this.buildSigns();
    this.buildOcean();
    this.buildSky();
  }

  buildGround() {
    const size = CITY_HALF * 2 + 220; // extra room south for the beach and sea
    const tex = makeGroundTexture(this.random, size, PITCH, CITY.roadWidth, CITY.blocks);
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 60); // shift south so the sea band sits at the edge
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundSize = size;
  }

  buildBlocks() {
    const random = this.random;
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6560 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    for (let bx = 0; bx < CITY.blocks; bx += 1) {
      for (let bz = 0; bz < CITY.blocks; bz += 1) {
        const x0 = -CITY_HALF + CITY.roadWidth + bx * PITCH;
        const z0 = -CITY_HALF + CITY.roadWidth + bz * PITCH;
        const cx = bx - CITY.blocks / 2 + 0.5;
        const cz = bz - CITY.blocks / 2 + 0.5;
        const downtown = Math.abs(cx) <= 1.5 && Math.abs(cz) <= 1.5;
        const midtown = Math.abs(cx) <= 3 && Math.abs(cz) <= 3;
        const maxH = downtown ? 58 : midtown ? 26 : 14;
        const minH = downtown ? 22 : midtown ? 10 : 6;
        // One big tower downtown, otherwise a pair of smaller buildings.
        const spots = downtown
          ? [{ dx: CITY.blockSize / 2, dz: CITY.blockSize / 2, w: CITY.blockSize - 8, d: CITY.blockSize - 8 }]
          : [
              { dx: 13, dz: 13, w: 18, d: 18 },
              { dx: CITY.blockSize - 13, dz: CITY.blockSize - 13, w: 18, d: 18 },
            ];
        for (const spot of spots) {
          const h = randFloat(random, minH, maxH);
          const w = spot.w * randFloat(random, 0.85, 1);
          const d = spot.d * randFloat(random, 0.85, 1);
          const x = x0 + spot.dx;
          const z = z0 + spot.dz;
          const color = '#' + pick(random, PALETTE.building).toString(16).padStart(6, '0');
          const floors = Math.max(2, Math.round(h / 4));
          const facade = makeBuildingTexture(random, color, floors, Math.max(3, Math.round(w / 6)));
          const side = new THREE.MeshLambertMaterial({ map: facade });
          const geo = new THREE.BoxGeometry(w, h, d);
          const mesh = new THREE.Mesh(geo, [side, side, roofMat, darkMat, side, side]);
          mesh.position.set(x, h / 2, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
          // A rooftop box or two so the skyline is not flat.
          if (random() < 0.6) {
            const rw = w * randFloat(random, 0.25, 0.45);
            const rh = randFloat(random, 1.5, 4);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rw), roofMat);
            roof.position.set(x + randFloat(random, -w / 4, w / 4), h + rh / 2, z + randFloat(random, -d / 4, d / 4));
            roof.castShadow = true;
            this.scene.add(roof);
          }
        }
      }
    }
    // Landmarks sit on known blocks so missions can point at them.
    this.landmarks = {
      garage: { name: "Rico's Garage", x: roadCenter(1), z: roadCenter(5) },
      bank: { name: 'Bay Bank', x: roadCenter(4), z: roadCenter(3) },
      club: { name: 'Club Neon', x: roadCenter(7), z: roadCenter(4) },
      docks: { name: 'Docks 7', x: roadCenter(8), z: roadCenter(2) },
      // The safehouse is a stilt house on the south-east shore, far from the
      // garage, so the final escape is a real drive across the city.
      safehouse: { name: 'Safehouse', x: roadCenter(7), z: roadCenter(7) },
      // The row of parked cars on the avenue north of the garage: the
      // obvious place to steal your first set of wheels.
      cars: { name: 'Parked Cars', x: roadCenter(1), z: roadCenter(3) },
      beach: { name: 'Palmera Beach', x: roadCenter(4), z: CITY_HALF - 6 },
      pier: { name: 'Boardwalk', x: roadCenter(6), z: CITY_HALF - 6 },
    };
  }

  buildPalmsAndLights() {
    const random = this.random;
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
    const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x664411 });
    // Palms line the beach road and dot the sidewalks.
    for (let i = 0; i <= CITY.blocks; i += 1) {
      const x = roadCenter(i);
      const z = CITY_HALF - 20;
      this.addPalm(x + 9, z, trunkMat, leafMat);
      this.addPalm(x - 9, z + 6, trunkMat, leafMat);
    }
    for (let n = 0; n < 40; n += 1) {
      const bx = randInt(random, 0, CITY.blocks - 1);
      const bz = randInt(random, 0, CITY.blocks - 1);
      const x = -CITY_HALF + CITY.roadWidth + bx * PITCH + randFloat(random, 4, CITY.blockSize - 4);
      const z = -CITY_HALF + CITY.roadWidth + bz * PITCH + randFloat(random, 4, CITY.blockSize - 4);
      if (this.hitsBuilding(x, z, 1)) continue;
      this.addPalm(x, z, trunkMat, leafMat);
    }
    // Streetlights at every intersection.
    for (let i = 0; i <= CITY.blocks; i += 1) {
      for (let j = 0; j <= CITY.blocks; j += 1) {
        if ((i + j) % 2 === 1) continue;
        const x = roadCenter(i) + CITY.roadWidth / 2 + 0.5;
        const z = roadCenter(j) + CITY.roadWidth / 2 + 0.5;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
        pole.position.set(x, 3.5, z);
        this.scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
        lamp.position.set(x, 7.1, z);
        this.scene.add(lamp);
      }
    }
  }

  addPalm(x, z, trunkMat, leafMat) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6.5, 7), trunkMat);
    trunk.position.set(x, 3.25, z);
    trunk.rotation.z = (this.random() - 0.5) * 0.14;
    trunk.castShadow = true;
    this.scene.add(trunk);
    for (let f = 0; f < 5; f += 1) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 3.4), leafMat);
      const a = (f / 5) * Math.PI * 2 + this.random();
      leaf.position.set(x + Math.cos(a) * 1.2, 6.6, z + Math.sin(a) * 1.2);
      leaf.rotation.y = -a;
      leaf.rotation.x = 0.5;
      leaf.castShadow = true;
      this.scene.add(leaf);
    }
    this.palmPositions.push({ x, z });
  }

  buildSigns() {
    const signs = [
      { text: 'BAY BANK', sub: 'PALMERA BAY', bg: '#1d3a4d', fg: '#ffd98a', at: this.landmarks.bank, h: 9 },
      { text: 'CLUB NEON', sub: 'OPEN ALL NIGHT', bg: '#4d1d4d', fg: '#ff7ae0', at: this.landmarks.club, h: 8 },
      { text: 'DOCKS 7', sub: 'FREIGHT TERMINAL', bg: '#3d3a1d', fg: '#ffe9a8', at: this.landmarks.docks, h: 7 },
      { text: "RICO'S GARAGE", sub: 'REPAIRS • TOWING', bg: '#7a2d1d', fg: '#ffffff', at: this.landmarks.garage, h: 6 },
    ];
    for (const s of signs) {
      const tex = makeSignTexture(s.text, s.sub, s.bg, s.fg);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 3.5),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      mesh.position.set(s.at.x, s.h, s.at.z - 8);
      mesh.rotation.y = 0;
      this.scene.add(mesh);
    }
  }

  buildOcean() {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 260),
      new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.15, CITY_HALF + 130);
    this.scene.add(sea);
    // A long pier reaching into the sea, for the skyline.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 90), pierMat);
    pier.position.set(roadCenter(6), 1.2, CITY_HALF + 40);
    pier.castShadow = true;
    this.scene.add(pier);
  }

  buildSky() {
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = CITY_HALF + 60;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 260, 900);
    this.setTimeOfDay(0.42);
  }

  /**
   * t in [0, 1]: 0.25 morning, 0.5 noon, 0.75 golden hour, 0.92 sunset.
   * Moves the sun across the sky and warms the light as it drops.
   */
  setTimeOfDay(t) {
    const angle = Math.PI * (0.15 + t * 0.7); // east to west arc
    const height = Math.sin(angle) * 0.9 + 0.12;
    const dist = 420;
    this.sun.position.set(Math.cos(angle) * dist, height * dist, 140);
    const warm = Math.max(0, (t - 0.62) / 0.38); // 0 at noon, 1 at sunset
    const sky = new THREE.Color(PALETTE.sky).lerp(new THREE.Color(PALETTE.sunsetSky), warm);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.sun.color.setHex(warm > 0.5 ? 0xffc98a : PALETTE.sun);
    this.sun.intensity = 2.3 - warm * 0.7;
    this.hemi.intensity = 0.95 - warm * 0.3;
  }

  /** True when point (x, z) with radius r overlaps any building. */
  hitsBuilding(x, z, r) {
    for (const b of this.colliders) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  /**
   * Push a circle at (pos.x, pos.z) with radius r out of buildings and the
   * world bounds. Mutates pos, returns true when a push happened.
   */
  collideCircle(pos, r) {
    let hit = false;
    const bound = CITY_HALF + 70;
    if (pos.x < -bound) { pos.x = -bound; hit = true; }
    if (pos.x > bound) { pos.x = bound; hit = true; }
    if (pos.z < -bound) { pos.z = -bound; hit = true; }
    if (pos.z > bound) { pos.z = bound; hit = true; }
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // Dead centre: push out along the smallest penetration axis.
          const pl = pos.x - b.minX;
          const pr = b.maxX - pos.x;
          const pt = pos.z - b.minZ;
          const pb = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.minX - r;
          else if (m === pr) pos.x = b.maxX + r;
          else if (m === pt) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
        hit = true;
      }
    }
    return hit;
  }
}
