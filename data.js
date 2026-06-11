// Uncaught error reporter for debugging
window.addEventListener('error', function(e) {
    let errDiv = document.getElementById('debug-error-overlay');
    if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'debug-error-overlay';
        errDiv.style.position = 'fixed';
        errDiv.style.top = '0';
        errDiv.style.left = '0';
        errDiv.style.width = '100vw';
        errDiv.style.background = 'rgba(255, 0, 0, 0.95)';
        errDiv.style.color = 'white';
        errDiv.style.fontFamily = 'monospace';
        errDiv.style.fontSize = '14px';
        errDiv.style.padding = '15px';
        errDiv.style.zIndex = '99999';
        errDiv.style.boxSizing = 'border-box';
        errDiv.style.maxHeight = '50vh';
        errDiv.style.overflowY = 'auto';
        errDiv.style.borderBottom = '3px solid black';
        
        let closeBtn = document.createElement('button');
        closeBtn.innerText = 'Dismiss';
        closeBtn.style.float = 'right';
        closeBtn.onclick = () => errDiv.remove();
        errDiv.appendChild(closeBtn);
        
        let title = document.createElement('h3');
        title.innerText = 'Uncaught Runtime Error:';
        title.style.margin = '0 0 10px 0';
        errDiv.appendChild(title);
        
        document.body.appendChild(errDiv);
    }
    let p = document.createElement('p');
    p.innerText = `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`;
    p.style.margin = '5px 0';
    errDiv.appendChild(p);
});

// --- Globals & DOM ---
const canvas = document.getElementById('gameCanvas');
const dummyCanvas = document.createElement('canvas');
const ctx = dummyCanvas.getContext('2d');
const scoreEl = document.getElementById('score'), hpEl = document.getElementById('hp'), foodEl = document.getElementById('food'), staminaEl = document.getElementById('stamina'), oxygenEl = document.getElementById('oxygen');
const weaponEl = document.getElementById('weapon-name'), adsEl = document.getElementById('ads-status'), coordsEl = document.getElementById('coords'), speedometerItemEl = document.getElementById('speedometer-item'), speedometerEl = document.getElementById('speedometer');
const overlay = document.getElementById('overlay'), damageFlash = document.getElementById('damage-flash'), healFlash = document.getElementById('heal-flash');
const fpsCounterEl = document.getElementById('fps-counter'), fpsValEl = document.getElementById('fps-val');
const timeCounterEl = document.getElementById('time-counter'), timeValEl = document.getElementById('time-val');

const invScreen = document.getElementById('inventory-screen'), containerUI = document.getElementById('container-ui');
const playerInvGrid = document.getElementById('player-inv-grid'), containerInvGrid = document.getElementById('container-inv-grid');
const craftingList = document.getElementById('crafting-list');
const interactTooltip = document.getElementById('interact-tooltip'), debugMenu = document.getElementById('debug-menu');
const stairMenu = document.getElementById('stair-menu'), stairMenuTitle = document.getElementById('stair-menu-title');

const dbgTimeEl = document.getElementById('dbg-time'), dbgTimeValEl = document.getElementById('dbg-time-val');
const dbgTimeSpeedEl = document.getElementById('dbg-time-speed');

// --- Engine Variables ---
let activeRenderList =[];
let _lastAlign = '', _lastFont = '', _lastBaseline = '';

// --- Performance Utilities ---
const SpriteCache = {
    sprites: new Map(),
    get(emoji, shadow = false, rotate = false, ambient = 1.0) {
        let ambStep = ambient >= 1.0 ? 1.0 : Math.max(0.1, Math.round(ambient * 20) / 20); 
        const key = `${emoji}_${shadow}_${rotate}_${ambStep}`;
        if (this.sprites.has(key)) return this.sprites.get(key);

        const baseSize = 128; 
        const c = document.createElement('canvas');
        c.width = baseSize * 1.5;
        c.height = baseSize * 1.5;
        const cx = c.getContext('2d', { willReadFrequently: true });
        
        cx.font = `${baseSize}px sans-serif`;
        cx.textAlign = 'center';
        cx.textBaseline = 'bottom';
        
        if (shadow) {
            cx.shadowColor = 'white';
            cx.shadowBlur = 25;
        }

        cx.translate(c.width / 2, c.height - 20); 
        if (rotate) {
            cx.translate(0, -baseSize / 2);
            cx.rotate(Math.PI);
            cx.translate(0, baseSize / 2);
        }
        
        cx.fillText(emoji, 0, 0);

        if (ambStep < 1.0 && !shadow) {
            cx.globalCompositeOperation = 'source-atop';
            cx.fillStyle = `rgba(15, 20, 35, ${1.0 - ambStep})`;
            cx.fillRect(-c.width, -c.height, c.width * 2, c.height * 2);
            cx.globalCompositeOperation = 'source-over';
        }

        this.sprites.set(key, c);
        return c;
    }
};

const renderPool =[];
let renderCount = 0;
function getRenderItem() {
    if (renderCount >= renderPool.length) renderPool.push({});
    let o = renderPool[renderCount++];
    o.flash = 0; o.targeted = false; o.dead = false; o.hp = undefined; o.wX = undefined; o.wY = undefined; o.flicker = 1.0; o.obj = null; o.ghost = false; o.spinScaleX = undefined;
    o.isLimb = false; o.limbType = undefined; o.vx = undefined; o.vy = undefined; o.vz = undefined; o.landedAngle = undefined;
    o.texture = null; o.uvs = null; o.alpha = 1.0;
    return o;
}

function createNoisePattern(baseColor, noiseAlphaDark, noiseAlphaLight) {
    let tc = document.createElement('canvas');
    tc.width = 128; tc.height = 128; 
    let tctx = tc.getContext('2d');
    tctx.fillStyle = baseColor;
    tctx.fillRect(0,0,128,128);
    for(let i=0; i<3000; i++){
        tctx.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${noiseAlphaDark})` : `rgba(255,255,255,${noiseAlphaLight})`;
        tctx.fillRect(Math.floor(Math.random()*128), Math.floor(Math.random()*128), 2, 2);
    }
    return ctx.createPattern(tc, 'repeat');
}
const patternArmyGreenFloor = createNoisePattern('#323F18', 0.3, 0.05);
const patternArmyGreen = createNoisePattern('#4A5D23', 0.2, 0.05);
const patternArmyGreenDark = createNoisePattern('#3B4A1C', 0.25, 0.05);

// --- Game Data & Configs ---
const RECIPES =[
    { name: "Torch", result: { type: 'torch', emoji: '🔥', count: 1 }, req: { '🪵': 2 } },
    { name: "Wood Block", result: { id: 'wood_block', type: 'block', emoji: '🪵', count: 1 }, req: { '🪵': 3 } },
    { name: "Stone Cube", result: { id: 'stone_block', type: 'block', emoji: '🪨', count: 1 }, req: { '🪨': 4 } }
];

const ITEMS = { 
    'pistol': { name: "Pistol", fireRate: 15, spread: 0.005, speed: 2.5, count: 1, dmg: 3, type: 'weapon' }, 
    'smg': { name: "SMG", fireRate: 4, spread: 0.04, speed: 3.0, count: 1, dmg: 1, type: 'weapon' }, 
    'shotgun': { name: "Shotgun", fireRate: 40, spread: 0.08, speed: 2.2, count: 12, dmg: 2, type: 'weapon' },
    'axe': { name: "Axe", fireRate: 25, isMelee: true, range: 2.5, dmg: 3, toolType: 'axe', type: 'tool' },
    'pickaxe': { name: "Pickaxe", fireRate: 25, isMelee: true, range: 2.5, dmg: 2, toolType: 'pickaxe', type: 'tool' },
    'shovel': { name: "Shovel", fireRate: 15, isMelee: true, range: 4.5, dmg: 1, toolType: 'shovel', type: 'tool' },
    'dirt': { name: "Dirt Block", fireRate: 15, isMelee: true, range: 4.5, dmg: 0, type: 'block', blockId: 1 },
    'cube': { name: "Cube Block", fireRate: 15, isMelee: true, range: 4.5, dmg: 0, type: 'block', blockId: 3 },
    'wood_block': { name: "Wood Block", fireRate: 15, isMelee: true, range: 4.5, dmg: 0, type: 'block', blockId: 4 },
    'stone_block': { name: "Stone Cube", fireRate: 15, isMelee: true, range: 4.5, dmg: 0, type: 'block', blockId: 5 },
    'coord_picker': { name: "Coord Picker", fireRate: 15, isMelee: true, range: 100.0, dmg: 0, type: 'tool' }
};

const ENTITIES_DATA = { '🌲': { baseSize: 5.5, solid: true }, '🌳': { baseSize: 5.0, solid: true }, '🪾': { baseSize: 5.2, solid: true }, '🌵': { baseSize: 1.4, solid: true }, '💀': { baseSize: 0.5, solid: false }, '🪨': { baseSize: 0.8, solid: true }, '🌻': { baseSize: 0.6, solid: false }, '🌹': { baseSize: 0.6, solid: false }, '🌷': { baseSize: 0.6, solid: false }, '🌼': { baseSize: 0.6, solid: false } };

const ANIMAL_TYPES =[ 
    { emoji: '🐄', hp: 6, drop: { type: 'food', emoji: '🍔', amount: 30 }, size: 1.5, speed: 0.015 }, 
    { emoji: '🐖', hp: 4, drop: { type: 'food', emoji: '🥓', amount: 20 }, size: 1.2, speed: 0.025 }, 
    { emoji: '🐓', hp: 2, drop: { type: 'food', emoji: '🍗', amount: 15 }, size: 0.8, speed: 0.035 },
    { emoji: '🐑', hp: 4, drop: { type: 'resource', emoji: '🧶', count: 1 }, size: 1.1, speed: 0.018 }
];
const TREE_EMOJIS = new Set(['🌲', '🌳', '🪾']), FLOWER_EMOJIS = new Set(['🌻', '🌹', '🌷', '🌼', '💀']);

// Dynamic rendering controls
let VIEW_DIST = 180;
const CHUNK_SIZE = 8; 

// --- Game State Variables ---
let gameTime = 12.0;
let timeSpeed = 1.0;
let isInventoryOpen = false, isDebugOpen = false, isStairMenuOpen = false, interactTarget = null, activeContainer = null;
let placementItem = null, placementIndex = -1;

let inventory = new Array(24).fill(null); 
// Assign initial starting gear to Hotbar slots
inventory[0] = { id: 'pistol', type: 'weapon', emoji: '🔫', count: 1, bullets: 10 };
inventory[1] = { id: 'smg', type: 'weapon', emoji: '📠', count: 1 };
inventory[2] = { id: 'shotgun', type: 'weapon', emoji: '🪈', count: 1 };
inventory[3] = { id: 'axe', type: 'tool', emoji: '🪓', count: 1 };
inventory[4] = { id: 'pickaxe', type: 'tool', emoji: '⛏️', count: 1 };
inventory[5] = { id: 'shovel', type: 'tool', emoji: '🥄', count: 1 };
inventory[6] = { id: 'dirt', type: 'block', emoji: '🟫', count: 64 };
inventory[7] = { id: 'cube', type: 'block', emoji: '🧊', count: 64 };
inventory[8] = { id: 'coord_picker', type: 'tool', emoji: '📐', count: 1 };
inventory[9] = { id: '.45acp', type: 'ammo', emoji: '⚙️', count: 100 };

let hotbarSelection = 0;

let godMode = false, noclip = false, speedMult = 1.0;
let flightMode = false, jumpPower = 0.28;
let infiniteStamina = false, sprintMult = 1.5;
let spawnEnemiesToggle = true, showDebugInfo = false;
let isFlashlightOn = false;
let lockFps30 = false;
let thickFogEnabled = true;

let score = 0, isPaused = true, tickCounter = 0, isLoading = false, hasLoaded = false;
let baseZoom = 0.5 / Math.tan(40 * Math.PI / 180);
let isMouseDown = false, isZooming = false, currentZoom = 0.5 / Math.tan(40 * Math.PI / 180), fireCooldown = 0, keys = {};
let gameState = 'overworld', activeBuilding = null, activeFloor = 0, savedOverworld = { x: 0, y: 0, z: 0, angle: 0, pitch: 0 };

const torches = [];
const destroyedEntities = new Set();
const damageTexts = [];
const bloodParticles =[];
const projectiles = [], enemies = [], containers = [], animals = [], buildings = [], vehicles = [], droppedItems = [];
const player = { x: 0, y: 0, z: 20, vz: 0, angle: 0, pitch: 0, speed: 0.12, baseHeight: 1.4, hp: 100, food: 100, stamina: 100, oxygen: 100, inVehicle: null, vehicleView: '3rd_back', view: '1st', pistolReloadTimer: 0 };

let triggerCoordPick = false;
let lastPickedCoord = null;
let coordPickerActive = false;
let pickX_screen = 0;
let pickY_screen = 0;

let freecam = false;
let freecamX = 0;
let freecamY = 0;
let freecamZ = 0;
let freecamAngle = 0;
let freecamPitch = 0;
