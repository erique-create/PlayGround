// Catálogo de itens, construções, habilidades e conteúdo do jogo

export const ITEMS = {
  // ---------- Água e bebidas ----------
  agua: { name: 'Água mineral', icon: '💧', type: 'drink', weight: 0.65, stack: 5, value: 8, hunger: 0, thirst: 42, desc: 'Água limpa. Mata a sede sem riscos.' },
  agua_suja: { name: 'Água duvidosa', icon: '🫗', type: 'drink', weight: 0.65, stack: 5, value: 2, thirst: 28, sickChance: 0.38, desc: 'Pode estar contaminada. Ferver tornaria segura.' },
  refrigerante: { name: 'Refrigerante', icon: '🥤', type: 'drink', weight: 0.45, stack: 5, value: 5, thirst: 24, hunger: 3, desc: 'Açúcar e cafeína. Ainda com gás.' },
  suco: { name: 'Suco de caixinha', icon: '🧃', type: 'drink', weight: 0.4, stack: 5, value: 5, thirst: 28, desc: 'Um pouco de vitamina em meio ao caos.' },
  cafe: { name: 'Café enlatado', icon: '☕', type: 'drink', weight: 0.3, stack: 5, value: 7, thirst: 12, fatigue: -22, desc: 'Afasta o sono por um tempo.' },
  energetico: { name: 'Energético', icon: '🥫', type: 'drink', weight: 0.35, stack: 5, value: 6, thirst: 14, fatigue: -34, health: -2, desc: 'Funciona. O corpo cobrará depois.' },

  // ---------- Comida ----------
  enlatado: { name: 'Comida enlatada', icon: '🥫', type: 'food', weight: 0.5, stack: 5, value: 12, hunger: 38, desc: 'Feijão com salsicha. Validade suspeita, sabor pior ainda.' },
  atum: { name: 'Atum enlatado', icon: '🐟', type: 'food', weight: 0.35, stack: 5, value: 10, hunger: 26, thirst: 4, desc: 'Proteína barata. Não precisa de fogo.' },
  macarrao: { name: 'Macarrão instantâneo', icon: '🍜', type: 'food', weight: 0.15, stack: 5, value: 6, hunger: 12, cooked: 'macarrao_cozido', desc: 'Cru é ruim. Cozinhe para aproveitar melhor.' },
  macarrao_cozido: { name: 'Macarrão cozido', icon: '🍲', type: 'food', weight: 0.4, stack: 3, value: 12, hunger: 40, desc: 'Quente, salgado e reconfortante.' },
  barra: { name: 'Barra de cereal', icon: '🍫', type: 'food', weight: 0.09, stack: 6, value: 5, hunger: 14, desc: 'Leve e prática. Ideal para uma mochila apertada.' },
  biscoito: { name: 'Pacote de biscoitos', icon: '🍪', type: 'food', weight: 0.2, stack: 4, value: 4, hunger: 18, desc: 'Açúcar e farinha. Não substitui uma refeição.' },
  chocolate: { name: 'Chocolate', icon: '🍫', type: 'food', weight: 0.12, stack: 4, value: 7, hunger: 10, morale: 8, desc: 'Pequeno luxo que faz o dia parecer menos sombrio.' },
  maca: { name: 'Maçã', icon: '🍎', type: 'food', weight: 0.2, stack: 4, value: 4, hunger: 12, thirst: 7, desc: 'Fresca. Por enquanto.' },
  cenoura: { name: 'Cenoura', icon: '🥕', type: 'food', weight: 0.15, stack: 4, value: 3, hunger: 9, thirst: 4, desc: 'Crocante, cheia de terra.' },
  batata: { name: 'Batata', icon: '🥔', type: 'food', weight: 0.25, stack: 4, value: 3, hunger: 10, cooked: 'batata_assada', desc: 'Pode ser assada numa fogueira.' },
  batata_assada: { name: 'Batata assada', icon: '🍠', type: 'food', weight: 0.25, stack: 4, value: 6, hunger: 24, desc: 'Simples e quente.' },
  milho: { name: 'Espiga de milho', icon: '🌽', type: 'food', weight: 0.3, stack: 4, value: 4, hunger: 14, cooked: 'milho_cozido', desc: 'Melhor cozido.' },
  milho_cozido: { name: 'Milho cozido', icon: '🌽', type: 'food', weight: 0.3, stack: 4, value: 6, hunger: 24, desc: 'Doce e quente.' },
  pao: { name: 'Pão velho', icon: '🍞', type: 'food', weight: 0.3, stack: 3, value: 3, hunger: 16, sickChance: 0.05, desc: 'Duro, mas ainda comestível.' },
  carne_crua: { name: 'Carne crua', icon: '🥩', type: 'food', weight: 0.7, stack: 3, value: 4, hunger: 18, sickChance: 0.32, cooked: 'carne_assada', desc: 'Crua é arriscado. Cozinhe antes.' },
  carne_assada: { name: 'Carne assada', icon: '🍖', type: 'food', weight: 0.6, stack: 3, value: 14, hunger: 46, desc: 'Cheiro de comida de verdade.' },
  peixe: { name: 'Peixe', icon: '🐟', type: 'food', weight: 0.5, stack: 3, value: 4, hunger: 16, sickChance: 0.25, cooked: 'peixe_assado', desc: 'Pescado no lago. Cozinhe.' },
  peixe_assado: { name: 'Peixe assado', icon: '🍣', type: 'food', weight: 0.45, stack: 3, value: 12, hunger: 36, desc: 'Bem passado.' },
  estragada: { name: 'Comida estragada', icon: '🤢', type: 'food', weight: 0.4, stack: 1, value: 1, hunger: 12, sickChance: 0.65, desc: 'Só um faminto muito desesperado comeria isso.' },
  racao: { name: 'Ração militar', icon: '🪖', type: 'food', weight: 0.4, stack: 2, value: 20, hunger: 55, thirst: 5, desc: 'Densa, sem graça e altamente nutritiva.' },

  // ---------- Medicina ----------
  bandagem: { name: 'Bandagem', icon: '🩹', type: 'med', weight: 0.15, stack: 6, value: 10, bleed: -1, heal: 10, desc: 'Estanca hemorragias e cobre ferimentos.' },
  kit_medico: { name: 'Kit de primeiros socorros', icon: '💉', type: 'med', weight: 0.55, stack: 2, value: 35, bleed: -1, heal: 38, desc: 'Sutura, limpa e fecha ferimentos graves.' },
  alcool: { name: 'Álcool 70%', icon: '🧴', type: 'med', weight: 0.3, stack: 3, value: 9, infection: -8, heal: 2, desc: 'Desinfeta feridas. Arde como o inferno.' },
  antibiotico: { name: 'Antibiótico', icon: '💊', type: 'med', weight: 0.06, stack: 6, value: 28, infection: -35, fever: -1, desc: 'A única defesa real contra a infecção.' },
  analgesico: { name: 'Analgésico', icon: '💊', type: 'med', weight: 0.05, stack: 6, value: 6, heal: 5, fatigue: -6, desc: 'Alivia a dor e a febre por algumas horas.' },
  bandagem_suja: { name: 'Bandagem suja', icon: '🧻', type: 'med', weight: 0.15, stack: 2, value: 1, bleed: -1, infection: 4, desc: 'Usada, mas melhor que sangrar até a morte.' },
  cigarro: { name: 'Cigarro', icon: '🚬', type: 'misc', weight: 0.02, stack: 5, value: 4, morale: 10, health: -1, desc: 'Um vício que acalma os nervos.' },

  // ---------- Armas corpo a corpo ----------
  faca: { name: 'Faca de cozinha', icon: '🔪', type: 'weapon', weight: 0.4, stack: 1, value: 12, damage: 18, range: 36, cooldown: 0.42, noise: 40, durability: 90, arc: 1.5, desc: 'Silenciosa e letal de perto. Frágil contra grupos.' },
  bastao: { name: 'Bastão de madeira', icon: '🪵', type: 'weapon', weight: 1.0, stack: 1, value: 8, damage: 14, range: 42, cooldown: 0.5, noise: 70, durability: 130, arc: 1.9, desc: 'Melhor que os punhos, mas não muito.' },
  cano: { name: 'Cano de ferro', icon: '🔩', type: 'weapon', weight: 2.0, stack: 1, value: 15, damage: 23, range: 46, cooldown: 0.72, noise: 95, durability: 170, arc: 1.8, desc: 'Pesado e confiável. Atordoa zumbis.' },
  taco: { name: 'Taco de beisebol', icon: '🏏', type: 'weapon', weight: 0.9, stack: 1, value: 14, damage: 20, range: 48, cooldown: 0.58, noise: 80, durability: 150, arc: 2.0, desc: 'Alcance decente. Cuidado com o barulho.' },
  machado: { name: 'Machado', icon: '🪓', type: 'weapon', weight: 2.3, stack: 1, value: 26, damage: 34, range: 44, cooldown: 0.9, noise: 120, durability: 160, arc: 1.7, desc: 'Ferramenta e arma. Abre crânios e portas.' },
  pe_de_cabra: { name: 'Pé de cabra', icon: '🪛', type: 'weapon', weight: 2.1, stack: 1, value: 18, damage: 24, range: 44, cooldown: 0.7, noise: 110, durability: 220, arc: 1.6, desc: 'Serve para arrombar portas e esmagar ameaças.' },
  machete: { name: 'Machete', icon: '🗡️', type: 'weapon', weight: 1.1, stack: 1, value: 32, damage: 28, range: 42, cooldown: 0.5, noise: 55, durability: 130, arc: 1.8, desc: 'Corta mato, carne e o que aparecer.' },
  martelo: { name: 'Martelo', icon: '🔨', type: 'tool', weapon: true, weight: 0.8, stack: 1, value: 12, damage: 12, range: 36, cooldown: 0.55, noise: 90, durability: 200, arc: 1.4, desc: 'Ferramenta de construção. Também quebra dentes.' },

  // ---------- Armas de fogo ----------
  pistola: { name: 'Pistola .380', icon: '🔫', type: 'weapon', weight: 0.9, stack: 1, value: 60, damage: 38, range: 460, cooldown: 0.32, noise: 950, durability: 400, gun: true, ammo: 'municao_pistola', accuracy: 0.92, desc: 'Barulhenta. Cada tiro é um convite para a horda.' },
  espingarda: { name: 'Espingarda', icon: '🔫', type: 'weapon', weight: 3.2, stack: 1, value: 90, damage: 78, range: 330, cooldown: 0.95, noise: 1100, durability: 380, gun: true, ammo: 'municao_espingarda', pellets: 6, spread: 0.22, desc: 'Devastadora de perto. O estrondo atravessa quarteirões.' },
  rifle: { name: 'Rifle de caça', icon: '🎯', type: 'weapon', weight: 3.6, stack: 1, value: 120, damage: 62, range: 680, cooldown: 0.7, noise: 1200, durability: 420, gun: true, ammo: 'municao_rifle', accuracy: 0.97, desc: 'Alcance longo e precisão. Não serve para multidões.' },
  municao_pistola: { name: 'Munição .380', icon: '🔸', type: 'ammo', weight: 0.015, stack: 40, value: 3, desc: 'Doze cartuchos por caixa.' },
  municao_espingarda: { name: 'Cartuchos 12', icon: '🔸', type: 'ammo', weight: 0.03, stack: 24, value: 5, desc: 'Pesados e barulhentos.' },
  municao_rifle: { name: 'Munição .308', icon: '🔸', type: 'ammo', weight: 0.025, stack: 20, value: 6, desc: 'Para o rifle de caça.' },

  // ---------- Materiais ----------
  madeira: { name: 'Madeira', icon: '🪵', type: 'material', weight: 1.1, stack: 12, value: 4, desc: 'Tábuas e galhos. A base de quase toda construção.' },
  metal: { name: 'Sucata de metal', icon: '⚙️', type: 'material', weight: 1.6, stack: 10, value: 6, desc: 'Chapas e barras enferrujadas. Reforça abrigos.' },
  pregos: { name: 'Pregos', icon: '📌', type: 'material', weight: 0.05, stack: 30, value: 2, desc: 'Pequenos, essenciais e fáceis de perder.' },
  corda: { name: 'Corda', icon: '🧵', type: 'material', weight: 0.4, stack: 5, value: 5, desc: 'Amarra, prende e às vezes salva vidas.' },
  lona: { name: 'Lona impermeável', icon: '🟫', type: 'material', weight: 0.8, stack: 4, value: 8, desc: 'Cobre telhados, barris e corpos.' },
  pedra: { name: 'Pedra', icon: '🪨', type: 'material', weight: 2.2, stack: 8, value: 1, desc: 'Pesada. Boa para fogueiras e barricadas.' },
  pecas: { name: 'Peças de motor', icon: '🔧', type: 'material', weight: 1.9, stack: 5, value: 14, desc: 'Necessárias para consertar veículos.' },
  combustivel: { name: 'Galão de combustível', icon: '⛽', type: 'material', weight: 2.4, stack: 3, value: 20, fuel: 32, desc: 'Gasolina envelhecida. Ainda queima.' },
  isqueiro: { name: 'Isqueiro', icon: '🔥', type: 'tool', weight: 0.05, stack: 2, value: 6, desc: 'Acende fogueiras e ilumina por alguns segundos.' },
  pilha: { name: 'Pilha', icon: '🔋', type: 'material', weight: 0.04, stack: 6, value: 4, desc: 'Alimenta lanterna e rádio.' },
  lanterna: { name: 'Lanterna', icon: '🔦', type: 'tool', weight: 0.25, stack: 1, value: 15, desc: 'Corta a escuridão. Também denuncia sua posição.' },
  semente_milho: { name: 'Sementes de milho', icon: '🌱', type: 'seed', weight: 0.02, stack: 8, value: 5, crop: 'milho', desc: 'Plante em um canteiro e espere.' },
  semente_batata: { name: 'Sementes de batata', icon: '🌱', type: 'seed', weight: 0.02, stack: 8, value: 5, crop: 'batata', desc: 'Renderá batatas em poucos dias.' },
  semente_abobora: { name: 'Sementes de abóbora', icon: '🌱', type: 'seed', weight: 0.02, stack: 8, value: 4, crop: 'abobora', desc: 'Cresce devagar, mas rende bastante.' },
  fertilizante: { name: 'Fertilizante', icon: '💩', type: 'material', weight: 0.9, stack: 4, value: 5, desc: 'Acelera o crescimento das plantações.' },
  abobora: { name: 'Abóbora', icon: '🎃', type: 'food', weight: 0.8, stack: 2, value: 6, hunger: 24, desc: 'Grande, pesada e cheia de sementes.' },

  // ---------- Roupas e equipamentos ----------
  mochila_pequena: { name: 'Mochila pequena', icon: '🎒', type: 'backpack', weight: 0.8, stack: 1, value: 16, capacity: 8, desc: 'Aumenta a capacidade de carga em 8 kg.' },
  mochila_grande: { name: 'Mochila de trilha', icon: '🎒', type: 'backpack', weight: 1.4, stack: 1, value: 34, capacity: 16, desc: 'Aumenta a capacidade de carga em 16 kg.' },
  casaco: { name: 'Casaco de inverno', icon: '🧥', type: 'clothing', weight: 1.5, stack: 1, value: 18, insulation: 7, desc: 'Protege do frio. Pesado e incômodo no calor.' },
  capa_chuva: { name: 'Capa de chuva', icon: '🧥', type: 'clothing', weight: 0.7, stack: 1, value: 12, insulation: 2, rainproof: true, desc: 'Mantém o corpo seco durante tempestades.' },
  botas: { name: 'Botas de trabalho', icon: '🥾', type: 'clothing', weight: 1.2, stack: 1, value: 14, insulation: 2, armor: 1, desc: 'Protegem os pés de vidro e entulho.' },
  luvas: { name: 'Luvas de couro', icon: '🧤', type: 'clothing', weight: 0.3, stack: 1, value: 8, insulation: 1, armor: 1, desc: 'Evitam cortes ao revirar escombros.' },
  colete: { name: 'Colete tático', icon: '🦺', type: 'clothing', weight: 2.8, stack: 1, value: 42, armor: 5, desc: 'Reduz o dano de mordidas e golpes.' },
  capacete: { name: 'Capacete militar', icon: '⛑️', type: 'clothing', weight: 1.4, stack: 1, value: 28, armor: 3, desc: 'Protege a cabeça. Não protege o resto.' },

  // ---------- Diversos ----------
  relogio: { name: 'Relógio de pulso', icon: '⌚', type: 'valuable', weight: 0.1, stack: 1, value: 14, desc: 'Ainda funciona. Útil para negociar.' },
  joias: { name: 'Joias', icon: '💍', type: 'valuable', weight: 0.05, stack: 3, value: 30, desc: 'Brilho inútil num mundo sem compradores. Mas há quem troque.' },
  radio: { name: 'Rádio portátil', icon: '📻', type: 'tool', weight: 0.8, stack: 1, value: 22, desc: 'Capta transmissões militares e avisos de horda.' },
  foto: { name: 'Foto de família', icon: '🖼️', type: 'misc', weight: 0.02, stack: 1, value: 0, morale: 5, desc: 'Alguém que você não quer esquecer.' },
  panela: { name: 'Panela', icon: '🍳', type: 'tool', weight: 1.1, stack: 1, value: 12, desc: 'Permite cozinhar em fogueiras com mais eficiência.' },
  chave_inglesa: { name: 'Chave inglesa', icon: '🔧', type: 'tool', weight: 0.9, stack: 1, value: 15, weapon: true, damage: 11, range: 36, cooldown: 0.6, noise: 90, durability: 260, arc: 1.3, desc: 'Conserta veículos. Também amassa narizes.' },
  detergente: { name: 'Detergente', icon: '🧼', type: 'hygiene', weight: 0.5, stack: 3, value: 4, hygiene: 35, desc: 'Limpeza básica. Reduz risco de doenças.' },
  sabonete: { name: 'Sabonete', icon: '🧼', type: 'hygiene', weight: 0.1, stack: 4, value: 3, hygiene: 25, desc: 'Pequeno, mas faz diferença.' },
  papel: { name: 'Papel higiênico', icon: '🧻', type: 'hygiene', weight: 0.2, stack: 3, value: 3, hygiene: 10, desc: 'Um dos bens mais valiosos do apocalipse.' },
  mapa: { name: 'Mapa da região', icon: '🗺️', type: 'misc', weight: 0.1, stack: 1, value: 10, desc: 'Marca pontos de interesse. Aperte M para abrir o mapa.' },
};

// Tabelas de saque. each: [id, chance, min, max]
export const LOOT_TABLES = {
  cozinha: [
    ['agua', 0.55, 1, 3], ['enlatado', 0.45, 1, 2], ['atum', 0.3, 1, 2], ['barra', 0.35, 1, 2],
    ['biscoito', 0.3, 1, 1], ['maca', 0.2, 1, 2], ['batata', 0.2, 1, 2], ['pao', 0.15, 1, 1],
    ['macarrao', 0.25, 1, 2], ['panela', 0.1, 1, 1], ['cafe', 0.12, 1, 1], ['suco', 0.2, 1, 1],
  ],
  geladeira: [
    ['agua', 0.4, 1, 2], ['refrigerante', 0.3, 1, 2], ['suco', 0.25, 1, 1], ['carne_crua', 0.2, 1, 1],
    ['peixe', 0.15, 1, 1], ['maca', 0.15, 1, 2], ['estragada', 0.25, 1, 1], ['leite', 0.1, 1, 1],
  ],
  armario: [
    ['bandagem', 0.3, 1, 2], ['analgesico', 0.25, 1, 2], ['sabonete', 0.25, 1, 1], ['casaco', 0.15, 1, 1],
    ['luvas', 0.15, 1, 1], ['botas', 0.12, 1, 1], ['mochila_pequena', 0.12, 1, 1], ['detergente', 0.2, 1, 1],
    ['isqueiro', 0.2, 1, 1], ['pilha', 0.2, 1, 2], ['foto', 0.1, 1, 1], ['cigarro', 0.1, 1, 2],
  ],
  farmacia: [
    ['bandagem', 0.65, 1, 3], ['kit_medico', 0.2, 1, 1], ['antibiotico', 0.35, 1, 2], ['analgesico', 0.45, 1, 3],
    ['alcool', 0.3, 1, 2], ['sabonete', 0.2, 1, 1], ['agua', 0.2, 1, 1],
  ],
  mercado: [
    ['agua', 0.6, 1, 3], ['enlatado', 0.55, 1, 3], ['atum', 0.4, 1, 2], ['barra', 0.45, 1, 3],
    ['biscoito', 0.4, 1, 2], ['refrigerante', 0.35, 1, 2], ['macarrao', 0.35, 1, 2], ['detergente', 0.3, 1, 2],
    ['papel', 0.25, 1, 2], ['chocolate', 0.25, 1, 2], ['pilha', 0.3, 1, 3], ['isqueiro', 0.25, 1, 1],
    ['corda', 0.2, 1, 1], ['semente_milho', 0.2, 1, 3],
  ],
  escola: [
    ['mochila_pequena', 0.3, 1, 1], ['barra', 0.35, 1, 2], ['agua', 0.3, 1, 2], ['papel', 0.3, 1, 1],
    ['analgesico', 0.2, 1, 2], ['lanterna', 0.15, 1, 1], ['pilha', 0.25, 1, 2], ['mapa', 0.15, 1, 1],
    ['faca', 0.1, 1, 1], ['radio', 0.1, 1, 1], ['foto', 0.15, 1, 1],
  ],
  policia: [
    ['pistola', 0.3, 1, 1], ['municao_pistola', 0.5, 6, 18], ['colete', 0.25, 1, 1], ['capacete', 0.25, 1, 1],
    ['kit_medico', 0.2, 1, 1], ['lanterna', 0.3, 1, 1], ['bastao', 0.35, 1, 1], ['radio', 0.25, 1, 1],
    ['algemas', 0.1, 1, 1], ['corda', 0.2, 1, 1], ['racao', 0.1, 1, 1],
  ],
  quartel: [
    ['rifle', 0.22, 1, 1], ['municao_rifle', 0.45, 6, 18], ['pistola', 0.3, 1, 1], ['municao_pistola', 0.45, 8, 24],
    ['colete', 0.35, 1, 1], ['capacete', 0.35, 1, 1], ['racao', 0.4, 1, 2], ['kit_medico', 0.3, 1, 1],
    ['mochila_grande', 0.25, 1, 1], ['lanterna', 0.3, 1, 1], ['combustivel', 0.15, 1, 1],
  ],
  oficina: [
    ['chave_inglesa', 0.4, 1, 1], ['pecas', 0.5, 1, 2], ['combustivel', 0.3, 1, 1], ['martelo', 0.3, 1, 1],
    ['metal', 0.4, 1, 3], ['pregos', 0.35, 4, 10], ['corda', 0.2, 1, 1], ['isqueiro', 0.2, 1, 1],
    ['cano', 0.2, 1, 1], ['machete', 0.15, 1, 1], ['pilha', 0.25, 1, 2],
  ],
  ferramentas: [
    ['madeira', 0.5, 2, 5], ['metal', 0.4, 1, 3], ['pregos', 0.4, 4, 12], ['martelo', 0.35, 1, 1],
    ['machado', 0.2, 1, 1], ['pe_de_cabra', 0.2, 1, 1], ['corda', 0.3, 1, 2], ['lona', 0.25, 1, 1],
    ['pedra', 0.2, 1, 3], ['chave_inglesa', 0.2, 1, 1], ['faca', 0.2, 1, 1],
  ],
  armario_militar: [
    ['rifle', 0.18, 1, 1], ['municao_rifle', 0.4, 5, 14], ['colete', 0.35, 1, 1], ['capacete', 0.35, 1, 1],
    ['racao', 0.45, 1, 2], ['kit_medico', 0.25, 1, 1], ['mochila_grande', 0.2, 1, 1],
  ],
  porta_malas: [
    ['corda', 0.3, 1, 1], ['chave_inglesa', 0.3, 1, 1], ['pecas', 0.2, 1, 1], ['combustivel', 0.15, 1, 1],
    ['lanterna', 0.2, 1, 1], ['mapa', 0.15, 1, 1], ['agua', 0.3, 1, 2], ['barra', 0.25, 1, 2],
    ['mochila_pequena', 0.15, 1, 1], ['pistola', 0.06, 1, 1],
  ],
  fazenda: [
    ['semente_milho', 0.5, 2, 5], ['semente_batata', 0.5, 2, 5], ['semente_abobora', 0.35, 1, 3],
    ['fertilizante', 0.3, 1, 2], ['enlatado', 0.3, 1, 2], ['corda', 0.35, 1, 2], ['madeira', 0.4, 2, 5],
    ['milho', 0.3, 1, 3], ['batata', 0.3, 1, 3], ['panela', 0.15, 1, 1], ['machado', 0.15, 1, 1],
  ],
  caverna: [
    ['metal', 0.4, 1, 3], ['pilha', 0.2, 1, 2], ['lanterna', 0.2, 1, 1], ['joias', 0.08, 1, 1],
    ['isqueiro', 0.2, 1, 1], ['faca', 0.15, 1, 1],
  ],
  caixa_suprimentos: [
    ['racao', 0.7, 1, 3], ['agua', 0.7, 2, 4], ['kit_medico', 0.5, 1, 2], ['antibiotico', 0.4, 1, 3],
    ['municao_pistola', 0.5, 8, 20], ['municao_espingarda', 0.35, 4, 12], ['colete', 0.3, 1, 1],
    ['combustivel', 0.3, 1, 1], ['chocolate', 0.3, 1, 2], ['radio', 0.25, 1, 1],
  ],
};

ITEMS.leite = { name: 'Leite longa vida', icon: '🥛', type: 'drink', weight: 1.0, stack: 2, value: 5, thirst: 26, hunger: 8, desc: 'Pode estar talhado, mas ainda desce.' };
ITEMS.algemas = { name: 'Algemas', icon: '⛓️', type: 'misc', weight: 0.5, stack: 2, value: 8, desc: 'Sem utilidade clara. Talvez para prender alguém.' };

export const BUILDINGS = {
  casa: {
    label: ['Casa', 'Residência', 'Sobrado', 'Casa dos fundos'],
    floor: 7, wall: 9, size: [9, 8], weight: 30,
    containers: [['geladeira', 1], ['cozinha', 1], ['armario', 1], ['caixa', 0.7]],
    beds: 1, partitions: 1, loot: 1,
  },
  apartamento: {
    label: ['Apartamentos', 'Edifício Aurora', 'Bloco residencial', 'Prédio São Jorge'],
    floor: 8, wall: 9, size: [13, 10], weight: 12,
    containers: [['geladeira', 2], ['cozinha', 2], ['armario', 2], ['caixa', 1]],
    beds: 3, partitions: 2, loot: 1.2,
  },
  mercado: {
    label: ['Mercado', 'Mercado Bom Preço', 'Supermercado', 'Armazém Central', 'Mercearia'],
    floor: 8, wall: 9, size: [13, 10], weight: 8,
    containers: [['mercado', 3], ['geladeira', 1], ['caixa', 1]], beds: 0, partitions: 1, loot: 1.7,
  },
  hospital: {
    label: ['Hospital', 'Hospital São Rafael', 'Clínica Central', 'Posto de saúde'],
    floor: 8, wall: 9, size: [15, 12], weight: 4,
    containers: [['farmacia', 3], ['armario', 2], ['geladeira', 1]], beds: 4, partitions: 2, loot: 1.6,
  },
  escola: {
    label: ['Escola', 'Escola Municipal', 'Colégio Estadual', 'Creche'],
    floor: 7, wall: 9, size: [14, 11], weight: 5,
    containers: [['escola', 3], ['caixa', 1], ['armario', 1]], beds: 0, partitions: 2, loot: 1.2,
  },
  delegacia: {
    label: ['Delegacia', 'Delegacia Central', 'Posto policial', 'Departamento de Polícia'],
    floor: 8, wall: 9, size: [12, 10], weight: 3,
    containers: [['policia', 2], ['armario', 1], ['caixa', 1]], beds: 1, partitions: 1, loot: 1.5,
  },
  quartel: {
    label: ['Quartel', 'Quartel da Guarda', 'Base militar', 'Posto do Exército'],
    floor: 12, wall: 9, size: [14, 11], weight: 2,
    containers: [['quartel', 2], ['armario_militar', 2], ['caixa', 2]], beds: 2, partitions: 1, loot: 1.9,
  },
  posto: {
    label: ['Posto de gasolina', 'Posto Central', 'Auto Posto', 'Posto Rodovia'],
    floor: 12, wall: 9, size: [10, 8], weight: 4,
    containers: [['mercado', 1], ['oficina', 1], ['caixa', 1]], beds: 0, partitions: 0, loot: 1.1,
  },
  oficina: {
    label: ['Oficina', 'Oficina do Zé', 'Auto Center', 'Garagem'],
    floor: 12, wall: 9, size: [12, 9], weight: 4,
    containers: [['oficina', 3], ['ferramentas', 1], ['caixa', 1]], beds: 0, partitions: 0, loot: 1.3,
  },
  fazenda: {
    label: ['Celeiro', 'Fazenda Boa Esperança', 'Galpão', 'Estábulo'],
    floor: 7, wall: 9, size: [13, 10], weight: 3,
    containers: [['fazenda', 3], ['ferramentas', 1], ['caixa', 1]], beds: 0, partitions: 0, loot: 1.2,
  },
  cabana: {
    label: ['Cabana', 'Chalé', 'Casa rural', 'Acampamento'],
    floor: 7, wall: 9, size: [7, 6], weight: 8,
    containers: [['cozinha', 1], ['armario', 1], ['ferramentas', 0.6]], beds: 1, partitions: 0, loot: 0.9,
  },
  igreja: {
    label: ['Igreja', 'Capela', 'Santuário'],
    floor: 7, wall: 9, size: [11, 10], weight: 2,
    containers: [['armario', 1], ['caixa', 1], ['cozinha', 1]], beds: 0, partitions: 0, loot: 1.1,
  },
};

export const CONTAINER_INFO = {
  geladeira: { name: 'Geladeira', icon: '🧊', table: 'geladeira', solid: true },
  cozinha: { name: 'Armário de cozinha', icon: '🗄️', table: 'cozinha', solid: true },
  armario: { name: 'Armário', icon: '🚪', table: 'armario', solid: true },
  farmacia: { name: 'Armário de remédios', icon: '💊', table: 'farmacia', solid: true },
  mercado: { name: 'Prateleira', icon: '🛒', table: 'mercado', solid: true },
  escola: { name: 'Armário escolar', icon: '🎒', table: 'escola', solid: true },
  policia: { name: 'Armário policial', icon: '🚔', table: 'policia', solid: true },
  quartel: { name: 'Caixote militar', icon: '📦', table: 'quartel', solid: true },
  armario_militar: { name: 'Armário militar', icon: '🪖', table: 'armario_militar', solid: true },
  oficina: { name: 'Bancada', icon: '🔧', table: 'oficina', solid: true },
  ferramentas: { name: 'Caixa de ferramentas', icon: '🧰', table: 'ferramentas', solid: true },
  fazenda: { name: 'Caixote do celeiro', icon: '🌾', table: 'fazenda', solid: true },
  caixa: { name: 'Caixa velha', icon: '📦', table: 'ferramentas', solid: true },
  caverna: { name: 'Pilha de entulho', icon: '🪨', table: 'caverna', solid: true },
  caixa_suprimentos: { name: 'Caixa de suprimentos', icon: '🎁', table: 'caixa_suprimentos', solid: true },
  porta_malas: { name: 'Porta-malas', icon: '🚙', table: 'porta_malas', solid: false },
};

export const SKILLS = {
  carpintaria: { name: 'Carpintaria', icon: '🔨', desc: 'Construções mais resistentes e barricadas mais rápidas.' },
  culinaria: { name: 'Culinária', icon: '🍳', desc: 'Cozinha melhor e extrai mais nutrientes dos alimentos.' },
  agricultura: { name: 'Agricultura', icon: '🌱', desc: 'Plantações crescem mais rápido e rendem mais.' },
  mecanica: { name: 'Mecânica', icon: '🔧', desc: 'Repara e opera veículos com menos peças.' },
  primeiros_socorros: { name: 'Primeiros socorros', icon: '🩺', desc: 'Curativos mais eficazes e menor risco de infecção.' },
  combate: { name: 'Combate', icon: '⚔️', desc: 'Golpes mais fortes e menor desgaste de armas.' },
  condicionamento: { name: 'Condicionamento', icon: '🏃', desc: 'Mais fôlego, velocidade e resistência física.' },
  furtividade: { name: 'Furtividade', icon: '🥷', desc: 'Menos ruído ao se mover e atacar.' },
};

export const BACKGROUNDS = {
  mecanico: {
    name: 'Ex-mecânico', icon: '🔧', desc: 'Anos de graxa e motores. Carros não têm segredos para você.',
    skills: { mecanica: 3, condicionamento: 1 },
    items: [['chave_inglesa', 1], ['pecas', 2], ['combustivel', 1], ['agua', 1], ['enlatado', 1]],
  },
  enfermeira: {
    name: 'Enfermeira', icon: '🩺', desc: 'Você já viu o pior de perto. Sabe manter alguém vivo.',
    skills: { primeiros_socorros: 3, culinaria: 1 },
    items: [['kit_medico', 1], ['bandagem', 3], ['antibiotico', 2], ['agua', 1], ['barra', 2]],
  },
  cacador: {
    name: 'Caçador', icon: '🏹', desc: 'Cresceu na mata. Sabe rastrear, esperar e atirar.',
    skills: { combate: 2, furtividade: 2 },
    items: [['espingarda', 1], ['municao_espingarda', 8], ['faca', 1], ['agua', 1], ['carne_crua', 1]],
  },
  cozinheiro: {
    name: 'Cozinheiro', icon: '🍳', desc: 'Transforma restos em refeições. Isso vale ouro.',
    skills: { culinaria: 3, agricultura: 1 },
    items: [['panela', 1], ['enlatado', 2], ['agua', 2], ['isqueiro', 1], ['faca', 1]],
  },
  carpinteiro: {
    name: 'Carpinteiro', icon: '🪚', desc: 'Constrói abrigos com o que o mundo deixou para trás.',
    skills: { carpintaria: 3, combate: 1 },
    items: [['martelo', 1], ['madeira', 6], ['pregos', 10], ['agua', 1], ['enlatado', 1]],
  },
  policial: {
    name: 'Ex-policial', icon: '🚔', desc: 'Treinamento e uma pistola. A lei acabou, a disciplina ficou.',
    skills: { combate: 2, primeiros_socorros: 1, condicionamento: 1 },
    items: [['pistola', 1], ['municao_pistola', 12], ['bastao', 1], ['bandagem', 2], ['agua', 1]],
  },
  estudante: {
    name: 'Estudante', icon: '🎒', desc: 'Sem habilidades marciais, mas aprende rápido. Muito rápido.',
    skills: { furtividade: 1 },
    items: [['mochila_pequena', 1], ['barra', 4], ['agua', 2], ['bandagem', 1], ['mapa', 1]],
    xpBonus: 0.35,
  },
};

export const DIFFICULTIES = {
  sobrevivente: {
    name: 'Sobrevivente', icon: '🌿', desc: 'Um mundo hostil, mas com recursos suficientes para quem pensa.',
    loot: 1.0, damage: 1.0, spawn: 1.0, infect: 1.0, hunger: 1.0, xp: 1.0,
  },
  apocalipse: {
    name: 'Apocalipse', icon: '☠️', desc: 'Escassez, hordas maiores e ferimentos muito mais perigosos.',
    loot: 0.62, damage: 1.45, spawn: 1.55, infect: 1.6, hunger: 1.3, xp: 1.3,
  },
};

export const ZOMBIE_TYPES = {
  comum: { name: 'Caminhante', hp: 55, speed: 34, damage: 8, sight: 230, hearing: 190, size: 1, xp: 10, color: '#6c7a5b', skin: '#8c9a72' },
  corredor: { name: 'Corredor', hp: 42, speed: 74, damage: 6, sight: 280, hearing: 250, size: 0.92, xp: 16, color: '#7c5f4d', skin: '#a57b60' },
  bruto: { name: 'Bruto', hp: 160, speed: 27, damage: 19, sight: 210, hearing: 210, size: 1.38, xp: 28, color: '#555f4a', skin: '#75825f' },
  rastejante: { name: 'Rastejante', hp: 30, speed: 19, damage: 5, sight: 170, hearing: 240, size: 0.85, xp: 8, color: '#5c6350', skin: '#7e8a64' },
};

export const SEASONS = [
  { name: 'Verão', icon: '☀️', tint: 'rgba(200,150,60,0.06)', temp: 5, loot: 1.1, rain: 0.16, desc: 'Calor e insetos. A água evapora rápido.' },
  { name: 'Outono', icon: '🍂', tint: 'rgba(160,100,40,0.09)', temp: 0, loot: 1.0, rain: 0.3, desc: 'Ventos frios e folhas secas. Estações de transição.' },
  { name: 'Inverno', icon: '❄️', tint: 'rgba(80,120,170,0.14)', temp: -9, loot: 0.85, rain: 0.22, desc: 'Frio cortante. Agasalho e abrigo são prioridade.' },
  { name: 'Primavera', icon: '🌱', tint: 'rgba(90,160,80,0.07)', temp: 2, loot: 1.05, rain: 0.34, desc: 'Chuvas frequentes. A natureza retoma o mundo.' },
];

export const WEATHERS = {
  limpo: { name: 'Limpo', icon: '☀️', vision: 1.0, wet: 0, noise: 1.0, desc: 'Céu aberto. Boa visibilidade.' },
  nublado: { name: 'Nublado', icon: '☁️', vision: 0.92, wet: 0, noise: 1.0, desc: 'Céu carregado. Nada de sol.' },
  chuva: { name: 'Chuva', icon: '🌧️', vision: 0.78, wet: 0.55, noise: 0.75, desc: 'A chuva abafa sons e apaga rastros.' },
  tempestade: { name: 'Tempestade', icon: '⛈️', vision: 0.62, wet: 1, noise: 0.55, desc: 'Relâmpagos, vento e água. Perigoso.' },
  neblina: { name: 'Neblina', icon: '🌫️', vision: 0.5, wet: 0.15, noise: 0.85, desc: 'Visibilidade péssima. Ouça antes de andar.' },
};

export const BUILDABLES = {
  barricada: {
    name: 'Barricada', icon: '🪵', desc: 'Reforça uma porta ou janela. Zumbis precisam quebrá-la.',
    skill: 'carpintaria', xp: 14, hp: 240, cost: { madeira: 4, pregos: 2 }, target: 'portal', time: 2.2,
  },
  reforco_metal: {
    name: 'Reforço metálico', icon: '🛡️', desc: 'Adiciona placas de metal a uma barricada existente.',
    skill: 'carpintaria', xp: 18, hp: 180, cost: { metal: 3, pregos: 2 }, target: 'barricade', time: 2.6,
  },
  parede: {
    name: 'Parede de madeira', icon: '🧱', desc: 'Uma parede improvisada. Bloqueia passagem e mordidas.',
    skill: 'carpintaria', xp: 16, hp: 300, cost: { madeira: 6, pregos: 3 }, target: 'ground', time: 3,
  },
  cerca: {
    name: 'Cerca', icon: '🚧', desc: 'Barreira leve. Atrasa, mas não segura uma horda.',
    skill: 'carpintaria', xp: 8, hp: 120, cost: { madeira: 3 }, target: 'ground', time: 1.5,
  },
  fogueira: {
    name: 'Fogueira', icon: '🔥', desc: 'Ilumina, aquece e permite cozinhar. Atrai atenção.',
    skill: 'culinaria', xp: 10, hp: 80, cost: { madeira: 5, pedra: 4 }, target: 'ground', time: 2.5, light: 210,
  },
  caixa: {
    name: 'Caixa de armazenamento', icon: '📦', desc: 'Guarda até 18 pilhas de itens no seu abrigo.',
    skill: 'carpintaria', xp: 12, hp: 150, cost: { madeira: 5, pregos: 2 }, target: 'ground', time: 2, storage: 18,
  },
  canteiro: {
    name: 'Canteiro', icon: '🌱', desc: 'Planta sementes. Produz comida ao longo dos dias.',
    skill: 'agricultura', xp: 14, hp: 60, cost: { madeira: 4, semente_milho: 1 }, target: 'ground', time: 2.5, farm: true,
  },
  coletor: {
    name: 'Coletor de chuva', icon: '🛢️', desc: 'Acumula água potável quando chove.',
    skill: 'carpintaria', xp: 12, hp: 70, cost: { madeira: 3, lona: 2 }, target: 'ground', time: 2, collector: true,
  },
  armadilha: {
    name: 'Armadilha de estacas', icon: '🕳️', desc: 'Fere quem pisa nela. Zumbis não são espertos.',
    skill: 'carpintaria', xp: 16, hp: 90, cost: { madeira: 4, metal: 3 }, target: 'ground', time: 2.2, trap: true,
  },
  muro_metal: {
    name: 'Muro de metal', icon: '⛓️', desc: 'Barreira reforçada para proteger pontos críticos.',
    skill: 'carpintaria', xp: 26, hp: 520, cost: { metal: 6, pregos: 4 }, target: 'ground', time: 4,
  },
};

export const SURVIVOR_FIRST = ['Ana', 'Carlos', 'Helena', 'Rafael', 'Lúcia', 'Marcos', 'Beatriz', 'João', 'Clara', 'Diego', 'Sônia', 'Pedro', 'Marina', 'Tiago', 'Rosa', 'André', 'Elisa', 'Mateus', 'Vera', 'Bruno'];
export const SURVIVOR_LAST = ['Silva', 'Costa', 'Oliveira', 'Santos', 'Almeida', 'Pereira', 'Rocha', 'Ferreira', 'Mendes', 'Souza', 'Barbosa', 'Lima', 'Nogueira', 'Ramos', 'Freitas'];
export const TRADE_LINES = [
  'Não tenho muito, mas posso negociar.',
  'Tudo tem um preço agora. Até a água.',
  'Você parece precisar de algo. Eu também.',
  'Sobreviver junto é mais fácil, mas não de graça.',
  'Já vi coisa pior. Muito pior.',
  'Se estiver pensando em me roubar, pense duas vezes.',
  'Conhece algum lugar seguro? Estou de passagem.',
  'O barulho dos seus tiros atraiu metade do quarteirão.',
];
export const AMBIENT_LINES = [
  'Já faz três dias que não ouço um carro.',
  'O silêncio é pior de manhã.',
  'Meu irmão foi buscar água e não voltou.',
  'Se você tiver um lugar seguro, eu sei consertar coisas.',
  'Não confie em todo mundo que ainda fala.',
  'A rádio disse que o exército está vindo. Faz uma semana.',
  'Tenho medo de dormir sozinho.',
  'Os zumbis estão aprendendo. Juro que estão.',
];

export const EVENT_DEFS = {
  horda: { title: 'Horda à vista', icon: '🧟', desc: 'O barulho atraiu um grupo grande de zumbis.' },
  suprimentos: { title: 'Suprimentos militares', icon: '🎁', desc: 'Uma carga foi abandonada perto de você.' },
  tempestade: { title: 'Tempestade', icon: '⛈️', desc: 'O tempo fechou. Fique abrigado.' },
  saqueadores: { title: 'Saqueadores', icon: '🏴', desc: 'Um grupo hostil está rondando seu abrigo.' },
  viajante: { title: 'Sobrevivente faminto', icon: '🧑', desc: 'Alguém se aproxima pedindo ajuda.' },
  coleta: { title: 'Caravana de troca', icon: '🤝', desc: 'Um mercador montou acampamento perto daqui.' },
};

export const CRAFT_RECIPES = [
  { id: 'bandagem_caseira', name: 'Bandagem improvisada', icon: '🩹', cost: { lona: 1 }, gives: [['bandagem', 1]], skill: 'primeiros_socorros', xp: 6, desc: 'Lona limpa cortada em tiras.' },
  { id: 'lanterna_improvisada', name: 'Lanterna improvisada', icon: '🔦', cost: { pilha: 1, metal: 1 }, gives: [['lanterna', 1]], skill: 'mecanica', xp: 8, desc: 'Uma gambiarra que funciona.' },
  { id: 'agua_fervida', name: 'Ferver água', icon: '💧', cost: { agua_suja: 1, madeira: 1 }, gives: [['agua', 1]], skill: 'culinaria', xp: 8, desc: 'Transforma água suspeita em água potável.' },
  { id: 'machado_improvisado', name: 'Machado improvisado', icon: '🪓', cost: { madeira: 2, metal: 2, corda: 1 }, gives: [['machado', 1]], skill: 'carpintaria', xp: 12, desc: 'Lâmina presa a um cabo resistente.' },
  { id: 'colete_improvisado', name: 'Colete improvisado', icon: '🦺', cost: { metal: 2, corda: 2, lona: 2 }, gives: [['colete', 1]], skill: 'carpintaria', xp: 14, desc: 'Placas de metal costuradas em tecido grosso.' },
  { id: 'refeicao_quente', name: 'Refeição quente', icon: '🍲', cost: { agua: 1, enlatado: 1, madeira: 1 }, gives: [['macarrao_cozido', 1]], skill: 'culinaria', xp: 10, desc: 'Cozinhar transforma lata em refeição.' },
  { id: 'municao_caseira', name: 'Recarregar munição', icon: '🔸', cost: { metal: 2, pregos: 3 }, gives: [['municao_pistola', 4]], skill: 'mecanica', xp: 10, desc: 'Perigoso, mas melhor que nada.' },
];

export const NOTES = [
  'Se alguém encontrar isto: não abra a porta à noite. Eles imitam vozes.',
  'O gerador do hospital ainda funciona. Mas o barulho... o barulho atrai todos.',
  'Levei o caminhão para o posto. Se voltar, a chave está debaixo do banco.',
  'Não beba a água da torneira. Ferva. FERVA.',
  'Eles não sentem dor. Uma faca não basta. Quebre a cabeça.',
  'A escola virou abrigo. Depois virou armadilha. Não entre pela frente.',
  'A horda passou pelo mercado ontem. Não sobrou quase nada.',
  'Estou deixando remédios no armário da igreja. Que Deus me perdoe pelo resto.',
];
