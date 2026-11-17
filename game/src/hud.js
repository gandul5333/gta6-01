// hud.js — everything drawn over the 3D view: cash, health, wanted stars,
// the objective line, the minimap, messages, and the menus. All DOM, no WebGL.

import { CITY_HALF } from './config.js';
import { money, clamp } from './utils.js';

function el(id) {
  return document.getElementById(id);
}

export class HUD {
  constructor(callbacks) {
    this.cb = callbacks; // { onStart, onContinue, onResume, onRestart, onMenu }
    this.minimap = el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.messageTimer = 0;
    el('btn-start').addEventListener('click', () => this.cb.onStart());
    el('btn-continue').addEventListener('click', () => this.cb.onContinue());
    el('btn-resume').addEventListener('click', () => this.cb.onResume());
    el('btn-restart').addEventListener('click', () => this.cb.onRestart());
    el('btn-quit').addEventListener('click', () => this.cb.onMenu());
    el('btn-again').addEventListener('click', () => this.cb.onRestart());
    el('btn-menu2').addEventListener('click', () => this.cb.onMenu());
  }

  setCash(cash) {
    el('cash').textContent = money(cash);
  }

  setDebt(debt) {
    el('debt').textContent = debt > 0 ? `Debt ${money(debt)}` : 'DEBT PAID';
    el('debt').style.color = debt > 0 ? '#ff9a7a' : '#7ae08a';
  }

  setHealth(health) {
    el('health-fill').style.width = `${clamp(health, 0, 100)}%`;
    el('health-fill').style.background = health > 50 ? '#58c96b' : health > 25 ? '#e8c832' : '#d94f3d';
  }

  setAmmo(ammo, reserve) {
    el('ammo').textContent = `Pistol ${ammo} / ${reserve}`;
  }

  setStars(stars) {
    el('stars').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    el('stars').style.color = stars > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
  }

  setSpeed(kmh, inCar, carHealth) {
    el('speed').style.display = inCar ? 'block' : 'none';
    if (inCar) el('speed-value').textContent = `${kmh}`;
    el('car-health').style.display = inCar ? 'block' : 'none';
    if (inCar) el('car-health-fill').style.width = `${clamp(carHealth, 0, 100)}%`;
  }

  setObjective(text) {
    el('objective').textContent = text;
  }

  showMessage(title, body, seconds = 6) {
    el('msg-title').textContent = title;
    el('msg-body').textContent = body;
    el('message').style.opacity = '1';
    this.messageTimer = seconds;
  }

  hideMessage() {
    el('message').style.opacity = '0';
  }

  updateMessage(dt) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.hideMessage();
    }
  }

  showHold(progress) {
    const bar = el('hold');
    if (progress === null) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    el('hold-fill').style.width = `${clamp(progress * 100, 0, 100)}%`;
  }

  setHint(text) {
    el('hint').textContent = text;
  }

  /** Draw the minimap: roads, blocks, player arrow, mission marker, police. */
  drawMinimap(world) {
    const g = this.mm;
    const S = this.minimap.width;
    const scale = S / (CITY_HALF * 2 + 40);
    const toPx = (v) => (v + CITY_HALF + 20) * scale;
    g.fillStyle = '#10151c';
    g.fillRect(0, 0, S, S);
    // Sea along the south edge.
    g.fillStyle = '#1f8fa8';
    g.fillRect(0, toPx(CITY_HALF - 8), S, S - toPx(CITY_HALF - 8));
    // Roads.
    g.fillStyle = '#3a3e46';
    const city = world.city;
    for (let i = 0; i <= 8; i += 1) {
      const c = toPx(-CITY_HALF + 7 + i * 58) - 4;
      g.fillRect(c, 0, 8, S);
      g.fillRect(0, c, S, 8);
    }
    // Buildings.
    g.fillStyle = '#5a6068';
    for (const b of city.colliders) {
      g.fillRect(toPx(b.minX), toPx(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    }
    const dot = (x, z, color, r) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(toPx(x), toPx(z), r, 0, Math.PI * 2);
      g.fill();
    };
    // Mission target: pulsing yellow diamond.
    const target = world.missions.currentTarget();
    if (target) {
      const pulse = 5 + Math.sin(performance.now() / 200) * 2;
      g.fillStyle = '#ffd23e';
      g.beginPath();
      g.moveTo(toPx(target.x), toPx(target.z) - pulse);
      g.lineTo(toPx(target.x) + pulse, toPx(target.z));
      g.lineTo(toPx(target.x), toPx(target.z) + pulse);
      g.lineTo(toPx(target.x) - pulse, toPx(target.z));
      g.closePath();
      g.fill();
    }
    // Taxi fare.
    if (world.peds.fare && world.peds.fare.state === 'waitFare') {
      dot(world.peds.fare.x, world.peds.fare.z, '#58c96b', 4);
    }
    // Police cars.
    for (const car of world.police.cars) dot(car.x, car.z, '#4d8bff', 3.5);
    // Player arrow.
    const p = world.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    const heading = p.inCar ? p.inCar.heading : p.heading;
    g.save();
    g.translate(toPx(px), toPx(pz));
    g.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();
  }

  showScreen(name) {
    for (const id of ['menu', 'pause', 'end']) {
      el(id).style.display = id === name ? 'flex' : 'none';
    }
    el('hud').style.display = name === null ? 'block' : 'none';
  }

  showEnd(kind, stats) {
    el('end-title').textContent = kind === 'busted' ? 'BUSTED' : kind === 'wasted' ? 'WASTED' : 'DEBT PAID';
    el('end-sub').textContent =
      kind === 'busted'
        ? 'The Palmera Bay PD caught up with Rico. The debt still stands.'
        : kind === 'wasted'
          ? 'Rico went down in the streets of Palmera Bay. The debt still stands.'
          : 'All four jobs done. Vera Kross is paid, and Palmera Bay is yours, Rico.';
    el('end-stats').textContent = stats;
    this.showScreen('end');
  }
}
