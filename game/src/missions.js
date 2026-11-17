// missions.js — the story of Palmera Bay: Rico Marín owes $50,000 to Vera
// Kross, and four jobs pay it down. Each mission is a chain of objectives the
// HUD and the minimap point at, one at a time.

import { MISSIONS } from './config.js';
import { money } from './utils.js';

export const MISSION_LIST = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 2000,
    briefing: 'Vera Kross owns your debt and your patience. Steal a car — any car — and bring it to my garage. No car, no work.',
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)', landmark: 'cars' },
      { type: 'drive', text: 'Drive the car to Rico\'s Garage', landmark: 'garage' },
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    reward: 8000,
    briefing: 'A package is waiting at Docks 7. Walk in, pick it up, and bring it to Club Neon. The docks are watched — don\'t linger.',
    steps: [
      { type: 'goto', text: 'Go to Docks 7', landmark: 'docks' },
      { type: 'hold', text: 'Pick up the package (stay in the circle)', landmark: 'docks', holdSeconds: 3 },
      { type: 'drive', text: 'Deliver the package to Club Neon', landmark: 'club' },
    ],
  },
  {
    id: 'lose-the-heat',
    title: 'Lose the Heat',
    reward: 10000,
    briefing: 'The pickup put you on the board. Three stars, Rico. Lose them. Stay out of sight, stay moving, and don\'t get caught.',
    steps: [
      { type: 'escape', text: 'Lose the wanted level — get away from the police', landmark: null },
    ],
  },
  {
    id: 'the-palmera-job',
    title: 'The Palmera Job',
    reward: 30000,
    briefing: 'The big one. Bay Bank, midday, in and out. Grab the cash, lose four stars, and bring it home to the safehouse. Then we\'re square.',
    steps: [
      { type: 'goto', text: 'Go to Bay Bank', landmark: 'bank' },
      { type: 'hold', text: 'Grab the cash (stay in the vault circle)', landmark: 'bank', holdSeconds: 5 },
      { type: 'drive', text: 'Escape the police and reach the Safehouse', landmark: 'safehouse' },
    ],
  },
];

export class MissionManager {
  constructor(world, events) {
    this.world = world; // { player, police, city }
    this.events = events; // { onObjective, onMissionComplete, onStoryComplete, onCash, onMessage }
    this.debt = MISSIONS.debtStart;
    this.completed = []; // ids of finished missions
    this.currentIndex = -1; // -1: no mission active
    this.stepIndex = 0;
    this.holdTimer = 0;
    this.active = false;
  }

  get current() {
    return this.currentIndex >= 0 ? MISSION_LIST[this.currentIndex] : null;
  }

  get currentStep() {
    const m = this.current;
    return m ? m.steps[this.stepIndex] : null;
  }

  /** Where the HUD arrow and the minimap should point right now. */
  currentTarget() {
    const step = this.currentStep;
    if (!step) return null;
    if (step.landmark) {
      const lm = this.world.city.landmarks[step.landmark];
      return { x: lm.x, z: lm.z, name: lm.name };
    }
    return null;
  }

  currentObjectiveText() {
    const m = this.current;
    const step = this.currentStep;
    if (!m || !step) return 'Free roam — explore Palmera Bay';
    return `${m.title}: ${step.text}`;
  }

  startNext() {
    const next = this.completed.length;
    if (next >= MISSION_LIST.length) return false;
    this.currentIndex = next;
    this.stepIndex = 0;
    this.holdTimer = 0;
    this.active = true;
    const m = this.current;
    this.events.onObjective(`${m.title} — ${m.steps[0].text}`);
    this.events.onMessage(m.title, m.briefing);
    if (m.id === 'lose-the-heat') this.world.police.setHeat(3);
    if (m.id === 'the-palmera-job') this.world.police.addHeat(0, 'job');
    return true;
  }

  advanceStep() {
    this.stepIndex += 1;
    this.holdTimer = 0;
    const m = this.current;
    if (this.stepIndex >= m.steps.length) {
      this.completeMission();
      return;
    }
    this.events.onObjective(`${m.title} — ${m.steps[this.stepIndex].text}`);
  }

  completeMission() {
    const m = this.current;
    this.completed.push(m.id);
    this.active = false;
    this.currentIndex = -1;
    this.stepIndex = 0;
    this.debt = Math.max(0, this.debt - m.reward);
    this.events.onCash(m.reward);
    this.events.onMissionComplete(m, m.reward);
    if (this.completed.length >= MISSION_LIST.length) {
      this.events.onStoryComplete();
    }
  }

  /** Called every frame while a mission is active. */
  update(dt) {
    if (!this.active) return;
    const { player } = this.world;
    const step = this.currentStep;
    if (!step) return;
    const car = player.inCar;
    const px = car ? car.x : player.x;
    const pz = car ? car.z : player.z;
    if (step.type === 'steal') {
      if (car) this.advanceStep();
      return;
    }
    if (step.type === 'escape') {
      if (this.world.police.stars === 0) this.advanceStep();
      return;
    }
    const target = this.currentTarget();
    if (!target) return;
    const d = Math.hypot(px - target.x, pz - target.z);
    if (step.type === 'goto' || step.type === 'drive') {
      const radius = step.type === 'drive' ? 9 : 6;
      if (d < radius) {
        if (step.type === 'drive' && this.current.id === 'the-pickup' && this.stepIndex === 2) {
          this.advanceStep();
        } else if (step.type === 'goto') {
          this.advanceStep();
        } else {
          this.advanceStep();
        }
      }
      return;
    }
    if (step.type === 'hold') {
      if (d < 8) {
        this.holdTimer += dt;
        this.events.onHoldProgress(this.holdTimer / step.holdSeconds);
        if (this.holdTimer >= step.holdSeconds) {
          if (this.current.id === 'the-pickup') {
            this.world.police.addHeat(1, 'package lifted');
            this.events.onMessage('Package secured', 'They know. Get to Club Neon — fast.');
          }
          if (this.current.id === 'the-palmera-job') {
            this.world.police.setHeat(4);
            this.events.onMessage('Vault emptied', 'Four stars, Rico. Run.');
          }
          this.advanceStep();
        }
      } else {
        this.holdTimer = Math.max(0, this.holdTimer - dt);
        this.events.onHoldProgress(this.holdTimer / step.holdSeconds);
      }
    }
  }

  reset() {
    this.debt = MISSIONS.debtStart;
    this.completed = [];
    this.currentIndex = -1;
    this.stepIndex = 0;
    this.holdTimer = 0;
    this.active = false;
  }
}
