"use strict";

// ================= Version =================
const GAME_VERSION = "1.1";
const PATCH_NOTES = [
  {
    version: "1.1", title: "Bigger, Brighter, Busier",
    notes: [
      "The world is about 9x bigger. Move around with the arrow keys or WASD, drag to pan, and zoom with the scroll wheel or - and + keys.",
      "New minimap. Click it to jump anywhere.",
      "Real opening hours: the park is open 8 AM to 10 PM (8 minutes) and closed at night (3 minutes).",
      "Building, bulldozing and moving variants now happen at night while the park is closed.",
      "End-of-day report at 10 PM with revenue, expenses, profit and everything that levelled up.",
      "Guests now arrive by car. Upgrade the parking lot to fit more of them.",
      "Wild land comes in 8 biomes with irregular shapes: pine, birch, autumn, mushroom, rocky, flower, swamp and jungle.",
      "All art redrawn at double resolution with smoother shading and more detail.",
      "More animation: blinking variants, walking guests, swaying trees, waving flags, water shimmer, butterflies and fireflies.",
      "The mute button now silences everything, music included.",
      "Version number on the loading screen, plus these patch notes.",
    ],
  },
  {
    version: "1.0", title: "Grand Opening",
    notes: [
      "27 Verity variants, fusion recipes, the Variant Index and individual variants.",
      "Park levels, enclosure sizes and themes, land, staff, care, events, goals, achievements and prestige.",
    ],
  },
];

// ================= Core constants =================
const TILE = 16;            // world units per tile
const COLS = 72;            // world size in tiles
const ROWS = 48;
const OX = 14, OY = 18;     // top-left tile of the original 24x16 park
const CORE_W = 24, CORE_H = 16;
const GATE = { x: OX, y: OY + 8 };
const WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE;
const WORLD_VERSION = 2;
const ENC_SIZE = 3;         // enclosures are 3x3 tiles
const ENC_CAPACITY = 4;
const SAVE_KEY = "verity-sanctuary-save";
const SAVE_VERSION = 2;
const AUTOSAVE_MS = 10000;
const OFFLINE_CAP_SEC = 8 * 3600;
const OFFLINE_RATE = 0.5;
const PATH_COST = 5;
const MAX_VISITORS_CAP = 160;
const SHINY_CHANCE = 0.01;
const EGG_UNCOMMON_CHANCE = 0.06;
const LAB_MAX_LEVEL = 5;

const RARITY = {
  common:    { label: "Common",    color: "#c9c5e8", tier: 0, fuseCost: 0,     chance: 1 },
  uncommon:  { label: "Uncommon",  color: "#6ee07a", tier: 1, fuseCost: 60,    chance: 0.9 },
  rare:      { label: "Rare",      color: "#5fb4ff", tier: 2, fuseCost: 250,   chance: 0.75 },
  epic:      { label: "Epic",      color: "#c77dff", tier: 3, fuseCost: 1000,  chance: 0.6 },
  legendary: { label: "Legendary", color: "#ffa53f", tier: 4, fuseCost: 4000,  chance: 0.45 },
  secret:    { label: "Secret",    color: "#ff5c7a", tier: 5, fuseCost: 12000, chance: 0.35 },
};
const RARITY_ORDER = Object.keys(RARITY);

// ================= Variants =================
// face: drawing routine in sprites.js. size: body diameter (default 12).
// shape: round | tall | jaw. move: movement style in the pen.
const VARIANTS = {
  verity:    { name: "Verity", rarity: "common", color: "#ffd23f", value: 2, appeal: 1, weight: 40, face: "smile",
               desc: "The original smiley sphere. Always happy to see you.", ability: "Song star: earns 5x while a Verity song is trending." },
  lovity:    { name: "Lovity", rarity: "common", color: "#ff7eb6", value: 4, appeal: 2, weight: 20, face: "hearts",
               desc: "Pure love in ball form.", ability: "Warm heart: pen-mates earn +10%." },
  falsity:   { name: "Falsity", rarity: "common", color: "#9d93c9", value: 3, appeal: 1.5, weight: 20, face: "frown",
               desc: "Not quite what it claims to be.", ability: "Fake views: viewers sometimes pay double, sometimes nothing." },
  humidity:  { name: "Humidity", rarity: "common", color: "#5fb4ff", value: 4, appeal: 2, weight: 12, face: "sweat",
               desc: "Always a little damp. Nobody knows why.", ability: "Dewy: gains XP 50% faster and loves the rain (2x value while it rains)." },
  sanity:    { name: "Sanity", rarity: "common", color: "#7ddc7a", value: 6, appeal: 3, weight: 8, face: "calm",
               desc: "The only sane one here.", ability: "Calming: cancels Cruelty and Toxicity penalties in its pen." },

  cruelty:   { name: "Cruelty", rarity: "uncommon", color: "#e0453a", value: 11, appeal: 4, face: "angry",
               desc: "Mean, but people love to hate it.", ability: "Bully: pen-mates earn -10%." },
  obesity:   { name: "Obesity", rarity: "uncommon", color: "#ffc21a", value: 12, appeal: 7, face: "smileBlush", size: 16,
               desc: "A very large boy.", ability: "Big crowds: huge appeal for an uncommon." },
  velocity:  { name: "Velocity", rarity: "uncommon", color: "#ff9a3c", value: 9, appeal: 4, face: "speed", move: "zoom",
               desc: "Can't stop, won't stop.", ability: "Zoomies: races around its pen." },
  gravity:   { name: "Gravity", rarity: "uncommon", color: "#7a6be0", value: 10, appeal: 4, face: "upside", move: "float",
               desc: "Lives upside down.", ability: "Weightless: floats instead of hopping." },
  curiosity: { name: "Curiosity", rarity: "uncommon", color: "#3fc9b0", value: 9, appeal: 5, face: "wide",
               desc: "Watches every visitor very closely.", ability: "Nosy: +1 coin per viewer for each pen-mate." },

  electricity: { name: "Electricity", rarity: "rare", color: "#fff27a", ink: "#1a1a6e", value: 22, appeal: 8, face: "bolt", move: "jitter",
               desc: "Crackling with energy.", ability: "Power surge: snack stands sell 50% more often." },
  toxicity:  { name: "Toxicity", rarity: "rare", color: "#9be22d", value: 36, appeal: 7, face: "toxic",
               desc: "Do not lick.", ability: "Toxic: pen-mates earn -20%, but it earns a lot." },
  elasticity:{ name: "Elasticity", rarity: "rare", color: "#e64ad6", value: 24, appeal: 8, face: "smile", shape: "tall", move: "squash",
               desc: "Infinitely stretchy.", ability: "Boing: squashes and stretches as it moves." },
  publicity: { name: "Publicity", rarity: "rare", color: "#f4f4f4", ink: "#333", value: 20, appeal: 14, face: "star",
               desc: "Always camera-ready.", ability: "Spotlight: draws lots of visitors." },
  ferocity:  { name: "Ferocity", rarity: "rare", color: "#d9601a", value: 28, appeal: 8, face: "fangs", move: "zoom",
               desc: "Requires a strong fence.", ability: "Untamed: each viewer pays up to +50% extra." },
  boobity:   { name: "Boobity", rarity: "rare", color: "#ffb3a7", value: 22, appeal: 12, face: "censored",
               desc: "This variant has been censored for your protection.", ability: "Curious crowds: big appeal boost." },

  celebrity: { name: "Celebrity", rarity: "epic", color: "#ffe066", value: 55, appeal: 25, face: "shades",
               desc: "Too famous to make eye contact.", ability: "A-lister: massive appeal." },
  prosperity:{ name: "Prosperity", rarity: "epic", color: "#e8b830", ink: "#5a3a00", value: 50, appeal: 15, face: "money",
               desc: "Smells like money.", ability: "Coin drop: drops its value in coins every 10 seconds." },
  calamity:  { name: "Calamity", rarity: "epic", color: "#a3263a", value: 70, appeal: 15, face: "swirl", move: "jitter",
               desc: "Things break when it's around.", ability: "Chaos: each viewer pays 0x to 3x." },
  scarcity:  { name: "Scarcity", rarity: "epic", color: "#b8c4d6", value: 95, appeal: 15, face: "neutral", pattern: "dither",
               desc: "There can only be one.", ability: "Unique: only one can exist in your park." },
  moggity:   { name: "Moggity", rarity: "epic", color: "#ffd23f", value: 60, appeal: 18, face: "mog", shape: "jaw",
               desc: "Mogs everything in sight.", ability: "Mog: +50% when another pen is nearby; that pen earns -25%." },

  infinity:  { name: "Infinity", rarity: "legendary", color: "#2b4fd6", value: 180, appeal: 35, face: "infinity",
               desc: "It never sleeps.", ability: "Endless: earns 1 coin per park visitor every second." },
  insanity:  { name: "Insanity", rarity: "legendary", color: "#a347ff", value: 200, appeal: 35, face: "crazy", move: "glitch",
               desc: "Nobody is home.", ability: "Glitch: each viewer pays 0.5x to 2.5x. Earns double in the evening (6-10 PM)." },
  eternity:  { name: "Eternity", rarity: "legendary", color: "#fff7e0", ink: "#6b5a2a", value: 170, appeal: 40, face: "serene",
               desc: "Has always been here.", ability: "Timeless: gains XP 3x faster. Earns double in the evening (6-10 PM)." },
  backrooms: { name: "Backrooms Verity", rarity: "legendary", color: "#c9b458", value: 220, appeal: 35, face: "blank", pattern: "stripes",
               desc: "Found behind the yellow wallpaper.", ability: "Comfort: pen-mates earn +20%." },

  steve:     { name: "Steve-Verity", rarity: "secret", color: "#ffd23f", value: 400, appeal: 60, face: "steve",
               desc: "Verity's from Minecraft.", ability: "Home team: +100% with Backrooms Verity in its pen." },
  pirate:    { name: "Pirate-Verity", rarity: "secret", color: "#ffd23f", value: 400, appeal: 60, face: "pirate",
               desc: "He belongs to the Backrooms.", ability: "Home team: +100% with Backrooms Verity in its pen." },
};
const VARIANT_KEYS = Object.keys(VARIANTS);
const COMMONS = VARIANT_KEYS.filter(k => VARIANTS[k].rarity === "common");
const UNCOMMONS = VARIANT_KEYS.filter(k => VARIANTS[k].rarity === "uncommon");

// ================= Fusion recipes (order doesn't matter) =================
const RECIPE_LIST = [
  ["verity", "verity", "obesity"],
  ["lovity", "falsity", "cruelty"],
  ["verity", "humidity", "velocity"],
  ["humidity", "sanity", "gravity"],
  ["verity", "sanity", "curiosity"],
  ["velocity", "humidity", "electricity"],
  ["cruelty", "humidity", "toxicity"],
  ["obesity", "velocity", "elasticity"],
  ["curiosity", "lovity", "publicity"],
  ["cruelty", "velocity", "ferocity"],
  ["lovity", "obesity", "boobity"],
  ["publicity", "verity", "celebrity"],
  ["publicity", "gravity", "prosperity"],
  ["ferocity", "toxicity", "calamity"],
  ["elasticity", "curiosity", "scarcity"],
  ["celebrity", "ferocity", "moggity"],
  ["velocity", "electricity", "infinity"],
  ["calamity", "curiosity", "insanity"],
  ["prosperity", "sanity", "eternity"],
  ["gravity", "calamity", "backrooms"],
  ["backrooms", "verity", "steve"],
  ["backrooms", "moggity", "pirate"],
];
const recipeKey = (a, b) => [a, b].sort().join("+");
const RECIPES = {};
const RECIPE_FOR = {};
for (const [a, b, out] of RECIPE_LIST) { RECIPES[recipeKey(a, b)] = out; RECIPE_FOR[out] = [a, b]; }

// ================= Individual variation =================
const TRAITS = {
  chill:    { label: "Chill",    mult: 1,    move: 1,   desc: "Takes life as it comes." },
  lazy:     { label: "Lazy",     mult: 0.95, move: 0.3, desc: "Barely moves. Slightly less exciting." },
  hyper:    { label: "Hyper",    mult: 1.05, move: 2,   desc: "Bounces off the walls." },
  showoff:  { label: "Show-off", mult: 1.15, move: 1.2, desc: "Poses for every visitor. +15% value." },
  shy:      { label: "Shy",      mult: 0.9,  move: 0.7, desc: "Hides from crowds. -10% value." },
  friendly: { label: "Friendly", mult: 1.05, move: 1,   desc: "Waves at visitors. +5% value." },
  grumpy:   { label: "Grumpy",   mult: 0.9,  move: 0.6, desc: "Not a people person. -10% value." },
  charming: { label: "Charming", mult: 1.1,  move: 1,   desc: "Visitors adore it. +10% value." },
};
const TRAIT_KEYS = Object.keys(TRAITS);
const SIZES = { "-1": { label: "Tiny", d: -2 }, "0": { label: "Normal", d: 0 }, "1": { label: "Chunky", d: 2 } };
const MARKINGS = { none: "None", freckles: "Freckles", blush: "Rosy cheeks", spots: "Spots", band: "Dark band" };
const ACCESSORIES = { none: "None", bow: "Bow", sprout: "Sprout", tophat: "Top hat", glasses: "Glasses", flower: "Flower", antenna: "Antenna", bandaid: "Band-aid", scarf: "Scarf" };
const HEADWEAR = ["bow", "sprout", "tophat", "antenna", "flower"];
const NO_HEADWEAR = ["steve", "pirate", "eternity"];
const NAME_A = ["Bub", "Zor", "Lil", "Mo", "Pip", "Taz", "Gloo", "Ver", "Sun", "Bo", "Kix", "Nu", "Fli", "Dot", "Ru", "Wob", "Squi", "Bon", "Mim", "Ziggy", "Pud", "Tof"];
const NAME_B = ["by", "ster", "o", "ix", "ly", "bert", "kins", "zy", "pop", "ty", "bean", "nugget", "ble", "ito"];

// ================= Shops & decorations =================
const OBJECTS = {
  fries:    { name: "Verity Fries",    kind: "stand", cost: 150,  price: 3,  appeal: 0.5 },
  lemonade: { name: "Lovity Lemonade", kind: "stand", cost: 450,  price: 7,  appeal: 0.5 },
  burger:   { name: "Mog Burger",      kind: "stand", cost: 1500, price: 18, appeal: 1 },
  flowers:  { name: "Flower Bed",      kind: "decor", cost: 25,   appeal: 0.5 },
  bench:    { name: "Bench",           kind: "decor", cost: 60,   appeal: 1 },
  lamp:     { name: "Lamp Post",       kind: "decor", cost: 100,  appeal: 1.5 },
  fountain: { name: "Fountain",        kind: "decor", cost: 600,  appeal: 5 },
  statue:   { name: "Verity Statue",   kind: "decor", cost: 2500, appeal: 15 },
};
const STAND_BUY_CHANCE = 0.3;
const STAR_THRESHOLDS = [0, 15, 50, 120, 250];   // appeal needed for 1..5 stars

// ================= Goals =================
// prog() returns [current, target]
const GOALS = [
  { text: "Hatch 3 eggs", prog: () => [state.stats.hatched, 3], reward: 50 },
  { text: "Build a second enclosure", prog: () => [state.enclosures.length, 2], reward: 100 },
  { text: "Build a snack stand next to a path", prog: () => [countObjects("stand"), 1], reward: 150 },
  { text: "Discover 5 variants", prog: () => [discoveredCount(), 5], reward: 250 },
  { text: "Fuse two variants in the Lab", prog: () => [state.stats.fusions, 1], reward: 300 },
  { text: "Earn 5 coins per second", prog: () => [state.incomeRate, 5], reward: 400 },
  { text: "Place 4 decorations", prog: () => [countObjects("decor"), 4], reward: 500 },
  { text: "Reach a 3-star park", prog: () => [starRating(), 3], reward: 1000 },
  { text: "Discover 10 variants", prog: () => [discoveredCount(), 10], reward: 2000 },
  { text: "Save a variant from the Backrooms", prog: () => [state.stats.tugWins, 1], reward: 2500 },
  { text: "Earn 50 coins per second", prog: () => [state.incomeRate, 50], reward: 4000 },
  { text: "Discover an Epic variant", prog: () => [hasRarity("epic") ? 1 : 0, 1], reward: 6000 },
  { text: "Reach a 5-star park", prog: () => [starRating(), 5], reward: 10000 },
  { text: "Discover a Legendary variant", prog: () => [hasRarity("legendary") ? 1 : 0, 1], reward: 25000 },
  { text: "Earn 500 coins per second", prog: () => [state.incomeRate, 500], reward: 50000 },
  { text: "Discover all 27 variants", prog: () => [discoveredCount(), VARIANT_KEYS.length], reward: 250000 },
];

// ================= Achievements =================
const ACHIEVEMENTS = [
  { id: "hatch1",   name: "First Hatch",       desc: "Hatch your first egg.",          test: () => state.stats.hatched >= 1 },
  { id: "hatch50",  name: "Egg Enthusiast",    desc: "Hatch 50 eggs.",                 test: () => state.stats.hatched >= 50 },
  { id: "shiny",    name: "Shiny!",            desc: "Get a shiny variant.",           test: () => state.stats.shinies >= 1 },
  { id: "fuse1",    name: "Fusion Novice",     desc: "Complete a fusion.",             test: () => state.stats.fusions >= 1 },
  { id: "fuse25",   name: "Mad Scientist",     desc: "Complete 25 fusions.",           test: () => state.stats.fusions >= 25 },
  { id: "mog",      name: "First Mog",         desc: "Discover Moggity.",              test: () => !!state.discovered.moggity },
  { id: "backroom", name: "Backrooms Explorer", desc: "Discover Backrooms Verity.",    test: () => !!state.discovered.backrooms },
  { id: "secret",   name: "He Belongs Here",   desc: "Discover a secret variant.",     test: () => hasRarity("secret") },
  { id: "all",      name: "Gotta Hatch 'Em All", desc: "Discover all 27 variants.",    test: () => discoveredCount() >= VARIANT_KEYS.length },
  { id: "tug",      name: "He Stays",          desc: "Win a tug-of-war.",              test: () => state.stats.tugWins >= 1 },
  { id: "viral",    name: "Gone Viral",        desc: "Have a variant go viral.",       test: () => state.stats.virals >= 1 },
  { id: "stands",   name: "Snack Attack",      desc: "Own 3 snack stands.",            test: () => countObjects("stand") >= 3 },
  { id: "decor",    name: "Decorator",         desc: "Place 10 decorations.",          test: () => countObjects("decor") >= 10 },
  { id: "stars5",   name: "Crowd Pleaser",     desc: "Reach a 5-star park.",           test: () => starRating() >= 5 },
  { id: "pet50",    name: "Pet Lover",         desc: "Pet variants 50 times.",         test: () => state.stats.pets >= 50 },
  { id: "rename",   name: "Name Giver",        desc: "Rename a variant.",              test: () => state.stats.renamed >= 1 },
  { id: "lvl10",    name: "Max Level",         desc: "Get a variant to level 10.",     test: () => allIndividuals().some(i => levelOf(i) >= 10) },
  { id: "rich",     name: "Tycoon",            desc: "Earn 100K coins in total.",      test: () => state.totalEarned >= 1e5 },
  { id: "million",  name: "Millionaire",       desc: "Earn 1M coins in total.",        test: () => state.totalEarned >= 1e6 },
];

// ================= Park XP & unlocks =================
const MAX_PARK_LEVEL = 30;
const xpToNext = level => Math.round(120 * Math.pow(1.32, level - 1));
const XP = {
  hatch: 10,
  discover: tier => 40 * (tier + 1),
  fuseSuccess: tier => 20 * (tier + 1),
  fuseFail: 5,
  place: 2,
  enclosure: 20,
  object: 8,
  visitor: 0.25,
  goal: index => 30 + 20 * index,
  achievement: 75,
  tugWin: 60,
  pet: 1,
  labUpgrade: 25,
  variantLevel: 5,
};

// Everything here stays hidden until the park reaches its level.
const UNLOCKS = [
  { level: 1,  id: "obj:flowers",  name: "Flower Bed" },
  { level: 2,  id: "obj:fries",    name: "Verity Fries stand" },
  { level: 2,  id: "obj:bench",    name: "Bench" },
  { level: 2,  id: "enc:3",        name: "+1 enclosure slot" },
  { level: 3,  id: "lab",          name: "Fusion Lab (Common & Uncommon fusions)" },
  { level: 4,  id: "events",       name: "Meme events" },
  { level: 4,  id: "obj:lamp",     name: "Lamp Post" },
  { level: 4,  id: "enc:4",        name: "+1 enclosure slot" },
  { level: 5,  id: "obj:lemonade", name: "Lovity Lemonade stand" },
  { level: 6,  id: "fuse:rare",    name: "Rare fusions" },
  { level: 6,  id: "labUpgrade",   name: "Lab upgrades" },
  { level: 6,  id: "enc:5",        name: "+1 enclosure slot" },
  { level: 7,  id: "obj:fountain", name: "Fountain" },
  { level: 8,  id: "enc:6",        name: "+1 enclosure slot" },
  { level: 9,  id: "fuse:epic",    name: "Epic fusions" },
  { level: 9,  id: "obj:burger",   name: "Mog Burger stand" },
  { level: 10, id: "enc:7",        name: "+1 enclosure slot" },
  { level: 11, id: "obj:statue",   name: "Verity Statue" },
  { level: 12, id: "fuse:legendary", name: "Legendary fusions" },
  { level: 13, id: "enc:8",        name: "+1 enclosure slot" },
  { level: 15, id: "fuse:secret",  name: "Secret fusions" },
  { level: 16, id: "enc:9",        name: "+1 enclosure slot" },
  { level: 20, id: "enc:10",       name: "+1 enclosure slot" },
  { level: 2,  id: "lot:2",        name: "Parking lot upgrade" },
  { level: 5,  id: "lot:3",        name: "Parking lot upgrade" },
  { level: 8,  id: "lot:4",        name: "Parking lot upgrade" },
  { level: 12, id: "lot:5",        name: "Parking lot upgrade" },
  { level: 3,  id: "care",         name: "Variant care (keep them fed!)" },
  { level: 3,  id: "plot:east",    name: "New land for sale" },
  { level: 3,  id: "requests",     name: "Visitor requests" },
  { level: 4,  id: "theme:pool",   name: "Pool enclosures" },
  { level: 4,  id: "staff:janitor", name: "Janitors" },
  { level: 5,  id: "size:medium",  name: "Medium 4x4 enclosures" },
  { level: 5,  id: "path:2",       name: "Stone paths" },
  { level: 5,  id: "staff:keeper", name: "Keepers" },
  { level: 6,  id: "egg:golden",   name: "Golden eggs" },
  { level: 6,  id: "plot:south",   name: "More land for sale" },
  { level: 7,  id: "theme:lab",    name: "Lab enclosures" },
  { level: 8,  id: "staff:mascot", name: "Verity Mascot" },
  { level: 9,  id: "theme:stage",  name: "Stage enclosures" },
  { level: 9,  id: "plot:corner",  name: "More land for sale" },
  { level: 10, id: "size:large",   name: "Large 5x5 enclosures" },
  { level: 10, id: "path:3",       name: "Yellow brick paths" },
  { level: 10, id: "egg:cursed",   name: "Cursed eggs" },
  { level: 12, id: "theme:backrooms", name: "Backrooms enclosures" },
  { level: 15, id: "prestige",     name: "New Sanctuary (prestige)" },
];
UNLOCKS.sort((a, b) => a.level - b.level);
const UNLOCK_LEVEL = {};
for (const u of UNLOCKS) UNLOCK_LEVEL[u.id] = u.level;
UNLOCK_LEVEL["fuse:common"] = UNLOCK_LEVEL["fuse:uncommon"] = UNLOCK_LEVEL.lab;

// ================= Enclosure sizes & themes =================
const ENC_TYPES = {
  small:  { label: "Small",  size: 3, cap: 4, cost: 100,  appeal: 0 },
  medium: { label: "Medium", size: 4, cap: 6, cost: 450,  appeal: 1.5 },
  large:  { label: "Large",  size: 5, cap: 9, cost: 1600, appeal: 4 },
};
const SIZE_KEY = { 3: "small", 4: "medium", 5: "large" };
const THEMES = {
  meadow:    { label: "Meadow",    costMult: 1,   likes: [], desc: "Plain grass. Nobody minds it." },
  pool:      { label: "Pool",      costMult: 1.5, likes: ["humidity", "lovity", "sanity", "gravity", "elasticity"], desc: "A splash pool for water lovers." },
  lab:       { label: "Lab",       costMult: 1.8, likes: ["electricity", "curiosity", "insanity", "infinity", "toxicity"], desc: "Beakers, wires and questionable science." },
  stage:     { label: "Stage",     costMult: 2,   likes: ["celebrity", "publicity", "moggity", "obesity", "verity", "boobity"], desc: "Spotlights for the show-offs." },
  backrooms: { label: "Backrooms", costMult: 2.5, likes: ["backrooms", "steve", "pirate", "calamity", "falsity", "eternity", "scarcity", "cruelty", "ferocity", "velocity"], desc: "Endless yellow wallpaper. Some variants feel at home." },
};
const THEME_BONUS = 0.5;   // liked theme: +50% value

// ================= Paths =================
const PATH_TYPES = {
  1: { label: "Dirt",         cost: 5,  speed: 1,    appeal: 0 },
  2: { label: "Stone",        cost: 15, speed: 1.35, appeal: 0.03 },
  3: { label: "Yellow Brick", cost: 40, speed: 1.7,  appeal: 0.08 },
};

// ================= Land =================
// The original park area keeps its rectangular plots; the wild land around it is split
// into irregular plots by a noisy nearest-seed partition, each with its own biome.
const PLOTS = {
  start:  { label: "Starter Meadow", rect: [OX, OY, OX + 15, OY + 11], cost: 0, level: 1, biome: "meadow" },
  east:   { label: "East Woods",     rect: [OX + 16, OY, OX + 23, OY + 11], cost: 2500, level: 3, biome: "oak" },
  south:  { label: "South Field",    rect: [OX, OY + 12, OX + 15, OY + 15], cost: 6000, level: 6, biome: "birch" },
  corner: { label: "Far Corner",     rect: [OX + 16, OY + 12, OX + 23, OY + 15], cost: 15000, level: 9, biome: "autumn" },
};
const WILD_SEEDS = [
  { key: "pines",  label: "Whispering Pines", x: 22, y: 8,  biome: "pine",     level: 7 },
  { key: "hollow", label: "Birch Hollow",     x: 37, y: 6,  biome: "birch",    level: 8 },
  { key: "bog",    label: "Misty Bog",        x: 22, y: 41, biome: "swamp",    level: 9 },
  { key: "glade",  label: "Mushroom Glade",   x: 50, y: 9,  biome: "mushroom", level: 10 },
  { key: "amber",  label: "Amber Woods",      x: 46, y: 26, biome: "autumn",   level: 11 },
  { key: "ridge",  label: "Rocky Ridge",      x: 64, y: 7,  biome: "rocky",    level: 12 },
  { key: "bloom",  label: "Bloom Thicket",    x: 61, y: 23, biome: "flower",   level: 13 },
  { key: "tangle", label: "Tangle Jungle",    x: 38, y: 41, biome: "jungle",   level: 14 },
  { key: "willow", label: "Willow Bend",      x: 54, y: 40, biome: "swamp",    level: 16 },
  { key: "deep",   label: "The Deep Woods",   x: 67, y: 40, biome: "pine",     level: 18 },
];
for (const w of WILD_SEEDS) PLOTS[w.key] = { label: w.label, seed: [w.x, w.y], cost: Math.round(3000 * Math.pow(1.42, w.level - 5) / 100) * 100, level: w.level, biome: w.biome };

function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, scale, s = 0) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sm = t => t * t * (3 - 2 * t);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * sm(tx) + (c - a) * sm(ty) + (a - b - c + d) * sm(tx) * sm(ty);
}

const PLOT_MAP = new Int8Array(COLS * ROWS).fill(-1);
const PLOT_KEYS = Object.keys(PLOTS);
(function buildPlotMap() {
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (x < OX) continue;
      let key = null;
      for (const k of ["start", "east", "south", "corner"]) {
        const r = PLOTS[k].rect;
        if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) key = k;
      }
      if (!key) {
        let best = Infinity;
        WILD_SEEDS.forEach((w, i) => {
          const d = Math.hypot(x - w.x, (y - w.y) * 1.15) + (valueNoise(x, y, 6, 3 + i * 7) - 0.5) * 14 + (valueNoise(x, y, 2.5, 50 + i) - 0.5) * 5;
          if (d < best) { best = d; key = w.key; }
        });
      }
      PLOT_MAP[y * COLS + x] = PLOT_KEYS.indexOf(key);
    }
  // smooth away specks: each wild tile takes the majority plot of its 3x3 neighbourhood
  const wildIdx = new Set(WILD_SEEDS.map(w => PLOT_KEYS.indexOf(w.key)));
  for (let pass = 0; pass < 3; pass++) {
    const copy = PLOT_MAP.slice();
    for (let y = 0; y < ROWS; y++)
      for (let x = OX; x < COLS; x++) {
        const cur = copy[y * COLS + x];
        if (!wildIdx.has(cur)) continue;
        const votes = {};
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < OX || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const v = copy[ny * COLS + nx];
            if (wildIdx.has(v)) votes[v] = (votes[v] || 0) + 1;
          }
        let best = cur, bc = votes[cur] || 0;
        for (const [v, c] of Object.entries(votes)) if (c > bc) { best = +v; bc = c; }
        PLOT_MAP[y * COLS + x] = best;
      }
  }
  // label/sign position: the plot tile nearest its centroid
  for (const k of PLOT_KEYS) {
    const idx = PLOT_KEYS.indexOf(k);
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < PLOT_MAP.length; i++) if (PLOT_MAP[i] === idx) { sx += i % COLS; sy += Math.floor(i / COLS); n++; }
    const cx = sx / n, cy = sy / n;
    let best = Infinity, bx = 0, by = 0;
    for (let i = 0; i < PLOT_MAP.length; i++) {
      if (PLOT_MAP[i] !== idx) continue;
      const d = Math.hypot(i % COLS - cx, Math.floor(i / COLS) - cy);
      if (d < best) { best = d; bx = i % COLS; by = Math.floor(i / COLS); }
    }
    Object.assign(PLOTS[k], { tiles: n, sign: [bx, by] });
  }
})();
for (const w of WILD_SEEDS) {
  UNLOCKS.push({ level: w.level, id: "plot:" + w.key, name: `New land for sale: ${w.label}` });
  UNLOCK_LEVEL["plot:" + w.key] = w.level;
}
UNLOCKS.sort((a, b) => a.level - b.level);

// ================= Staff =================
const STAFF = {
  janitor: { label: "Janitor",       hire: 200,  wage: 0.25, max: 4, desc: "Sweeps trash off the paths." },
  keeper:  { label: "Keeper",        hire: 350,  wage: 0.4,  max: 6, desc: "Feeds hungry pens for free." },
  mascot:  { label: "Verity Mascot", hire: 1200, wage: 1,    max: 2, appeal: 6, desc: "A giant Verity suit. +6 appeal, cheers visitors up." },
};

// ================= Eggs =================
const EGGS = {
  regular: { label: "Egg",        base: 25,  growth: 1.15, desc: "Mostly commons · 6% uncommon · 1% shiny" },
  golden:  { label: "Golden Egg", base: 400, growth: 1.2,  desc: "40% uncommon · 12% rare · 3% epic · 5% shiny" },
  cursed:  { label: "Cursed Egg", base: 250, growth: 1.18, desc: "Dark variants, sometimes very rare. Often grumpy." },
};
const CURSED_POOL = [["falsity", 30], ["cruelty", 22], ["ferocity", 16], ["toxicity", 14], ["calamity", 8], ["insanity", 3], ["backrooms", 2]];

// ================= Care =================
const CARE = { foodDecay: 100 / 1200, feedCost: 3, petJoy: 15, joyDrift: 0.02, offlineFloor: 40 };

// ================= Visitors =================
const VISITOR_TYPES = {
  normal:     { weight: 78 },
  kid:        { weight: 10, buyMult: 1.6 },
  influencer: { weight: 7, viralChance: 0.04 },
  critic:     { weight: 5 },
};

// ================= World =================
// Park hours: open 8 AM to 10 PM (DAY_SECS real seconds), closed 10 PM to 8 AM (NIGHT_SECS).
const DAY_SECS = 480;
const NIGHT_SECS = 180;
const CYCLE_SECS = DAY_SECS + NIGHT_SECS;

// ================= Road & parking =================
const ROAD_X = [1, 2];          // two-lane road along the west edge
const LOT_LEVELS = [
  { spaces: 6,  cost: 0,     rect: [10, 25, 13, 27] },
  { spaces: 12, cost: 800,   rect: [10, 24, 13, 28] },
  { spaces: 20, cost: 3000,  rect: [8, 24, 13, 28] },
  { spaces: 30, cost: 9000,  rect: [8, 23, 13, 29] },
  { spaces: 48, cost: 25000, rect: [7, 22, 13, 30] },
];
const GUESTS_PER_SPACE = 3;
const WEATHER = {
  clear:  { label: "Sunny",  weight: 50, spawn: 1,   icon: "sun" },
  cloudy: { label: "Cloudy", weight: 25, spawn: 1.1, icon: "cloud" },
  rain:   { label: "Rain",   weight: 20, spawn: 1.6, icon: "rain" },
  storm:  { label: "Storm",  weight: 5,  spawn: 2.5, icon: "storm" },
};

// ================= Escapes =================
const ESCAPERS = { calamity: 0.08, ferocity: 0.08, insanity: 0.04, velocity: 0.03 };   // chance per minute

// ================= Prestige & daily =================
const SHARD_BONUS = 0.1;            // +10% income per Truth Shard
const SHARD_DIVISOR = 20000;        // shards = floor(sqrt(coins earned this run / divisor))
const DAILY_COINS_PER_LEVEL = 60;

ACHIEVEMENTS.push(
  { id: "land",     name: "Land Baron",       desc: "Own every plot of land.",          test: () => PLOT_KEYS.every(k => state.plots[k]) },
  { id: "bigpen",   name: "Go Big",           desc: "Build a Large enclosure.",         test: () => state.enclosures.some(e => e.s === 5) },
  { id: "themes",   name: "Interior Designer", desc: "Build every enclosure theme.",    test: () => Object.keys(THEMES).every(t => state.enclosures.some(e => e.theme === t)) },
  { id: "brick",    name: "Follow the Road",  desc: "Lay 10 yellow brick paths.",       test: () => state.tiles.filter(t => t === 3).length >= 10 },
  { id: "staff",    name: "Full Staff",       desc: "Hire one of every staff type.",    test: () => Object.keys(STAFF).every(t => (state.staff[t] || 0) > 0) },
  { id: "clean",    name: "Clean Freak",      desc: "Clean up 50 pieces of trash.",     test: () => state.stats.trashCleaned >= 50 },
  { id: "fed",      name: "Well Fed",         desc: "Feed variants 100 times.",         test: () => state.stats.feeds >= 100 },
  { id: "golden",   name: "Golden Child",     desc: "Hatch a golden egg.",              test: () => state.stats.golden >= 1 },
  { id: "cursed",   name: "Cursed!",          desc: "Hatch a cursed egg.",              test: () => state.stats.cursed >= 1 },
  { id: "catch",    name: "Escape Artist",    desc: "Catch an escaped variant.",        test: () => state.stats.escapesCaught >= 1 },
  { id: "requests", name: "Crowd Favourite",  desc: "Complete 10 visitor requests.",    test: () => state.stats.requests >= 10 },
  { id: "critic",   name: "Critic's Choice",  desc: "Get a 5-star critic review.",      test: () => state.stats.reviews5 >= 1 },
  { id: "streak",   name: "Daily Devotee",    desc: "Reach a 7-day login streak.",      test: () => state.daily.streak >= 7 },
  { id: "reborn",   name: "Reborn",           desc: "Start a New Sanctuary.",           test: () => state.stats.prestiges >= 1 },
);
