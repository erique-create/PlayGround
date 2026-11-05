// Cinzas de Aurora — game data. All content is data-driven so it is easy to extend.

export const VERSION = 1;
export const SAVE_KEY = 'cinzas-de-aurora-save-v1';

export const PROFESSIONS = [
  {
    id: 'survivor', name: 'Sobrevivente', short: 'Equilíbrio', glyph: 'S',
    desc: 'Sem treino formal, mas aprendeu a se virar. Começa com uma mochila extra e um canivete.',
    skills: { carpentry: 1, cooking: 1, combat: 1 },
    items: { backpack_small: 1, knife: 1, water_bottle: 1, canned_food: 1, cloth: 2 },
    trait: '+12% de experiência geral'
  },
  {
    id: 'medic', name: 'Médica', short: 'Primeiros socorros', glyph: 'M',
    desc: 'Plantão no Hospital de Aurora. Sabe estancar um ferimento no escuro.',
    skills: { firstaid: 3, cooking: 1 },
    items: { medkit: 1, bandage: 2, painkillers: 1, water_bottle: 1 },
    trait: 'Cura 30% mais eficaz'
  },
  {
    id: 'mechanic', name: 'Mecânico', short: 'Veículos', glyph: 'K',
    desc: 'Passou anos embaixo de carros. Veículos gastam menos e duram mais.',
    skills: { mechanics: 3, carpentry: 1 },
    items: { wrench: 1, fuel: 2, scrap: 3, duct_tape: 1, water_bottle: 1 },
    trait: 'Consumo de combustível −20%'
  },
  {
    id: 'carpenter', name: 'Carpinteiro', short: 'Construção', glyph: 'C',
    desc: 'Sabe transformar madeira em abrigo. Barricadas mais resistentes.',
    skills: { carpentry: 3, combat: 1 },
    items: { hammer: 1, plank: 4, nail: 8, water_bottle: 1, canned_food: 1 },
    trait: 'Construções +25% resistentes'
  },
  {
    id: 'cook', name: 'Cozinheiro', short: 'Culinária', glyph: 'F',
    desc: 'Trabalhava no restaurante do centro. Comida rende mais e recupera mais.',
    skills: { cooking: 3, farming: 1 },
    items: { pot: 1, canned_food: 2, water_bottle: 2, matches: 1 },
    trait: 'Refeições recuperam +25%'
  },
  {
    id: 'farmer', name: 'Agricultor', short: 'Cultivo', glyph: 'A',
    desc: 'Conhece a terra e a chuva. Colheitas crescem mais rápido sob seus cuidados.',
    skills: { farming: 3, cooking: 1 },
    items: { seeds_carrot: 3, seeds_potato: 3, fertilizer: 1, water_bottle: 1, cloth: 2 },
    trait: 'Colheitas +20% mais rápidas'
  }
];

export const DIFFICULTIES = {
  calm: { id: 'calm', name: 'Sobrevivente', desc: 'Recursos fartos, poucos zumbis.', zombies: 0.65, loot: 1.35, drain: 0.8, timeScale: 0.9 },
  normal: { id: 'normal', name: 'Padrão', desc: 'A experiência pretendida.', zombies: 1, loot: 1, drain: 1, timeScale: 1 },
  nightmare: { id: 'nightmare', name: 'Pesadelo', desc: 'Noites longas. Pouca água. Muitos mortos.', zombies: 1.55, loot: 0.72, drain: 1.3, timeScale: 1.15 }
};

export const ITEMS = {
  // Food & drink
  canned_food: { name: 'Comida enlatada', cat: 'food', icon: 'can', weight: 0.45, hunger: 34, thirst: 4, desc: 'Feijão, salsicha ou algo pior. Não precisa de fogo.', color: '#b06a3e' },
  bread: { name: 'Pão amanhecido', cat: 'food', icon: 'bread', weight: 0.25, hunger: 18, desc: 'Duro, mas ainda comestível.', color: '#c49a5e' },
  chips: { name: 'Salgadinho', cat: 'food', icon: 'bag', weight: 0.15, hunger: 10, thirst: -4, desc: 'Salgado. Vai fazer você beber mais.', color: '#d3a23a' },
  apple: { name: 'Maçã', cat: 'food', icon: 'apple', weight: 0.2, hunger: 12, thirst: 4, desc: 'Fresca, por enquanto.', color: '#a83b31' },
  fish_raw: { name: 'Peixe cru', cat: 'food', icon: 'fish', weight: 0.5, hunger: 12, raw: true, desc: 'Precisa ser assado. Comer cru é um risco.', color: '#7899a8' },
  fish_cooked: { name: 'Peixe assado', cat: 'food', icon: 'fish', weight: 0.45, hunger: 40, health: 4, desc: 'Crocante por fora. Um banquete.', color: '#c98d58' },
  meal: { name: 'Refeição quente', cat: 'food', icon: 'pot', weight: 0.8, hunger: 58, thirst: 8, health: 6, desc: 'Cozinhada: muito melhor que qualquer enlatado.', color: '#ca7b42' },
  canned_open: { name: 'Lata vazia', cat: 'junk', icon: 'can', weight: 0.05, desc: 'Pode virar sucata.', color: '#8b8b86' },

  // Water
  water_bottle: { name: 'Água limpa', cat: 'drink', icon: 'bottle', weight: 0.55, thirst: 42, desc: 'Um litro de água tratada.', color: '#4c93b7', container: 'empty_bottle' },
  dirty_water: { name: 'Água suspeita', cat: 'drink', icon: 'bottle', weight: 0.55, thirst: 32, risk: 0.28, desc: 'Direto do rio. Pode adoecer se não for fervida.', color: '#6c8a72', container: 'empty_bottle' },
  empty_bottle: { name: 'Garrafa vazia', cat: 'junk', icon: 'bottle', weight: 0.1, desc: 'Pode ser reabastecida em uma pia ou coletor.', color: '#93a9b5' },

  // Medical
  bandage: { name: 'Bandagem', cat: 'medical', icon: 'bandage', weight: 0.08, heal: 8, stopBleed: true, desc: 'Estanca hemorragias e protege feridas.', color: '#e4dcc9' },
  medkit: { name: 'Kit médico', cat: 'medical', icon: 'medkit', weight: 0.55, heal: 42, stopBleed: true, desc: 'Tratamento completo para ferimentos sérios.', color: '#c94b3f' },
  painkillers: { name: 'Analgésico', cat: 'medical', icon: 'pills', weight: 0.05, pain: -25, desc: 'Reduz a dor e ajuda a ignorar o corpo.', color: '#d9c7da' },
  vitamins: { name: 'Vitaminas', cat: 'medical', icon: 'pills', weight: 0.06, health: 8, desc: 'Fortalecem a recuperação.', color: '#cfae4c' },
  cloth: { name: 'Tecido', cat: 'material', icon: 'cloth', weight: 0.1, desc: 'Serve para bandagens, fogo e consertos.', color: '#c6bda7' },

  // Weapons
  knife: { name: 'Canivete', cat: 'weapon', icon: 'knife', weight: 0.3, damage: 20, range: 1.35, speed: 0.52, durability: 65, desc: 'Rápido e silencioso. Alcance curto.', color: '#b9c2c8', weapon: true, crit: .18 },
  crowbar: { name: 'Pé de cabra', cat: 'weapon', icon: 'crowbar', weight: 1.3, damage: 30, range: 1.7, speed: 0.78, durability: 120, desc: 'Pesado, confiável, também serve para arrombar.', color: '#a44936', weapon: true, tool: true, pry: true },
  axe: { name: 'Machado', cat: 'weapon', icon: 'axe', weight: 2.1, damage: 45, range: 1.75, speed: 1.0, durability: 95, desc: 'Devastador, mas lento e cansativo.', color: '#b08052', weapon: true, tool: true, chop: true },
  bat: { name: 'Bastão de beisebol', cat: 'weapon', icon: 'bat', weight: 1.1, damage: 26, range: 1.85, speed: 0.7, durability: 80, desc: 'Bom alcance. Não faça barulho à toa.', color: '#bc8d55', weapon: true },
  spear: { name: 'Lança improvisada', cat: 'weapon', icon: 'spear', weight: 1.2, damage: 34, range: 2.15, speed: 0.88, durability: 45, desc: 'Mantém os mortos à distância.', color: '#c4a06e', weapon: true, craftable: true },
  hammer: { name: 'Martelo', cat: 'tool', icon: 'hammer', weight: 0.9, damage: 18, range: 1.3, speed: 0.6, durability: 140, desc: 'Essencial para construção.', color: '#9b7752', weapon: true, tool: true, build: true },
  wrench: { name: 'Chave inglesa', cat: 'tool', icon: 'wrench', weight: 0.7, damage: 17, range: 1.35, speed: 0.62, durability: 120, desc: 'Ferramenta de mecânica. Também quebra cabeças.', color: '#a9adb1', weapon: true, tool: true, repair: true },
  flashlight: { name: 'Lanterna', cat: 'tool', icon: 'flashlight', weight: 0.35, desc: 'Ilumina a noite. Consome bateria lentamente.', color: '#d7b24c', light: true },
  battery: { name: 'Bateria', cat: 'material', icon: 'battery', weight: 0.2, desc: 'Para a lanterna ou para um carro.', color: '#4f6e56' },

  // Materials
  plank: { name: 'Tábua de madeira', cat: 'material', icon: 'plank', weight: 0.7, desc: 'A base de toda barricada decente.', color: '#b08756' },
  nail: { name: 'Prego', cat: 'material', icon: 'nail', weight: 0.02, stack: 60, desc: 'Pequeno, essencial e fácil de perder.', color: '#9ca3a5' },
  scrap: { name: 'Sucata', cat: 'material', icon: 'scrap', weight: 0.35, desc: 'Metal retorcido. Serve para quase tudo.', color: '#8e8b82' },
  rope: { name: 'Corda', cat: 'material', icon: 'rope', weight: 0.25, desc: 'Amarra, prende e salva.', color: '#b39a69' },
  duct_tape: { name: 'Fita adesiva', cat: 'material', icon: 'tape', weight: 0.18, desc: 'Conserta o mundo, por um tempo.', color: '#8e8f92' },
  fuel: { name: 'Galão de combustível', cat: 'material', icon: 'fuel', weight: 2.2, fuel: 28, desc: 'Cheira a gasolina. Abastece veículos e geradores.', color: '#c34632' },
  matches: { name: 'Fósforos', cat: 'tool', icon: 'matches', weight: 0.05, desc: 'Acende fogueiras. Use com cuidado.', color: '#c98b45' },
  seeds_carrot: { name: 'Sementes de cenoura', cat: 'seed', icon: 'seed', weight: 0.03, stack: 20, crop: 'carrot', desc: 'Crescem rápido em solo úmido.', color: '#cf8f3d' },
  seeds_potato: { name: 'Sementes de batata', cat: 'seed', icon: 'seed', weight: 0.05, stack: 20, crop: 'potato', desc: 'Rendem bastante, mas demoram.', color: '#b8915d' },
  fertilizer: { name: 'Fertilizante', cat: 'material', icon: 'bag', weight: 1.1, desc: 'Acelera o crescimento de uma horta.', color: '#7b8b4b' },
  carrot: { name: 'Cenoura', cat: 'food', icon: 'carrot', weight: 0.15, hunger: 10, desc: 'Crocante. Cultivada por você.', color: '#d47b33' },
  potato: { name: 'Batata', cat: 'food', icon: 'potato', weight: 0.22, hunger: 14, raw: true, desc: 'Melhor assada. Crua, é dura.', color: '#b99762' },

  // Containers / clothing
  backpack_small: { name: 'Mochila escolar', cat: 'clothing', icon: 'bag', weight: 0.9, capacity: 7, desc: 'Aumenta a capacidade de carga em 7 kg.', color: '#4b6b78', equip: true },
  jacket: { name: 'Jaqueta de inverno', cat: 'clothing', icon: 'jacket', weight: 1.2, warmth: 18, desc: 'Protege do frio e da chuva.', color: '#465a53', equip: true },
  boots: { name: 'Botas de trabalho', cat: 'clothing', icon: 'boots', weight: 1.0, warmth: 6, desc: 'Pisam firme no cascalho e no vidro.', color: '#5b4636', equip: true },
  book_carpentry: { name: 'Revista de marcenaria', cat: 'book', icon: 'book', weight: 0.3, desc: 'Ensina técnicas avançadas de construção.', color: '#9a7846', read: true },
  map_item: { name: 'Mapa de Aurora', cat: 'book', icon: 'map', weight: 0.1, desc: 'Revela os pontos de interesse da cidade.', color: '#c9b98d', read: true }
};

export const ITEM_ORDER = Object.keys(ITEMS);

export const RECIPES = [
  {
    id: 'bandage', name: 'Bandagens', cat: 'Saúde', time: 2,
    requires: { cloth: 2 }, result: { bandage: 2 }, xp: 6, skill: 'firstaid', level: 0,
    desc: 'Corte o tecido em tiras limpas.'
  },
  {
    id: 'spear', name: 'Lança improvisada', cat: 'Armas', time: 4,
    requires: { plank: 1, knife: 1 }, tools: ['hammer'], result: { spear: 1 }, xp: 12, skill: 'carpentry', level: 1,
    desc: 'Amarre a lâmina na ponta da tábua. A faca é preservada.'
  },
  {
    id: 'bat_spiked', name: 'Bastão reforçado', cat: 'Armas', time: 5,
    requires: { bat: 1, nail: 6, duct_tape: 1 }, tools: ['hammer'], result: { bat: 1 }, xp: 14, skill: 'carpentry', level: 1,
    desc: 'Pregos transformam um bastão em uma arma séria.'
  },
  {
    id: 'torch', name: 'Tocha', cat: 'Sobrevivência', time: 3,
    requires: { plank: 1, cloth: 2, fuel: 1 }, result: { flashlight: 1 }, xp: 8, skill: 'survival', level: 0,
    desc: 'Luz portátil improvisada. Não é elegante, mas funciona.'
  },
  {
    id: 'boil_water', name: 'Ferver água', cat: 'Cozinha', time: 4, station: 'fire',
    requires: { dirty_water: 1 }, result: { water_bottle: 1 }, xp: 7, skill: 'cooking', level: 1,
    desc: 'Ferva água suspeita em uma fogueira para torná-la segura.'
  },
  {
    id: 'cook_fish', name: 'Assar peixe', cat: 'Cozinha', time: 5, station: 'fire',
    requires: { fish_raw: 1 }, result: { fish_cooked: 1 }, xp: 9, skill: 'cooking', level: 0,
    desc: 'Peixe fresco sobre brasas. Cuidado para não queimar.'
  },
  {
    id: 'cook_stew', name: 'Ensopado de sobrevivente', cat: 'Cozinha', time: 7, station: 'fire',
    requires: { canned_food: 1, water_bottle: 1, carrot: 1 }, result: { meal: 1 }, xp: 16, skill: 'cooking', level: 2,
    desc: 'Uma refeição quente de verdade. Recupera corpo e ânimo.'
  },
  {
    id: 'repair_weapon', name: 'Reparar arma', cat: 'Ferramentas', time: 3,
    requires: { scrap: 1, duct_tape: 1 }, tools: ['wrench'], xp: 8, skill: 'mechanics', level: 1,
    desc: 'Recupera parte da durabilidade da arma equipada.'
  }
];

export const BUILDABLES = [
  {
    id: 'barricade', name: 'Barricada', cat: 'Defesa', time: 2,
    requires: { plank: 3, nail: 6 }, tools: ['hammer'], skill: 'carpentry', level: 1,
    desc: 'Bloqueia uma passagem ou porta. Zumbis precisam quebrá-la.', solid: true
  },
  {
    id: 'campfire', name: 'Fogueira', cat: 'Sobrevivência', time: 2,
    requires: { plank: 4, cloth: 2, matches: 1 }, skill: 'survival', level: 0,
    desc: 'Permite cozinhar, ferver água e iluminar a noite.', solid: true
  },
  {
    id: 'farmplot', name: 'Horta', cat: 'Agricultura', time: 3,
    requires: { plank: 3, rope: 1 }, skill: 'farming', level: 0,
    desc: 'Plante sementes. A chuva ajuda, mas você deve regar.', solid: false
  },
  {
    id: 'crate', name: 'Caixa de armazenamento', cat: 'Defesa', time: 2,
    requires: { plank: 4, nail: 4 }, tools: ['hammer'], skill: 'carpentry', level: 1,
    desc: 'Guarda itens em um recipiente no mundo.', solid: true
  },
  {
    id: 'raincollector', name: 'Coletor de chuva', cat: 'Sobrevivência', time: 3,
    requires: { plank: 4, scrap: 2, cloth: 1 }, skill: 'carpentry', level: 2,
    desc: 'Acumula água potável quando chove.', solid: true
  }
];

export const LOOT_TABLES = {
  house_kitchen: [
    ['canned_food', 3, .45], ['water_bottle', 2, .4], ['bread', 2, .25], ['chips', 2, .22],
    ['apple', 2, .18], ['pot', 1, .12], ['matches', 1, .12], ['cloth', 3, .25], ['empty_bottle', 2, .18]
  ],
  house_bedroom: [
    ['cloth', 3, .35], ['bandage', 2, .22], ['book_carpentry', 1, .1], ['backpack_small', 1, .08],
    ['jacket', 1, .12], ['boots', 1, .1], ['painkillers', 1, .12], ['battery', 1, .1]
  ],
  house_bathroom: [
    ['bandage', 2, .3], ['painkillers', 1, .18], ['vitamins', 1, .12], ['water_bottle', 2, .3], ['cloth', 2, .2]
  ],
  store_food: [
    ['canned_food', 4, .62], ['water_bottle', 3, .56], ['bread', 3, .35], ['chips', 4, .42],
    ['apple', 3, .28], ['matches', 2, .2], ['pot', 1, .12], ['fertilizer', 1, .08]
  ],
  pharmacy: [
    ['bandage', 3, .55], ['medkit', 1, .28], ['painkillers', 2, .45], ['vitamins', 2, .32],
    ['water_bottle', 2, .25], ['cloth', 2, .2]
  ],
  hardware: [
    ['plank', 4, .55], ['nail', 14, .5], ['hammer', 1, .18], ['crowbar', 1, .16], ['axe', 1, .1],
    ['rope', 2, .25], ['duct_tape', 2, .3], ['scrap', 3, .4], ['fuel', 1, .16], ['seeds_potato', 2, .1]
  ],
  police: [
    ['bat', 1, .35], ['flashlight', 1, .3], ['bandage', 2, .4], ['medkit', 1, .15],
    ['boots', 1, .18], ['jacket', 1, .2], ['battery', 2, .3], ['map_item', 1, .12], ['duct_tape', 2, .2]
  ],
  industrial: [
    ['scrap', 4, .55], ['plank', 4, .45], ['fuel', 2, .35], ['wrench', 1, .18], ['nail', 12, .3],
    ['rope', 2, .2], ['duct_tape', 2, .25], ['battery', 2, .25], ['hammer', 1, .12], ['crowbar', 1, .12]
  ],
  restaurant: [
    ['canned_food', 3, .45], ['water_bottle', 2, .35], ['knife', 1, .22], ['pot', 1, .25],
    ['bread', 2, .25], ['matches', 1, .2], ['carrot', 3, .2], ['potato', 2, .18]
  ],
  clinic: [
    ['medkit', 2, .45], ['bandage', 4, .6], ['painkillers', 2, .35], ['vitamins', 2, .3],
    ['water_bottle', 2, .3], ['cloth', 2, .22], ['book_carpentry', 1, .05]
  ],
  gas: [
    ['fuel', 2, .55], ['chips', 2, .4], ['water_bottle', 2, .38], ['matches', 1, .2],
    ['battery', 1, .15], ['map_item', 1, .1], ['duct_tape', 1, .18]
  ],
  barn: [
    ['plank', 4, .5], ['rope', 2, .35], ['seeds_carrot', 3, .3], ['seeds_potato', 3, .3],
    ['fertilizer', 2, .25], ['scrap', 3, .3], ['hammer', 1, .1]
  ],
  vehicle: [
    ['fuel', 1, .35], ['duct_tape', 1, .2], ['scrap', 2, .3], ['water_bottle', 1, .2], ['chips', 1, .2], ['bandage', 1, .15]
  ],
  crate: [
    ['plank', 3, .45], ['nail', 10, .4], ['scrap', 2, .35], ['cloth', 2, .25], ['canned_food', 2, .25]
  ]
};

export const CROPS = {
  carrot: { name: 'Cenoura', seed: 'seeds_carrot', growHours: 8, yield: 3, item: 'carrot' },
  potato: { name: 'Batata', seed: 'seeds_potato', growHours: 12, yield: 4, item: 'potato' }
};

export const SKILLS = {
  carpentry: { name: 'Carpintaria', glyph: '⌂', desc: 'Construções, barricadas e armas de madeira.' },
  cooking: { name: 'Culinária', glyph: '◒', desc: 'Refeições melhores e água segura.' },
  firstaid: { name: 'Primeiros socorros', glyph: '✚', desc: 'Cura ferimentos e reduz o risco de infecção.' },
  mechanics: { name: 'Mecânica', glyph: '⚙', desc: 'Conserta veículos e ferramentas.' },
  farming: { name: 'Agricultura', glyph: '❧', desc: 'Plantio, irrigação e colheita.' },
  fishing: { name: 'Pesca', glyph: '≈', desc: 'Pesca em rios e lagos.' },
  combat: { name: 'Combate', glyph: '⚔', desc: 'Golpes mais fortes e maior alcance.' },
  survival: { name: 'Sobrevivência', glyph: '◇', desc: 'Fogueiras, tochas e instinto.' },
  stealth: { name: 'Furtividade', glyph: '◐', desc: 'Move-se sem chamar os mortos.' }
};

// Stat thresholds used by the UI.
export const SKILL_LEVEL_XP = [0, 35, 90, 170, 280, 420, 600, 820, 1100, 1450];

export function xpForLevel(level) {
  return SKILL_LEVEL_XP[Math.min(level, SKILL_LEVEL_XP.length - 1)] || 0;
}

export function rollLoot(tableId, rng, multiplier = 1) {
  const table = LOOT_TABLES[tableId] || LOOT_TABLES.crate;
  const out = [];
  for (const [id, max, chance] of table) {
    if (rng() > chance * multiplier) continue;
    let qty = 1 + Math.floor(rng() * max);
    if (id === 'nail') qty = Math.max(4, Math.round(qty * 1.5));
    if (ITEMS[id]?.stack && qty > ITEMS[id].stack) qty = ITEMS[id].stack;
    const entry = { id, qty };
    if (ITEMS[id]?.durability) entry.durability = Math.round(ITEMS[id].durability * (0.45 + rng() * 0.55));
    out.push(entry);
  }
  return out;
}
