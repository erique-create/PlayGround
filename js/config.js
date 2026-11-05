// ---------------------------------------------------------------------------
// Data definitions: items, loot, buildings, recipes, professions.
// Content lives here so new items or recipes do not require engine changes.
// ---------------------------------------------------------------------------

export const ITEMS = {
  // Food & drink
  water: { name: 'Water Bottle', icon: '💧', cat: 'drink', w: 0.55, stack: 6, use: { thirst: 32 }, desc: 'Clean water. Restores thirst.' },
  dirty_water: { name: 'Dirty Water', icon: '🥤', cat: 'drink', w: 0.55, stack: 6, use: { thirst: 20, health: -4 }, desc: 'Murky. Drink only if desperate.' },
  soda: { name: 'Soda Can', icon: '🥫', cat: 'drink', w: 0.4, stack: 6, use: { thirst: 18, fatigue: -3 }, desc: 'Sugary and flat.' },
  energy_drink: { name: 'Energy Drink', icon: '⚡', cat: 'drink', w: 0.45, stack: 4, use: { thirst: 12, fatigue: -18, stamina: 30 }, desc: 'Fights off sleep. Briefly.' },
  canned_beans: { name: 'Canned Beans', icon: '🫘', cat: 'food', w: 0.7, stack: 5, use: { hunger: 24, thirst: -2 }, desc: 'Cold beans. Better cooked.' },
  canned_soup: { name: 'Canned Soup', icon: '🥫', cat: 'food', w: 0.75, stack: 5, use: { hunger: 26, thirst: 4 }, desc: 'Still edible cold.' },
  bread: { name: 'Stale Bread', icon: '🍞', cat: 'food', w: 0.35, stack: 4, use: { hunger: 18, thirst: -2 }, desc: 'Dry, but it fills a hole.' },
  apple: { name: 'Apple', icon: '🍎', cat: 'food', w: 0.25, stack: 6, use: { hunger: 12, thirst: 6, health: 2 }, desc: 'A little sweetness left.' },
  chips: { name: 'Bag of Chips', icon: '🍟', cat: 'food', w: 0.25, stack: 4, use: { hunger: 14, thirst: -6 }, desc: 'Salt and air.' },
  granola: { name: 'Granola Bar', icon: '🍫', cat: 'food', w: 0.18, stack: 6, use: { hunger: 15, stamina: 8 }, desc: 'Good for the road.' },
  hot_meal: { name: 'Hot Meal', icon: '🍲', cat: 'food', w: 0.7, stack: 3, use: { hunger: 50, thirst: 8, health: 8, warmth: 18 }, desc: 'Warm, filling, morale in a bowl.' },
  raw_veg: { name: 'Fresh Vegetables', icon: '🥕', cat: 'food', w: 0.4, stack: 6, use: { hunger: 16, thirst: 5, health: 3 }, desc: 'Grown in someone garden.' },
  rotten_food: { name: 'Rotten Food', icon: '🦠', cat: 'food', w: 0.4, stack: 3, use: { hunger: 10, health: -15 }, desc: 'Do not eat this.' },
  // Medical
  bandage: { name: 'Bandage', icon: '🩹', cat: 'medical', w: 0.15, stack: 8, use: { health: 6, bleed: -100 }, desc: 'Stops bleeding. Restores a little health.' },
  painkillers: { name: 'Painkillers', icon: '💊', cat: 'medical', w: 0.1, stack: 8, use: { health: 10, pain: -60 }, desc: 'Dulls pain and steadies your hands.' },
  antibiotics: { name: 'Antibiotics', icon: '🧪', cat: 'medical', w: 0.12, stack: 5, use: { infection: -45, health: 4 }, desc: 'Slows infection. Take early.' },
  vitamins: { name: 'Vitamins', icon: '💊', cat: 'medical', w: 0.1, stack: 6, use: { stamina: 20, health: 6 }, desc: 'A small boost.' },
  splint: { name: 'Splint', icon: '🦴', cat: 'medical', w: 0.4, stack: 2, use: { fracture: -1, health: 6 }, desc: 'Sets a broken limb.' },
  // Materials
  cloth: { name: 'Cloth Scraps', icon: '🧵', cat: 'material', w: 0.1, stack: 20, desc: 'Torn cloth. Good for bandages.' },
  wood: { name: 'Wood Plank', icon: '🪵', cat: 'material', w: 0.9, stack: 20, desc: 'Sturdy plank. Building material.' },
  nails: { name: 'Nails', icon: '📌', cat: 'material', w: 0.05, stack: 30, desc: 'For barricades and crates.' },
  scrap: { name: 'Scrap Metal', icon: '⚙️', cat: 'material', w: 0.6, stack: 12, desc: 'Bent metal. Useful in a pinch.' },
  duct_tape: { name: 'Duct Tape', icon: '🧻', cat: 'material', w: 0.2, stack: 5, desc: 'Fixes almost anything. Almost.' },
  fuel: { name: 'Fuel Can', icon: '⛽', cat: 'material', w: 2.2, stack: 2, desc: 'Smells dangerous. Could fuel a generator.' },
  battery: { name: 'Battery', icon: '🔋', cat: 'material', w: 0.2, stack: 6, desc: 'Still has some charge.' },
  seeds: { name: 'Seed Packet', icon: '🌱', cat: 'material', w: 0.05, stack: 10, desc: 'Plant in a farm plot.' },
  fertilizer: { name: 'Fertilizer', icon: '🌾', cat: 'material', w: 0.8, stack: 6, desc: 'Speeds up crops.' },
  // Gear / light
  flashlight: { name: 'Flashlight', icon: '🔦', cat: 'gear', w: 0.5, stack: 1, equip: 'light', dur: 300, light: 8.5, desc: 'Cuts the dark. Attracts attention.' },
  battery_lamp: { name: 'Battery Lamp', icon: '💡', cat: 'gear', w: 0.9, stack: 1, equip: 'light', dur: 500, light: 6, desc: 'A warm circle of safety.' },
  lighter: { name: 'Lighter', icon: '🔥', cat: 'gear', w: 0.08, stack: 2, desc: 'For campfires and candles.' },
  radio: { name: 'Hand Radio', icon: '📻', cat: 'gear', w: 0.6, stack: 1, use: { radio: 1 }, desc: 'Tune in for news. Or a voice.' },
  map_item: { name: 'Torn Map', icon: '🗺️', cat: 'gear', w: 0.1, stack: 1, use: { reveal: 1 }, desc: 'Reveals nearby streets and buildings.' },
  backpack: { name: 'Hiking Pack', icon: '🎒', cat: 'gear', w: 0.8, stack: 1, equip: 'backpack', carry: 9, desc: 'Carry more. Wear it.' },
  jacket: { name: 'Leather Jacket', icon: '🧥', cat: 'gear', w: 1.2, stack: 1, equip: 'armor', armor: 0.22, warmth: 12, desc: 'Turns teeth aside, keeps the chill out.' },
  // Ammo
  ammo: { name: '9mm Rounds', icon: '🔩', cat: 'ammo', w: 0.02, stack: 30, desc: 'Precious, loud, and finite.' },
  // Weapons
  knife: { name: 'Kitchen Knife', icon: '🔪', cat: 'weapon', w: 0.35, stack: 1, equip: 'weapon', weapon: { damage: 12, range: 0.78, speed: 0.36, stamina: 6, noise: 3, arc: 0.9 }, dur: 70, desc: 'Fast and quiet. Fragile.' },
  hammer: { name: 'Claw Hammer', icon: '🔨', cat: 'weapon', w: 0.7, stack: 1, equip: 'weapon', weapon: { damage: 16, range: 0.88, speed: 0.48, stamina: 9, noise: 5, arc: 1.0 }, dur: 110, desc: 'Tool first, weapon second.' },
  bat: { name: 'Baseball Bat', icon: '🏏', cat: 'weapon', w: 1.1, stack: 1, equip: 'weapon', weapon: { damage: 23, range: 1.14, speed: 0.56, stamina: 12, noise: 8, arc: 1.15 }, dur: 130, desc: 'Swing wide. Keep them back.' },
  crowbar: { name: 'Crowbar', icon: '🪝', cat: 'weapon', w: 1.2, stack: 1, equip: 'weapon', weapon: { damage: 19, range: 0.98, speed: 0.5, stamina: 10, noise: 6, arc: 0.95 }, dur: 220, desc: 'Heavy, dependable, pries doors.' },
  axe: { name: 'Fire Axe', icon: '🪓', cat: 'weapon', w: 1.9, stack: 1, equip: 'weapon', weapon: { damage: 33, range: 1.02, speed: 0.82, stamina: 18, noise: 9, arc: 1.0 }, dur: 150, desc: 'Devastating. Slow and tiring.' },
  machete: { name: 'Machete', icon: '🗡️', cat: 'weapon', w: 0.9, stack: 1, equip: 'weapon', weapon: { damage: 25, range: 0.95, speed: 0.5, stamina: 12, noise: 5, arc: 1.0 }, dur: 100, desc: 'Made for clearing brush. Or worse.' },
  spear: { name: 'Wood Spear', icon: '🔱', cat: 'weapon', w: 1.4, stack: 1, equip: 'weapon', weapon: { damage: 20, range: 1.45, speed: 0.62, stamina: 10, noise: 4, arc: 0.55 }, dur: 80, desc: 'Reach is survival.' },
  torch: { name: 'Burning Torch', icon: '🕯️', cat: 'weapon', w: 0.8, stack: 1, equip: 'weapon', light: 6.5, weapon: { damage: 10, range: 0.9, speed: 0.55, stamina: 8, noise: 3, arc: 0.9 }, dur: 180, desc: 'A light you can swing.' },
  pistol: { name: '9mm Pistol', icon: '🔫', cat: 'weapon', w: 1.0, stack: 1, equip: 'weapon', weapon: { damage: 42, range: 7.5, speed: 0.8, stamina: 5, noise: 30, arc: 0.1, ranged: true }, dur: 240, desc: 'Ends fights. Starts hordes.' },
};

export const FISTS = { name: 'Bare Hands', icon: '✊', weapon: { damage: 5, range: 0.66, speed: 0.42, stamina: 5, noise: 2, arc: 0.9 } };

// Loot tables: each entry is {id, w, q:[min,max]}. Rarer items have small weights.
export const LOOT = {
  cold: [
    { id: 'water', w: 5, q: [1, 2] }, { id: 'soda', w: 3, q: [1, 2] }, { id: 'canned_beans', w: 2, q: [1, 2] },
    { id: 'canned_soup', w: 2, q: [1, 1] }, { id: 'apple', w: 2, q: [1, 2] }, { id: 'bread', w: 2, q: [1, 1] },
    { id: 'raw_veg', w: 1, q: [1, 2] }, { id: 'energy_drink', w: 1, q: [1, 1] }, { id: 'rotten_food', w: 1, q: [1, 1] },
  ],
  food: [
    { id: 'canned_beans', w: 4, q: [1, 3] }, { id: 'canned_soup', w: 3, q: [1, 2] }, { id: 'water', w: 3, q: [1, 3] },
    { id: 'chips', w: 3, q: [1, 2] }, { id: 'granola', w: 3, q: [1, 3] }, { id: 'soda', w: 2, q: [1, 2] },
    { id: 'bread', w: 2, q: [1, 2] }, { id: 'seeds', w: 1, q: [1, 2] }, { id: 'fertilizer', w: 1, q: [1, 1] },
  ],
  kitchen: [
    { id: 'knife', w: 2, q: [1, 1] }, { id: 'cloth', w: 3, q: [1, 3] }, { id: 'canned_beans', w: 2, q: [1, 2] },
    { id: 'water', w: 3, q: [1, 2] }, { id: 'granola', w: 2, q: [1, 2] }, { id: 'lighter', w: 1, q: [1, 1] },
    { id: 'duct_tape', w: 1, q: [1, 1] }, { id: 'battery', w: 1, q: [1, 2] },
  ],
  household: [
    { id: 'cloth', w: 5, q: [1, 4] }, { id: 'battery', w: 2, q: [1, 2] }, { id: 'lighter', w: 2, q: [1, 1] },
    { id: 'duct_tape', w: 2, q: [1, 2] }, { id: 'wood', w: 2, q: [1, 3] }, { id: 'nails', w: 2, q: [2, 5] },
    { id: 'map_item', w: 1, q: [1, 1] }, { id: 'flashlight', w: 1, q: [1, 1] }, { id: 'radio', w: 1, q: [1, 1] },
  ],
  clothing: [
    { id: 'cloth', w: 5, q: [2, 5] }, { id: 'jacket', w: 2, q: [1, 1] }, { id: 'backpack', w: 1, q: [1, 1] },
    { id: 'duct_tape', w: 1, q: [1, 1] },
  ],
  medical: [
    { id: 'bandage', w: 5, q: [1, 3] }, { id: 'painkillers', w: 3, q: [1, 2] }, { id: 'antibiotics', w: 2, q: [1, 2] },
    { id: 'vitamins', w: 2, q: [1, 2] }, { id: 'cloth', w: 2, q: [1, 3] }, { id: 'splint', w: 1, q: [1, 1] },
  ],
  tools: [
    { id: 'hammer', w: 2, q: [1, 1] }, { id: 'crowbar', w: 2, q: [1, 1] }, { id: 'axe', w: 1, q: [1, 1] },
    { id: 'scrap', w: 4, q: [1, 3] }, { id: 'nails', w: 3, q: [3, 8] }, { id: 'wood', w: 3, q: [1, 4] },
    { id: 'duct_tape', w: 2, q: [1, 2] }, { id: 'battery', w: 2, q: [1, 2] }, { id: 'flashlight', w: 1, q: [1, 1] },
  ],
  industrial: [
    { id: 'wood', w: 4, q: [2, 5] }, { id: 'nails', w: 4, q: [4, 10] }, { id: 'scrap', w: 4, q: [2, 4] },
    { id: 'fuel', w: 2, q: [1, 2] }, { id: 'duct_tape', w: 2, q: [1, 2] }, { id: 'battery', w: 2, q: [1, 2] },
    { id: 'machete', w: 1, q: [1, 1] }, { id: 'hammer', w: 1, q: [1, 1] },
  ],
  police: [
    { id: 'ammo', w: 3, q: [4, 10] }, { id: 'bandage', w: 3, q: [1, 2] }, { id: 'flashlight', w: 2, q: [1, 1] },
    { id: 'bat', w: 2, q: [1, 1] }, { id: 'radio', w: 1, q: [1, 1] }, { id: 'jacket', w: 1, q: [1, 1] },
    { id: 'pistol', w: 1, q: [1, 1] }, { id: 'map_item', w: 1, q: [1, 1] },
  ],
  school: [
    { id: 'backpack', w: 2, q: [1, 1] }, { id: 'cloth', w: 3, q: [1, 4] }, { id: 'granola', w: 3, q: [1, 2] },
    { id: 'water', w: 2, q: [1, 2] }, { id: 'bandage', w: 2, q: [1, 2] }, { id: 'map_item', w: 1, q: [1, 1] },
    { id: 'battery', w: 1, q: [1, 2] },
  ],
  garage: [
    { id: 'scrap', w: 4, q: [1, 4] }, { id: 'duct_tape', w: 3, q: [1, 2] }, { id: 'fuel', w: 3, q: [1, 2] },
    { id: 'crowbar', w: 2, q: [1, 1] }, { id: 'hammer', w: 2, q: [1, 1] }, { id: 'battery', w: 2, q: [1, 2] },
    { id: 'nails', w: 2, q: [2, 6] },
  ],
};

// Containers ---------------------------------------------------------------
export const CONTAINERS = {
  fridge: { name: 'Refrigerator', loot: 'cold', color: '#cfd3ce', icon: '❄' },
  freezer: { name: 'Chest Freezer', loot: 'cold', color: '#c4cbc6', icon: '❄' },
  cabinet: { name: 'Kitchen Cabinet', loot: 'kitchen', color: '#a4774f', icon: '' },
  pantry: { name: 'Pantry', loot: 'food', color: '#8b6a4a', icon: '' },
  wardrobe: { name: 'Wardrobe', loot: 'clothing', color: '#7b5a3e', icon: '' },
  shelf: { name: 'Store Shelf', loot: 'food', color: '#8f9490', icon: '' },
  display: { name: 'Display Counter', loot: 'food', color: '#b08a55', icon: '' },
  counter: { name: 'Kitchen Counter', loot: 'kitchen', color: '#b39a78', icon: '' },
  medcab: { name: 'Medicine Cabinet', loot: 'medical', color: '#e1e4dc', icon: '✚' },
  supply: { name: 'Medical Supply Locker', loot: 'medical', color: '#ccd5cf', icon: '✚' },
  toolbox: { name: 'Toolbox', loot: 'tools', color: '#b54b3a', icon: '' },
  workbench: { name: 'Workbench Drawer', loot: 'tools', color: '#8b6f52', icon: '' },
  crate: { name: 'Wooden Crate', loot: 'industrial', color: '#8c7048', icon: '' },
  locker: { name: 'Metal Locker', loot: 'police', color: '#69787a', icon: '' },
  desk: { name: 'Office Desk', loot: 'school', color: '#7b6246', icon: '' },
  dumpster: { name: 'Dumpster', loot: 'household', color: '#4f6b58', icon: '' },
  trunk: { name: 'Car Trunk', loot: 'garage', color: '#5d6a6b', icon: '' },
  stash: { name: 'Hidden Stash', loot: 'tools', color: '#7d6a4f', icon: '' },
};

export const RECIPES = [
  { id: 'bandage', name: 'Bandage', icon: '🩹', out: 'bandage', qty: 2, cost: { cloth: 2 }, skill: 'firstaid', level: 0, desc: 'Clean cloth strips. Stops bleeding.' },
  { id: 'splint', name: 'Splint', icon: '🦴', out: 'splint', qty: 1, cost: { wood: 2, cloth: 1 }, skill: 'firstaid', level: 1, desc: 'Sets a fracture.' },
  { id: 'torch', name: 'Burning Torch', icon: '🕯️', out: 'torch', qty: 1, cost: { wood: 1, cloth: 1 }, skill: 'survival', level: 0, desc: 'Portable light and a weak weapon.' },
  { id: 'spear', name: 'Wood Spear', icon: '🔱', out: 'spear', qty: 1, cost: { wood: 2, scrap: 1 }, skill: 'carpentry', level: 1, desc: 'Keeps the infected at arm length.' },
  { id: 'poultice', name: 'Herbal Poultice', icon: '🌿', out: 'bandage', qty: 2, cost: { cloth: 1, seeds: 1 }, skill: 'survival', level: 2, desc: 'Improvised field dressing.' },
  { id: 'painkillers', name: 'Crushed Painkillers', icon: '💊', out: 'painkillers', qty: 2, cost: { vitamins: 1, cloth: 1 }, skill: 'firstaid', level: 2, desc: 'Stretch your medicine supply.' },
  { id: 'soup', name: 'Hot Soup', icon: '🍲', out: 'hot_meal', qty: 1, cost: { canned_soup: 1 }, station: 'heat', skill: 'cooking', level: 0, desc: 'Warm, filling, restores health.' },
  { id: 'beans', name: 'Cooked Beans', icon: '🍲', out: 'hot_meal', qty: 1, cost: { canned_beans: 1 }, station: 'heat', skill: 'cooking', level: 0, desc: 'A hot meal beats cold beans.' },
  { id: 'stew', name: 'Vegetable Stew', icon: '🥘', out: 'hot_meal', qty: 2, cost: { raw_veg: 2, water: 1 }, station: 'heat', skill: 'cooking', level: 1, desc: 'Proper food. Two portions.' },
  { id: 'boil', name: 'Boil Water', icon: '💧', out: 'water', qty: 1, cost: { dirty_water: 1 }, station: 'heat', skill: 'cooking', level: 0, desc: 'Kills whatever is swimming in it.' },
];

export const BUILD_RECIPES = [
  { id: 'campfire', name: 'Campfire', icon: '🔥', cost: { wood: 3, scrap: 2 }, skill: 'survival', level: 0, desc: 'Warmth, light and a place to cook.' },
  { id: 'crate', name: 'Storage Crate', icon: '📦', cost: { wood: 4, nails: 2 }, skill: 'carpentry', level: 0, desc: 'Stores 20 weight of supplies.' },
  { id: 'barricade', name: 'Barricade', icon: '🪵', cost: { wood: 4, nails: 3 }, skill: 'carpentry', level: 1, desc: 'A solid block. Slows the dead.' },
  { id: 'farm_plot', name: 'Farm Plot', icon: '🌱', cost: { wood: 2, seeds: 1 }, skill: 'farming', level: 0, desc: 'Plant seeds. Harvest in two days.' },
  { id: 'rain_collector', name: 'Rain Collector', icon: '🛢️', cost: { scrap: 4, cloth: 2 }, skill: 'carpentry', level: 1, desc: 'Collects dirty water when it rains.' },
  { id: 'bedroll', name: 'Bedroll', icon: '🛏️', cost: { cloth: 4, wood: 1 }, skill: 'survival', level: 1, desc: 'Sleep rough and recover fatigue.' },
];

export const PROFESSIONS = {
  survivor: {
    name: 'Survivor', icon: '🧢', blurb: 'Balanced instincts. A little better at everything.',
    skills: { combat: 1, carpentry: 1, firstaid: 1, cooking: 1, farming: 1, survival: 1 },
    items: [{ id: 'water', qty: 2 }, { id: 'granola', qty: 2 }, { id: 'bandage', qty: 1 }, { id: 'bat', qty: 1 }],
    perk: '+10% experience from all actions.',
  },
  carpenter: {
    name: 'Carpenter', icon: '🔨', blurb: 'Knows how to make a wall feel like home.',
    skills: { combat: 0, carpentry: 3, firstaid: 1, cooking: 0, farming: 0, survival: 1 },
    items: [{ id: 'hammer', qty: 1 }, { id: 'wood', qty: 6 }, { id: 'nails', qty: 8 }, { id: 'water', qty: 1 }],
    perk: 'Building costs 25% less wood. Starts with tools.',
  },
  medic: {
    name: 'Paramedic', icon: '✚', blurb: 'Steady hands, even when everything is on fire.',
    skills: { combat: 0, carpentry: 0, firstaid: 3, cooking: 1, farming: 0, survival: 1 },
    items: [{ id: 'bandage', qty: 4 }, { id: 'painkillers', qty: 2 }, { id: 'antibiotics', qty: 1 }, { id: 'knife', qty: 1 }, { id: 'water', qty: 1 }],
    perk: 'Bandages heal 60% more.',
  },
  cook: {
    name: 'Line Cook', icon: '🍳', blurb: 'Can make a feast out of almost nothing.',
    skills: { combat: 0, carpentry: 0, firstaid: 1, cooking: 3, farming: 0, survival: 1 },
    items: [{ id: 'canned_beans', qty: 2 }, { id: 'canned_soup', qty: 1 }, { id: 'water', qty: 2 }, { id: 'lighter', qty: 1 }, { id: 'knife', qty: 1 }],
    perk: 'Meals restore 50% more hunger and health.',
  },
  farmer: {
    name: 'Farmer', icon: '🌾', blurb: 'Patient. Practical. Used to long days.',
    skills: { combat: 0, carpentry: 1, firstaid: 0, cooking: 1, farming: 3, survival: 2 },
    items: [{ id: 'seeds', qty: 3 }, { id: 'fertilizer', qty: 1 }, { id: 'apple', qty: 2 }, { id: 'water', qty: 1 }, { id: 'hammer', qty: 1 }],
    perk: 'Crops grow 30% faster. More stamina.',
  },
  veteran: {
    name: 'Veteran', icon: '🎖️', blurb: 'You have seen worse. Probably.',
    skills: { combat: 3, carpentry: 0, firstaid: 1, cooking: 0, farming: 0, survival: 2 },
    items: [{ id: 'crowbar', qty: 1 }, { id: 'bandage', qty: 2 }, { id: 'water', qty: 2 }, { id: 'granola', qty: 1 }],
    perk: '+20 max health. Melee hits harder.',
  },
};

export const DIFFICULTIES = {
  normal: { name: 'Standard', desc: 'A fair fight. Scarcity with breathing room.', zed: 1, damage: 1, loot: 1, drain: 1 },
  hard: { name: 'Nightmare', desc: 'More dead, less food, harder hits.', zed: 1.55, damage: 1.3, loot: 0.75, drain: 1.25 },
  casual: { name: 'Safehouse', desc: 'Fewer infected and more supplies.', zed: 0.65, damage: 0.7, loot: 1.35, drain: 0.8 },
};

export const SKILLS = {
  combat: { name: 'Combat', icon: '⚔' },
  carpentry: { name: 'Carpentry', icon: '🔨' },
  firstaid: { name: 'First Aid', icon: '✚' },
  cooking: { name: 'Cooking', icon: '🍳' },
  farming: { name: 'Farming', icon: '🌱' },
  survival: { name: 'Survival', icon: '🧭' },
};

// Building archetypes -------------------------------------------------------
export const BUILDINGS = {
  house: {
    w: 7, h: 7, wall: '#8a7560', trim: '#6b5947', floor: 'wood', roof: '#4c3f34',
    containers: ['fridge', 'cabinet', 'wardrobe'], props: ['bed', 'table', 'chair', 'stove', 'plant'],
    names: ['Rosewood House', 'Maple Residence', 'Elm Cottage', 'Cedar House', 'Pine House', 'Birch House', 'Willow Home'],
  },
  cabin: {
    w: 5, h: 5, wall: '#6f5b45', trim: '#554635', floor: 'wood', roof: '#3f3329',
    containers: ['cabinet', 'wardrobe'], props: ['bed', 'stove', 'chair'],
    names: ['Blackpine Cabin', 'Lakeside Cabin', 'Ranger Hut', 'Woodcutter Cabin'],
  },
  store: {
    w: 10, h: 8, wall: '#9b8b6f', trim: '#73634c', floor: 'tile', roof: '#57503f',
    containers: ['shelf', 'shelf', 'shelf', 'display', 'freezer', 'counter'], props: ['chair', 'plant'],
    names: ['Havenwood Market', 'Corner Grocery', "Miller's Market", 'Route 9 Mart'],
  },
  pharmacy: {
    w: 7, h: 7, wall: '#8d9a91', trim: '#67746c', floor: 'tile', roof: '#4d5852',
    containers: ['medcab', 'medcab', 'shelf', 'counter'], props: ['chair', 'plant'],
    names: ['Mira Pharmacy', 'Green Cross Pharmacy', 'Havenwood Drugs'],
  },
  diner: {
    w: 9, h: 7, wall: '#9a6b54', trim: '#714b3a', floor: 'tile', roof: '#5a3b2d',
    containers: ['fridge', 'counter', 'cabinet', 'pantry'], props: ['stove', 'table', 'chair', 'chair', 'table'],
    names: ['The Wagon Diner', "Rosie's Diner", 'Route 9 Diner'],
  },
  police: {
    w: 8, h: 7, wall: '#7c8890', trim: '#59636a', floor: 'tile', roof: '#414a50',
    containers: ['locker', 'locker', 'desk', 'crate'], props: ['table', 'chair', 'plant'],
    names: ['Havenwood Police Station', 'Mira County Sheriff'],
  },
  school: {
    w: 12, h: 9, wall: '#9a7e63', trim: '#705a45', floor: 'tile', roof: '#4b4235',
    containers: ['locker', 'locker', 'locker', 'desk', 'desk', 'pantry'], props: ['table', 'chair', 'chair', 'plant'],
    names: ['Havenwood High', 'Mira Elementary'],
  },
  hospital: {
    w: 12, h: 10, wall: '#a3ada6', trim: '#77817a', floor: 'tile', roof: '#4f5b55',
    containers: ['supply', 'supply', 'medcab', 'medcab', 'desk', 'cabinet'], props: ['bed', 'bed', 'table', 'plant'],
    names: ['Lake Mira Clinic', 'Havenwood Medical'],
  },
  warehouse: {
    w: 12, h: 9, wall: '#7f8078', trim: '#5d5e57', floor: 'concrete', roof: '#43443e',
    containers: ['crate', 'crate', 'crate', 'crate', 'workbench'], props: ['table', 'crate_prop'],
    names: ['Old Mill Warehouse', 'Havenwood Depot', 'Route 9 Storage'],
  },
  garage: {
    w: 7, h: 6, wall: '#7a7468', trim: '#59554c', floor: 'concrete', roof: '#41403a',
    containers: ['toolbox', 'workbench', 'crate'], props: ['table', 'crate_prop'],
    names: ['Rusty Wrench Garage', 'Mira Auto Repair'],
  },
  gas: {
    w: 8, h: 7, wall: '#9a9382', trim: '#6f6a5c', floor: 'tile', roof: '#575346',
    containers: ['shelf', 'counter', 'crate'], props: ['chair', 'plant'],
    names: ['Route 9 Fuel', 'Lake Mira Gas'],
  },
  farmhouse: {
    w: 7, h: 7, wall: '#a08668', trim: '#765f47', floor: 'wood', roof: '#51412f',
    containers: ['fridge', 'cabinet', 'pantry', 'wardrobe'], props: ['bed', 'table', 'chair', 'stove'],
    names: ['Cedar Farmhouse', 'Sunrise Farm', 'Old Field Farm', 'Mira Orchards'],
  },
};

export const STREET_NAMES = [
  'Ash Street', 'Cedar Avenue', 'Willow Lane', 'Foundry Road', 'Main Street',
  'Route 9', 'Cannery Row', 'Lake Road', 'Miller Street', 'Quarry Track',
];

export const ZONE_NAMES = {
  havenwood: 'Havenwood',
  north: 'Blackpine Forest',
  lake: 'Lake Mira',
  east: 'Foundry District',
  south: 'Old Fields',
  west: 'Cedar Farms',
};

// Utility: validate content references. Keeps additions from silently breaking.
export function validateContent() {
  const missing = new Set();
  const check = (id) => { if (!ITEMS[id] && !id.endsWith('_placeholder')) missing.add(id); };
  for (const t of Object.values(LOOT)) for (const e of t) check(e.id);
  for (const r of [...RECIPES, ...BUILD_RECIPES]) {
    if (r.out) check(r.out);
    for (const k of Object.keys(r.cost || {})) check(k);
  }
  for (const p of Object.values(PROFESSIONS)) for (const it of p.items) check(it.id);
  for (const b of Object.values(BUILDINGS)) for (const c of b.containers) {
    if (!CONTAINERS[c] && c !== 'freezer') missing.add('container:' + c);
  }
  return [...missing];
}
