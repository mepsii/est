// --- World Generation & Voxel Storage ---
const biomeCache = new Map(), entityInfoCache = new Map(), mapChunks = new Map();
const chunkMeshes = new Map(), voxelMods = new Map();
const heightCache = new Map(); 
const BIOME_PREC = 2, BIOME_MUL = 20011, ENTITY_MUL = 10007, CHUNK_MUL = 2003;

function getHash(x, y, seed = 1) { let h = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return h - Math.floor(h); }

function getBiome(x, y) {
    const key = ((x * BIOME_PREC) | 0) * BIOME_MUL + ((y * BIOME_PREC) | 0);
    let v = biomeCache.get(key); if (v !== undefined) return v;
    let n = Math.sin(x * 0.012) + Math.cos(y * 0.015) + Math.sin((x - y) * 0.008);
    v = Math.max(0, Math.min(1, (n / 3) + 0.5)); biomeCache.set(key, v); return v;
}

// Ultra-smooth differentiable height generation for organic voxel surfaces
function getGridBaseHeightFloat(x, y) {
    // 1. Guaranteed Safe Spawn Area at (0,0)
    let dist = Math.sqrt(x*x + y*y);
    let safeWeight = Math.max(0, 1.0 - (dist / 35.0)); // 1.0 at center, fades to 0 at distance 35
    safeWeight = safeWeight * safeWeight * (3 - 2 * safeWeight); // Smoothstep blending
    
    let b = getBiome(x, y); 
    let h = 18; // Global baseline
    
    // Plains - Low frequency, gentle rolling
    let plains = (Math.sin(x * 0.03) + Math.cos(y * 0.03)) * 1.5;
    
    // Hills - Medium frequency, organic overlap
    let hills = (Math.sin(x * 0.02) + Math.cos(y * 0.02 + Math.sin(x * 0.015))) * 6;
    
    // Mountains - Smoothed peaks using squared positive noise
    let mx = x * 0.015, my = y * 0.015;
    let mNoise = Math.sin(mx) + Math.cos(my) + Math.sin(mx*2.1 - my*1.3)*0.5;
    let mountains = Math.pow(Math.max(0, mNoise), 2.0) * 7.0;
    
    // Mesas/Terraces - Smooth stepping sine wave
    let cx = x * 0.012, cy = y * 0.012;
    let cNoise = (Math.sin(cx) + Math.cos(cy)) * 4.0;
    let terraces = (cNoise - Math.sin(cNoise * Math.PI) * 0.25) * 4.0;

    // Smooth Biome Blending Matrix
    if (b < 0.3) {
        h += plains;
    } else if (b < 0.5) {
        let t = (b - 0.3) / 0.2; t = t * t * (3 - 2 * t);
        h += plains * (1 - t) + hills * t;
    } else if (b < 0.7) {
        let t = (b - 0.5) / 0.2; t = t * t * (3 - 2 * t);
        h += hills * (1 - t) + terraces * t;
    } else {
        let t = Math.min(1.0, (b - 0.7) / 0.3); t = t * t * (3 - 2 * t);
        h += terraces * (1 - t) + mountains * t;
    }

    // Natural River/Trench Carving (Smooth valleys)
    let rx = x * 0.008, ry = y * 0.008;
    let riverNoise = Math.sin(rx) + Math.cos(ry);
    let riverDepth = Math.max(0, 1.0 - Math.abs(riverNoise) * 3.5);
    h -= Math.pow(riverDepth, 2.0) * 12.0;

    // Apply the flattened safe spawn zone overriding all generation near (0,0)
    h = (20 * safeWeight) + (h * (1 - safeWeight));

    return Math.max(2, h); // Keep above bedrock
}

function getGridBaseHeight(x, y) {
    return Math.floor(getGridBaseHeightFloat(x, y));
}

function getGridBaseHeightInt(x, y) {
    const key = (x | 0) * 10000 + (y | 0);
    let v = heightCache.get(key);
    if (v !== undefined) return v;
    v = getGridBaseHeight(x, y);
    heightCache.set(key, v);
    return v;
}

function getSolid(x, y, z) {
    if (z < 0) return true; // Bedrock
    if (z >= 64) return false; // Max height expansion
    let mod = voxelMods.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
    if (mod !== undefined) return mod === 1;
    
    let baseH = getGridBaseHeightInt(x, y);
    if (z > baseH) return false;

    // Organic Cave Systems
    let depthFromSurface = baseH - z;
    if (depthFromSurface > 4) { // Only form caves 4 blocks deep to prevent surface tearing
        let caveNoise = Math.sin(x * 0.08) * Math.cos(y * 0.08) + Math.sin(z * 0.12);
        if (caveNoise > 0.6) return false; // Hollow out
    }

    return true;
}

// Fast mirror for mesher
function getSolidFast(x, y, z) { return getSolid(x, y, z); }

function getVoxelColor(x, y, z) {
    let baseHInt = getGridBaseHeightInt(x, y);
    let noise = (Math.sin(x * 12.3) + Math.cos(y * 15.2)) * 4;
    
    // Surface
    if (z >= baseHInt) {
        // Snow caps on high mountains
        if (z > 38 + (Math.sin(x*0.1)+Math.cos(y*0.1))*2) return { r: 240+noise|0, g: 245+noise|0, b: 255+noise|0 };

        let b = getBiome(x, y);
        let r, g, bColor;
        
        if (b < 0.3) { // Plains
            r = 70; g = 150; bColor = 50;
        } else if (b < 0.5) { // Hills / Forest
            r = 50; g = 120; bColor = 40;
        } else if (b < 0.7) { // Mesas (Terracotta/Red Dirt)
            r = 180; g = 100; bColor = 50;
        } else { // Mountains (Rock)
            r = 110; g = 115; bColor = 120;
        }
        
        return { r: Math.max(0, Math.min(255, r + noise)) | 0, g: Math.max(0, Math.min(255, g + noise)) | 0, b: Math.max(0, Math.min(255, bColor + noise)) | 0 };
    }
    
    // Sub-surface Dirt Layer
    if (z >= baseHInt - 3) {
        if (baseHInt > 38) return {r: 100, g: 100, b: 105}; // Stone under snow
        let b = getBiome(x, y);
        if (b >= 0.5 && b < 0.7) return {r: 150, g: 80, b: 40}; // Red dirt under mesa
        return {r: 90, g: 60, b: 30}; // Normal Dirt Layer
    }
    
    // Deep Stone Layer (Caves)
    let v = 90 + (Math.sin(x*0.5)*Math.cos(y*0.5) + Math.sin(z*0.5))*8; 
    return {r: v|0, g: (v*0.95)|0, b: (v*0.9)|0}; 
}

function getSmoothVertex(cx, cy, cz) {
    let solidCount = 0, sumX = 0, sumY = 0, sumZ = 0, hasMod = false, solidsBelow = 0, solidsAbove = 0;
    for(let dx=-1; dx<=0; dx++) {
        for(let dy=-1; dy<=0; dy++) {
            for(let dz=-1; dz<=0; dz++) {
                let isSolid = false, mod = voxelMods.get(`${cx+dx},${cy+dy},${cz+dz}`);
                if (mod !== undefined) { isSolid = mod === 1; hasMod = true; } 
                else { isSolid = getSolidFast(cx+dx, cy+dy, cz+dz); }
                
                if (isSolid) {
                    solidCount++; sumX += (cx+dx+0.5); sumY += (cy+dy+0.5); sumZ += (cz+dz+0.5);
                    if (dz === -1) solidsBelow++; if (dz === 0) solidsAbove++;
                }
            }
        }
    }
    if (solidCount === 0 || solidCount === 8) return {x: cx, y: cy, z: cz};
    
    let w = 0.65;
    let nx = cx + (sumX/solidCount - cx)*w, ny = cy + (sumY/solidCount - cy)*w, nz = cz + (sumZ/solidCount - cz)*w;

    // ONLY apply floating point snapping if this vertex is the actual top surface (prevents glitchy cave tearing)
    let baseFloat = getGridBaseHeightFloat(cx, cy);
    if (!hasMod && solidsAbove === 0 && solidsBelow > 0 && Math.abs(cz - baseFloat) < 1.5) {
        nz = Math.max(cz - 1, Math.min(cz, baseFloat));
    }
    return { x: nx, y: ny, z: nz };
}

function buildChunkMesh(cx, cy) {
    let faces = [];
    function addFace(x, y, z, p1, p2, p3, p4, nx, ny, nz, shade, col) {
        faces.push({ 
            pts: [ getSmoothVertex(p1[0], p1[1], p1[2]), getSmoothVertex(p2[0], p2[1], p2[2]), getSmoothVertex(p3[0], p3[1], p3[2]), getSmoothVertex(p4[0], p4[1], p4[2]) ], 
            cx: x+0.5+nx*0.5, cy: y+0.5+ny*0.5, cz: z+0.5+nz*0.5, norm: {x:nx, y:ny, z:nz}, col: col, shade: shade 
        });
    }

    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            // Process up to 63 to encompass the new massive mountains and structures
            for (let z = 0; z <= 63; z++) {
                if (getSolidFast(x, y, z)) {
                    let col = getVoxelColor(x, y, z);
                    if (!getSolidFast(x, y, z+1)) addFace(x, y, z, [x, y, z+1], [x+1, y, z+1], [x+1, y+1, z+1], [x, y+1, z+1], 0, 0, 1, 1.0, col);
                    if (!getSolidFast(x, y, z-1)) addFace(x, y, z, [x, y+1, z], [x+1, y+1, z], [x+1, y, z], [x, y, z], 0, 0, -1, 0.3, col);
                    if (!getSolidFast(x+1, y, z)) addFace(x, y, z, [x+1, y, z], [x+1, y+1, z], [x+1, y+1, z+1], [x+1, y, z+1], 1, 0, 0, 0.7, col);
                    if (!getSolidFast(x-1, y, z)) addFace(x, y, z, [x, y+1, z], [x, y, z], [x, y, z+1], [x, y+1, z+1], -1, 0, 0, 0.5, col);
                    if (!getSolidFast(x, y+1, z)) addFace(x, y, z, [x+1, y+1, z], [x, y+1, z], [x, y+1, z+1], [x+1, y+1, z+1], 0, 1, 0, 0.8, col);
                    if (!getSolidFast(x, y-1, z)) addFace(x, y, z, [x, y, z], [x+1, y, z], [x+1, y, z+1], [x, y, z+1], 0, -1, 0, 0.6, col);
                }
            }
        }
    }
    return faces;
}

function getChunkMesh(cx, cy) {
    let key = `${cx},${cy}`;
    if (!chunkMeshes.has(key)) chunkMeshes.set(key, buildChunkMesh(cx, cy));
    return chunkMeshes.get(key);
}

function modifyTerrain(cx, cy, cz, radius, amount) {
    let modifiedChunks = new Set();
    for(let x = Math.floor(cx-radius); x <= Math.ceil(cx+radius); x++) {
        for(let y = Math.floor(cy-radius); y <= Math.ceil(cy+radius); y++) {
            for(let z = Math.floor(cz-radius); z <= Math.ceil(cz+radius); z++) {
                if (Math.hypot(x-cx, y-cy, z-cz) <= radius && z >= 0 && z < 64) {
                    voxelMods.set(`${x},${y},${z}`, amount);
                    modifiedChunks.add(`${Math.floor(x/CHUNK_SIZE)},${Math.floor(y/CHUNK_SIZE)}`);
                }
            }
        }
    }
    modifiedChunks.forEach(key => {
        let [mcx, mcy] = key.split(',').map(Number);
        chunkMeshes.delete(`${mcx},${mcy}`);
        chunkMeshes.delete(`${mcx+1},${mcy}`); chunkMeshes.delete(`${mcx-1},${mcy}`);
        chunkMeshes.delete(`${mcx},${mcy+1}`); chunkMeshes.delete(`${mcx},${mcy-1}`);
    });
}

// Foolproof safe spawn configuration (Scanning Top-Down to find floor)
let startZ = 63;
while (startZ > 0 && !getSolid(0, 0, startZ)) startZ--;
player.x = 0; player.y = 0; player.z = startZ + 1.5;

function getEntityAt(gx, gy) {
    // Entities don't spawn naturally inside the massive safe zone
    if (Math.sqrt(gx*gx + gy*gy) < 20) return null;

    let biome = getBiome(gx, gy), cluster = Math.sin(gx * 0.1) * Math.cos(gy * 0.12) + Math.sin((gx - gy) * 0.08), h = getHash(gx, gy, 0);
    if (biome < 0.3) { if (cluster > 0.4) { if (h < 0.08) return '🌲'; if (h < 0.14) return '🌳'; if (h < 0.18) return '🪨'; } else { if (h < 0.01) return '🌳'; if (h < 0.03) return '🪨'; if (h < 0.06) return '🌻'; if (h < 0.08) return '🌷'; } } 
    else if (biome < 0.7) { if (h < 0.01) return '🌳'; if (h < 0.02) return '🪾'; if (h < 0.04) return '🪨'; if (h < 0.07) return '🌻'; if (h < 0.10) return '🌼'; if (h < 0.12) return '🌹'; } 
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
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            let info = getEntityBaseInfo(x, y); let entKey = `${x},${y}`;
            if (info && !destroyedEntities.has(entKey)) {
                let baseFZ = getGridBaseHeightFloat(x + 0.5, y + 0.5);
                let floorIntZ = Math.floor(baseFZ);
                
                // Account for steep ravines dropping entities downwards perfectly
                if (!getSolid(Math.floor(x + 0.5), Math.floor(y + 0.5), floorIntZ)) {
                    while(floorIntZ >= 0 && !getSolid(Math.floor(x + 0.5), Math.floor(y + 0.5), floorIntZ)) floorIntZ--;
                    if (floorIntZ < 0) continue; // Out of bounds, don't spawn
                    baseFZ = floorIntZ + 1.0; 
                }

                chunk.push({ type: 'emoji', emoji: info.emoji, size: info.size, wx: x + 0.5, wy: y + 0.5, h: baseFZ - info.plantOffset, hp: 4, entKey: entKey }); 
            }
        }
    }
    
    // Chests & Animals drop into world cleanly now
    let chunkHash = getHash(cx, cy, 5), cx_offset = cx * CHUNK_SIZE + CHUNK_SIZE / 2, cy_offset = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
    let bZ = getGridBaseHeightFloat(cx_offset, cy_offset);
    let bZInt = Math.floor(bZ);
    if (!getSolid(Math.floor(cx_offset), Math.floor(cy_offset), bZInt)) {
        while (bZInt >= 0 && !getSolid(Math.floor(cx_offset), Math.floor(cy_offset), bZInt)) bZInt--;
        bZ = bZInt + 1.0;
    }

    if (chunkHash > 0.94 && getSolid(Math.floor(cx_offset), Math.floor(cy_offset), Math.floor(bZ - 1))) {
        let items = new Array(10).fill(null); for(let k = 0; k < Math.floor(getHash(cx, cy, 7) * 4); k++) items[Math.floor(Math.random() * 10)] = { type: 'heal', emoji: '🩹', amount: 25 };
        containers.push({ x: cx_offset, y: cy_offset, z: bZ, emoji: ['🧳', '🎒', '📦'][Math.floor(chunkHash * 1000) % 3], size: 0.9, items: items });
    } else if (chunkHash > 0.88 && chunkHash <= 0.94 && getSolid(Math.floor(cx_offset), Math.floor(cy_offset), Math.floor(bZ - 1))) {
        let def = ANIMAL_TYPES[Math.floor(chunkHash * 1000) % ANIMAL_TYPES.length];
        animals.push({ x: cx_offset, y: cy_offset, z: bZ, emoji: def.emoji, size: def.size, hp: def.hp, speed: def.speed, dead: false, drop: def.drop, moveAngle: Math.random() * Math.PI * 2, moveTimer: 0 });
    }
    mapChunks.set(key, chunk); return chunk;
}

function checkCollision(nx, ny, nz, pHeight = 1.4) {
    if (noclip) return false;
    let r = 0.25; 
    for (let x = Math.floor(nx - r); x <= Math.floor(nx + r); x++) {
        for (let y = Math.floor(ny - r); y <= Math.floor(ny + r); y++) {
            for (let z = Math.floor(nz); z <= Math.floor(nz + pHeight); z++) {
                if (getSolid(x, y, z)) return true;
            }
        }
    }
    return false;
}

function checkSegCyl(px, py, pz, cx, cy, cz, ex, ey, ez, esize, rad) {
    let dx = cx - px, dy = cy - py, len2 = dx*dx + dy*dy, t = 0;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((ex - px) * dx + (ey - py) * dy) / len2));
    if (Math.hypot((px + t * dx) - ex, (py + t * dy) - ey) < rad) {
        let closeZ = pz + t * (cz - pz);
        if (closeZ > ez && closeZ < ez + esize) return closeZ;
    } return false;
}

function isSolid(x, y) {
    if (gameState === 'interior') {
        let totalW = activeBuilding.rooms * activeBuilding.roomW, h = activeBuilding.roomH;
        if (activeBuilding.emoji === '⛺') { if (x < 0.2 || x > totalW - 0.2 || y < 0.2 || y > h - 0.2) return true; return Math.abs(y - h/2) > (h/2) - 0.6; }
        if (x < 0.2 || x > totalW - 0.2 || y < 0.2 || y > h - 0.2) return true;
        for(let r = 1; r < activeBuilding.rooms; r++) if (Math.abs(x - r * activeBuilding.roomW) < 0.3 && (y < h/2 - 1.5 || y > h/2 + 1.5)) return true;
        return false;
    }
    return checkCollision(x, y, player.z);
}

function enterBuilding(b) { savedOverworld = { x: player.x, y: player.y, z: player.z, angle: player.angle, pitch: player.pitch }; activeBuilding = b; activeFloor = 0; gameState = 'interior'; projectiles.length = 0; if (b.emoji === '⛺') { player.x = 2.0; player.y = b.roomH / 2; player.z = player.baseHeight; player.angle = 0; } else { player.x = b.roomW / 2; player.y = 2.5; player.z = player.baseHeight; player.angle = Math.PI / 2; } player.pitch = 0; player.vz = 0; }
function exitBuilding() { player.x = savedOverworld.x; player.y = savedOverworld.y; player.z = savedOverworld.z; player.angle = savedOverworld.angle; player.pitch = savedOverworld.pitch; player.vz = 0; gameState = 'overworld'; activeBuilding = null; projectiles.length = 0; }
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
        for(let i=0; i<steps; i++) { let x1 = (i/steps)*totalW, x2 = ((i+1)/steps)*totalW; walls.push({ pts: [ {x:x1, y:h/2, z:b.wallH}, {x:x2, y:h/2, z:b.wallH}, {x:x2, y:0, z:0}, {x:x1, y:0, z:0} ], color: patternArmyGreen }); walls.push({ pts: [ {x:x2, y:h/2, z:b.wallH}, {x:x1, y:h/2, z:b.wallH}, {x:x1, y:h, z:0}, {x:x2, y:h, z:0} ], color: patternArmyGreen }); }
        walls.push({ pts: [ {x:0, y:h/2, z:b.wallH}, {x:0, y:0, z:0}, {x:0, y:h, z:0} ], color: patternArmyGreenDark }); walls.push({ pts: [ {x:totalW, y:h/2, z:b.wallH}, {x:totalW, y:h, z:0}, {x:totalW, y:0, z:0} ], color: patternArmyGreenDark }); return walls;
    }
    function addSegWall(p1x, p1y, p2x, p2y, color) { let dx = p2x - p1x, dy = p2y - p1y, len = Math.hypot(dx, dy), steps = Math.ceil(len / 2); for(let i=0; i<steps; i++) walls.push({ p1: {x: p1x + dx*(i/steps), y: p1y + dy*(i/steps)}, p2: {x: p1x + dx*((i+1)/steps), y: p1y + dy*((i+1)/steps)}, color: color }); }
    addSegWall(0, h, totalW, h, '#9c4a4a'); addSegWall(0, 0, totalW, 0, '#8b3a3a'); addSegWall(0, 0, 0, h, '#7a2a2a'); addSegWall(totalW, 0, totalW, h, '#7a2a2a');
    for(let r = 1; r < b.rooms; r++) { let rx = r * b.roomW; addSegWall(rx, 0, rx, h/2 - 1.5, '#6a1a1a'); addSegWall(rx, h/2 + 1.5, rx, h, '#6a1a1a'); } return walls;
}