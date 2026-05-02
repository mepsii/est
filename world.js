// --- World Generation & Map Chunks ---
const elevCache = new Map(), biomeCache = new Map(), entityInfoCache = new Map(), mapChunks = new Map();
const ELEV_PREC = 4, BIOME_PREC = 2, BIOME_MUL = 20011, ELEV_MUL = 50021, ENTITY_MUL = 10007, CHUNK_MUL = 2003;

function getHash(x, y, seed = 1) { let h = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return h - Math.floor(h); }
function getBiome(x, y) {
    const key = ((x * BIOME_PREC) | 0) * BIOME_MUL + ((y * BIOME_PREC) | 0);
    let v = biomeCache.get(key); if (v !== undefined) return v;
    let n = Math.sin(x * 0.01) + Math.cos(y * 0.012) + Math.sin((x - y) * 0.008);
    v = Math.max(0, Math.min(1, (n / 3) + 0.5)); biomeCache.set(key, v); return v;
}
function getCluster(x, y) { return Math.sin(x * 0.1) * Math.cos(y * 0.12) + Math.sin((x - y) * 0.08); }
function getElevation(x, y) {
    const key = ((x * ELEV_PREC) | 0) * ELEV_MUL + ((y * ELEV_PREC) | 0);
    let v = elevCache.get(key); if (v !== undefined) return v;
    let biome = getBiome(x, y), nx = x * 0.03, ny = y * 0.03;
    let n1 = Math.sin(nx) + Math.cos(ny) + Math.sin(nx * 0.8 - ny * 1.2); 
    let stepped = Math.floor(n1), fract = n1 - stepped;
    let cliffs = (stepped + fract * fract * (3 - 2 * fract)) * 2.8; 
    let hills = (Math.sin(x * 0.08) + Math.cos(y * 0.09 + Math.sin(x * 0.05))) * 1.2;
    v = (cliffs + hills) * (1.0 - biome * 0.85); elevCache.set(key, v);
    if (elevCache.size > 20000) { elevCache.clear(); biomeCache.clear(); } return v;
}

function getEntityAt(gx, gy) {
    let biome = getBiome(gx, gy), cluster = getCluster(gx, gy), h = getHash(gx, gy, 0);
    if (biome < 0.35) { if (cluster > 0.4) { if (h < 0.08) return '🌲'; if (h < 0.14) return '🌳'; if (h < 0.18) return '🪨'; } else { if (h < 0.01) return '🌳'; if (h < 0.03) return '🪨'; if (h < 0.06) return '🌻'; if (h < 0.08) return '🌷'; } } 
    else if (biome < 0.65) { if (h < 0.01) return '🌳'; if (h < 0.02) return '🪾'; if (h < 0.04) return '🪨'; if (h < 0.07) return '🌻'; if (h < 0.10) return '🌼'; if (h < 0.12) return '🌹'; } 
    else { if (cluster > 0.6) { if (h < 0.015) return '🌵'; if (h < 0.03) return '🪾'; if (h < 0.05) return '🪨'; } else { if (h < 0.002) return '💀'; if (h < 0.006) return '🪨'; if (h < 0.009) return '🪾'; if (h < 0.015) return '🌵'; } } return null;
}

function getEntityBaseInfo(x, y) {
    const key = (x | 0) * ENTITY_MUL + (y | 0); if (entityInfoCache.has(key)) return entityInfoCache.get(key);
    let em = getEntityAt(x, y), result = null;
    if (em) {
        let v = getHash(x, y, 10), finalSize = ENTITIES_DATA[em].baseSize, solid = ENTITIES_DATA[em].solid, plantOffset = 0.1; 
        if (em === '🪨') { if (v < 0.4) { finalSize = 0.25; solid = false; plantOffset = 0.05; } else if (v > 0.8) { finalSize = 1.6; plantOffset = 0.3; } else { finalSize = 0.7; plantOffset = 0.15; } } 
        else if (TREE_EMOJIS.has(em)) { finalSize += (v - 0.5) * 3.5; plantOffset = 0.4; } else if (em === '🌵') { finalSize += (v - 0.5) * 0.6; plantOffset = 0.2; } else if (FLOWER_EMOJIS.has(em)) { finalSize += (v - 0.5) * 0.3; plantOffset = 0.05; }
        result = { emoji: em, size: finalSize, solid, plantOffset };
    }
    entityInfoCache.set(key, result); return result;
}

function getMapChunk(cx, cy) {
    const key = cx * CHUNK_MUL + cy; if (mapChunks.has(key)) return mapChunks.get(key);
    let chunk = [];
    for (let x = cx * MAP_CHUNK_SIZE; x < (cx + 1) * MAP_CHUNK_SIZE; x++) {
        for (let y = cy * MAP_CHUNK_SIZE; y < (cy + 1) * MAP_CHUNK_SIZE; y++) {
            let info = getEntityBaseInfo(x, y); let entKey = `${x},${y}`;
            if (info && !destroyedEntities.has(entKey)) chunk.push({ type: 'emoji', emoji: info.emoji, size: info.size, wx: x + 0.5, wy: y + 0.5, h: getElevation(x + 0.5, y + 0.5) - info.plantOffset, hp: 4, entKey: entKey }); 
        }
    }
    let chunkHash = getHash(cx, cy, 5), cx_offset = cx * MAP_CHUNK_SIZE + MAP_CHUNK_SIZE / 2, cy_offset = cy * MAP_CHUNK_SIZE + MAP_CHUNK_SIZE / 2;
    if (chunkHash > 0.94 && !isSolid(cx_offset, cy_offset)) {
        let items = new Array(10).fill(null); for(let k = 0; k < Math.floor(getHash(cx, cy, 7) * 4); k++) items[Math.floor(Math.random() * 10)] = { type: 'heal', emoji: '🩹', amount: 25 };
        containers.push({ x: cx_offset, y: cy_offset, z: getElevation(cx_offset, cy_offset), emoji: ['🧳', '🎒', '📦'][Math.floor(chunkHash * 1000) % 3], size: 0.9, items: items });
    } else if (chunkHash > 0.88 && chunkHash <= 0.94 && !isSolid(cx_offset, cy_offset)) {
        let def = ANIMAL_TYPES[Math.floor(chunkHash * 1000) % ANIMAL_TYPES.length];
        animals.push({ x: cx_offset, y: cy_offset, z: getElevation(cx_offset, cy_offset), emoji: def.emoji, size: def.size, hp: def.hp, speed: def.speed, dead: false, drop: def.drop, moveAngle: Math.random() * Math.PI * 2, moveTimer: 0 });
    }
    mapChunks.set(key, chunk); return chunk;
}

// --- Collisions ---
function checkSegCyl(px, py, pz, cx, cy, cz, ex, ey, ez, esize, rad) {
    let dx = cx - px, dy = cy - py, len2 = dx*dx + dy*dy, t = 0;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((ex - px) * dx + (ey - py) * dy) / len2));
    let closeX = px + t * dx, closeY = py + t * dy;
    if (Math.hypot(closeX - ex, closeY - ey) < rad) {
        let closeZ = pz + t * (cz - pz);
        if (closeZ > ez && closeZ < ez + esize) return closeZ;
    } return false;
}

function isSolid(x, y) {
    if (gameState === 'interior') {
        let totalW = activeBuilding.rooms * activeBuilding.roomW, h = activeBuilding.roomH;
        if (activeBuilding.emoji === '⛺') {
            if (x < 0.2 || x > totalW - 0.2 || y < 0.2 || y > h - 0.2) return true;
            if (Math.abs(y - h/2) > (h/2) - 0.6) return true; return false;
        }
        if (x < 0.2 || x > totalW - 0.2 || y < 0.2 || y > h - 0.2) return true;
        for(let r = 1; r < activeBuilding.rooms; r++) if (Math.abs(x - r * activeBuilding.roomW) < 0.3 && (y < h/2 - 1.5 || y > h/2 + 1.5)) return true;
        return false;
    }
    let key = `${Math.floor(x)},${Math.floor(y)}`; if (destroyedEntities.has(key)) return false;
    let info = getEntityBaseInfo(Math.floor(x), Math.floor(y)); return info ? info.solid : false;
}

// --- Buildings & Interiors ---
function enterBuilding(b) {
    savedOverworld = { x: player.x, y: player.y, z: player.z, angle: player.angle, pitch: player.pitch };
    activeBuilding = b; activeFloor = 0; gameState = 'interior'; projectiles.length = 0;
    if (b.emoji === '⛺') { player.x = 2.0; player.y = b.roomH / 2; player.z = player.baseHeight; player.angle = 0; } 
    else { player.x = b.roomW / 2; player.y = 2.5; player.z = player.baseHeight; player.angle = Math.PI / 2; }
    player.pitch = 0; player.vz = 0;
}

function exitBuilding() {
    player.x = savedOverworld.x; player.y = savedOverworld.y; player.z = savedOverworld.z; player.angle = savedOverworld.angle; player.pitch = savedOverworld.pitch;
    player.vz = 0; gameState = 'overworld'; activeBuilding = null; projectiles.length = 0;
}

function changeFloor(dir) { activeFloor += dir; player.x = activeBuilding.rooms * activeBuilding.roomW - 1.5; player.y = activeBuilding.roomH - 3.5; player.angle = -Math.PI/2; }

function getInteriorEntities() {
    let ents = [], b = activeBuilding, totalW = b.rooms * b.roomW;
    if (activeFloor === 0) ents.push({ emoji: '🚪', x: (b.emoji === '⛺' ? 0.5 : b.roomW / 2), y: (b.emoji === '⛺' ? b.roomH / 2 : 0.5), z: 0.1, size: (b.emoji === '⛺' ? 2.0 : 2.5), action: 'exit', label: (b.emoji === '⛺' ? 'Exit Tent' : 'Exit to Overworld') });
    if (b.floors > 1) ents.push({ emoji: '🪜', x: totalW - 1.5, y: b.roomH - 1.5, z: 0.1, size: 2.5, action: 'stairs', label: (activeFloor === 0 ? 'Go Upstairs' : (activeFloor === b.floors - 1 ? 'Go Downstairs' : 'Use Stairs')) });
    return ents;
}

function getInteriorWalls() {
    let walls = [], b = activeBuilding, totalW = b.rooms * b.roomW, h = b.roomH;
    if (b.emoji === '⛺') {
        let steps = 6; 
        for(let i=0; i<steps; i++) {
            let x1 = (i/steps)*totalW, x2 = ((i+1)/steps)*totalW;
            walls.push({ pts: [ {x:x1, y:h/2, z:b.wallH}, {x:x2, y:h/2, z:b.wallH}, {x:x2, y:0, z:0}, {x:x1, y:0, z:0} ], color: patternArmyGreen });
            walls.push({ pts: [ {x:x2, y:h/2, z:b.wallH}, {x:x1, y:h/2, z:b.wallH}, {x:x1, y:h, z:0}, {x:x2, y:h, z:0} ], color: patternArmyGreen });
        }
        walls.push({ pts: [ {x:0, y:h/2, z:b.wallH}, {x:0, y:0, z:0}, {x:0, y:h, z:0} ], color: patternArmyGreenDark });
        walls.push({ pts: [ {x:totalW, y:h/2, z:b.wallH}, {x:totalW, y:h, z:0}, {x:totalW, y:0, z:0} ], color: patternArmyGreenDark });
        return walls;
    }
    function addSegWall(p1x, p1y, p2x, p2y, color) { let dx = p2x - p1x, dy = p2y - p1y, len = Math.hypot(dx, dy), steps = Math.ceil(len / 2); for(let i=0; i<steps; i++) walls.push({ p1: {x: p1x + dx*(i/steps), y: p1y + dy*(i/steps)}, p2: {x: p1x + dx*((i+1)/steps), y: p1y + dy*((i+1)/steps)}, color: color }); }
    addSegWall(0, h, totalW, h, '#9c4a4a'); addSegWall(0, 0, totalW, 0, '#8b3a3a'); addSegWall(0, 0, 0, h, '#7a2a2a'); addSegWall(totalW, 0, totalW, h, '#7a2a2a');
    for(let r = 1; r < b.rooms; r++) { let rx = r * b.roomW; addSegWall(rx, 0, rx, h/2 - 1.5, '#6a1a1a'); addSegWall(rx, h/2 + 1.5, rx, h, '#6a1a1a'); }
    return walls;
}