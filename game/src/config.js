// config.js — every tuning number for Palmera Bay in one place, so the feel of
// the game can be adjusted without touching the systems that use the numbers.

// The city is a grid of blocks. Roads run between them; the beach is south (z+).
export const CITY = {
  blocks: 8, // blocks per side
  blockSize: 44, // a block's side in world units
  roadWidth: 14, // a road's width in world units
  sidewalk: 3, // sidewalk strip inside each block edge
};

// Derived: distance between neighbouring road centrelines, and the city half-size.
export const PITCH = CITY.blockSize + CITY.roadWidth;
export const CITY_HALF = (CITY.blocks * PITCH + CITY.roadWidth) / 2;

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  accel: 40,
  radius: 0.6,
  height: 1.8,
  health: 100,
  punchDamage: 25,
  punchRange: 1.6,
  pistolDamage: 34,
  pistolRange: 60,
  pistolAmmo: 24,
  pistolReserve: 120,
};

export const CAR = {
  accel: 22, // units/s^2 at full throttle
  brake: 34,
  reverseAccel: 14,
  maxSpeed: 38, // ~137 km/h
  maxReverse: 12,
  steer: 1.9, // rad/s at full lock, scaled down with speed
  grip: 8, // how fast lateral velocity is killed (arcade grip)
  handbrakeGrip: 1.2,
  radius: 1.5,
  health: 100,
};

export const TRAFFIC = {
  count: 14,
  speed: 11,
  minGap: 7,
};

export const PEDS = {
  count: 26,
  walkSpeed: 2.2,
  fleeSpeed: 5,
};

export const POLICE = {
  maxCars: 5,
  chaseSpeed: 42,
  ramDamage: 8,
  bustRange: 3.2,
  bustTime: 2.5, // seconds a cop must stay close to bust an on-foot player
  loseDistance: 130, // beyond this the heat starts to cool
  coolPerSecond: 0.12, // wanted heat lost per second while unseen
};

export const WANTED = {
  maxStars: 5,
  stealCar: 1, // stars added when a car is stolen in sight of the law
  hitPed: 1,
  shoot: 1,
  killCop: 2,
};

export const WORLD = {
  gravity: -22,
  dayLengthSeconds: 600, // full sun cycle; screenshots pin the time instead
  cashPickupRespawn: 45,
};

export const MISSIONS = {
  debtStart: 50000,
};

// Colours of the city: warm sun, teal sea, pastel walls, dark asphalt.
export const PALETTE = {
  sky: 0x87bfe8,
  sunsetSky: 0xff9a5c,
  sun: 0xffe3b3,
  sea: 0x1f8fa8,
  sand: 0xe8d3a1,
  asphalt: 0x33363d,
  sidewalk: 0x9a938a,
  building: [0xe8b48c, 0xd99a7c, 0xc9d6dd, 0xf0d9a8, 0xb8c4c9, 0xe0a899, 0x9fc3c9],
  glass: 0x2e4a5a,
  palmTrunk: 0x7a5230,
  palmLeaf: 0x3f9e4d,
  police: 0x1c2733,
  taxi: 0xf2c230,
};
