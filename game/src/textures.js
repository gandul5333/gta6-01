// textures.js — every texture in Palmera Bay is painted at runtime on a canvas,
// so the game ships no image files and the city always looks coherent.

import * as THREE from 'three';

/** Make a canvas of the given size and hand back its 2D context. */
function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return [c, c.getContext('2d')];
}

/** Turn a painted canvas into a texture the renderer can use. */
function toTexture(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * A building facade: flat wall colour with a grid of windows, a few lit warm,
 * a darker ground floor with a door. One texture per building keeps the city
 * from looking stamped from a single sheet.
 */
export function makeBuildingTexture(random, baseColor, floors, cols) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so the wall is not perfectly flat.
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  const winW = 128 / cols;
  const winH = 256 / (floors + 1);
  for (let f = 0; f < floors; f += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = random() < 0.22;
      g.fillStyle = lit ? '#ffd98a' : '#274b5e';
      g.fillRect(col * winW + winW * 0.22, 10 + f * winH + winH * 0.22, winW * 0.56, winH * 0.5);
    }
  }
  // Ground floor: darker band with a door.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 256 - winH, 128, winH);
  g.fillStyle = '#1d2b33';
  g.fillRect(128 / 2 - 10, 256 - winH + 8, 20, winH - 8);
  return toTexture(c);
}

/**
 * The whole ground in one 2048 canvas: dark asphalt, the road grid with lane
 * dashes and crosswalks, pale sidewalks hugging each block, sand and sea along
 * the south edge. `size` is the world size the texture covers.
 */
export function makeGroundTexture(random, size, pitch, roadWidth, blocks) {
  const S = 2048;
  const [c, g] = canvas(S, S);
  const scale = S / size;
  const toPx = (v) => (v + size / 2) * scale;
  // Base: asphalt everywhere, then the beach band at the south edge.
  g.fillStyle = '#33363d';
  g.fillRect(0, 0, S, S);
  const beachTop = toPx(size / 2 - 34);
  g.fillStyle = '#e8d3a1';
  g.fillRect(0, beachTop, S, S - beachTop);
  g.fillStyle = '#1f8fa8';
  g.fillRect(0, toPx(size / 2 - 8), S, S - toPx(size / 2 - 8));
  // Sand speckles.
  g.fillStyle = 'rgba(120,90,40,0.25)';
  for (let i = 0; i < 900; i += 1) {
    g.fillRect(toPx(-size / 2 + random() * size), beachTop + random() * (S - beachTop), 2, 2);
  }
  // Roads: for each grid line, paint the road band, then sidewalks along blocks.
  const half = size / 2;
  for (let i = 0; i <= blocks; i += 1) {
    const line = -half + roadWidth / 2 + i * pitch;
    // Road band (both directions).
    g.fillStyle = '#2b2e35';
    g.fillRect(toPx(line - roadWidth / 2), 0, roadWidth * scale, S);
    g.fillRect(0, toPx(line - roadWidth / 2), S, roadWidth * scale);
    // Centre dashes.
    g.fillStyle = '#d8c25a';
    for (let d = -half + 4; d < half; d += 12) {
      g.fillRect(toPx(d), toPx(line - 0.4), 6 * scale, 0.8 * scale);
      g.fillRect(toPx(line - 0.4), toPx(d), 0.8 * scale, 6 * scale);
    }
  }
  // Sidewalk strips: pale border inside every block edge.
  g.fillStyle = '#9a938a';
  for (let bx = 0; bx < blocks; bx += 1) {
    for (let bz = 0; bz < blocks; bz += 1) {
      const x0 = -half + roadWidth + bx * pitch;
      const z0 = -half + roadWidth + bz * pitch;
      const b = 44; // blockSize
      g.fillRect(toPx(x0), toPx(z0), b * scale, 3 * scale);
      g.fillRect(toPx(x0), toPx(z0 + b - 3), b * scale, 3 * scale);
      g.fillRect(toPx(x0), toPx(z0), 3 * scale, b * scale);
      g.fillRect(toPx(x0 + b - 3), toPx(z0), 3 * scale, b * scale);
    }
  }
  // Crosswalk stripes at every intersection.
  g.fillStyle = 'rgba(230,230,220,0.75)';
  for (let i = 0; i <= blocks; i += 1) {
    for (let j = 0; j <= blocks; j += 1) {
      const x = -half + roadWidth / 2 + i * pitch;
      const z = -half + roadWidth / 2 + j * pitch;
      for (let s = -2; s <= 2; s += 1) {
        g.fillRect(toPx(x + s * 2.2 - 0.7), toPx(z - roadWidth / 2 + 1), 1.4 * scale, 3 * scale);
        g.fillRect(toPx(x + s * 2.2 - 0.7), toPx(z + roadWidth / 2 - 4), 1.4 * scale, 3 * scale);
        g.fillRect(toPx(x - roadWidth / 2 + 1), toPx(z + s * 2.2 - 0.7), 3 * scale, 1.4 * scale);
        g.fillRect(toPx(x + roadWidth / 2 - 4), toPx(z + s * 2.2 - 0.7), 3 * scale, 1.4 * scale);
      }
    }
  }
  return toTexture(c);
}

/**
 * A sign board: bold text on a coloured band. Used for the bank, the club, the
 * docks and the city name, so the screenshots read as a real place.
 */
export function makeSignTexture(text, sub, bg, fg) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, sub ? 52 : 64);
  if (sub) {
    g.font = 'bold 30px Arial, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(sub, 256, 102);
  }
  return toTexture(c);
}

/** A soft round blob, used for the sun glow and for cheap fake shadows. */
export function makeBlobTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c);
}
