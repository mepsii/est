// --- World Generation & Voxel Storage ---
const WATER_LEVEL = 42; // Global Sea Level
const WATER_HEIGHT = WATER_LEVEL + 0.35; // Lowered to naturally sit below land surface
const biomeCache = new Map(), entityInfoCache = new Map(), mapChunks = new Map();
const chunkMeshes = new Map(), voxelMods = new Map();
const heightCache = new Map(); 
const BIOME_PREC = 2, BIOME_MUL = 20011, ENTITY_MUL = 10007, CHUNK_MUL = 2003;
const MAX_Z = 96; // Massive height limit for deep digging and tall mountains

function getHash(x, y, seed = 1) { let h = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return h - Math.floor(h); }

function getBiome(x, y) {
    const key = ((x * BIOME_PREC) | 0) * BIOME_MUL + ((y * BIOME_PREC) | 0);
    let v = biomeCache.get(key); if (v !== undefined) return v;
    let n = Math.sin(x * 0.005) + Math.cos(y * 0.006) + Math.sin((x - y) * 0.004);
    v = Math.max(0, Math.min(1, (n / 3) + 0.5)); biomeCache.set(key, v); return v;
}

// 1. Base 2.5D Macro Heightmap (Foundation of the world)
function getGridBaseHeightFloat(x, y) {
    let b = getBiome(x, y); 
    let h = 48; // Global surface baseline
    
    // Terrain Feature Generators
    let dunes = (Math.sin(x * 0.015) + Math.cos(y * 0.015)) * 3.0; 
    let plains = (Math.sin(x * 0.02) + Math.cos(y * 0.02)) * 1.5;   
    let hills = (Math.sin(x * 0.012) + Math.cos(y * 0.012 + Math.sin(x * 0.01))) * 10.0; 
    
    let cx = x * 0.008, cy = y * 0.008;
    let cNoise = (Math.sin(cx) + Math.cos(cy)) * 3.0;
    let terraces = (cNoise - Math.sin(cNoise * Math.PI) * 0.1) * 10.0 + 4.0; 
    
    let mx = x * 0.01, my = y * 0.01;
    let mNoise = Math.sin(mx) + Math.cos(my) + Math.sin(mx*2.1 - my*1.3)*0.5;
    let mountains = Math.pow(Math.max(0, mNoise), 2.0) * 22.0 + 10.0;

    // Smooth Biome Blending Matrix
    if (b < 0.20) { h += dunes; } 
    else if (b < 0.35) { let t = (b - 0.20) / 0.15; t = t * t * (3 - 2 * t); h += dunes * (1 - t) + plains * t; } 
    else if (b < 0.50) { let t = (b - 0.35) / 0.15; t = t * t * (3 - 2 * t); h += plains * (1 - t) + hills * t; } 
    else if (b < 0.70) { let t = (b - 0.50) / 0.20; t = t * t * (3 - 2 * t); h += hills * (1 - t) + terraces * t; } 
    else if (b < 0.85) { let t = (b - 0.70) / 0.15; t = t * t * (3 - 2 * t); h += terraces * (1 - t) + mountains * t; } 
    else { h += mountains; }

    // Natural River/Trench Carving
    let rx = x * 0.005, ry = y * 0.005;
    let riverNoise = Math.sin(rx) + Math.cos(ry);
    let riverDepth = Math.max(0, 1.0 - Math.abs(riverNoise) * 3.0);
    h -= Math.pow(riverDepth, 2.0) * 14.0;
    
    // Lakes and Oceans
    let wx = x * 0.004, wy = y * 0.004;
    let waterNoise = Math.sin(wx) + Math.cos(wy) + Math.sin((wx - wy) * 0.003);
    if (waterNoise > 1.2) {
        h -= (waterNoise - 1.2) * 16.0; // Oceans
    } else if (waterNoise > 0.7) {
        h -= (waterNoise - 0.7) * 9.0; // Lakes
    }

    return Math.max(2, h); // Protect bedrock layer
}

function getGridBaseHeight(x, y) { return Math.floor(getGridBaseHeightFloat(x, y)); }
function getGridBaseHeightInt(x, y) {
    const key = (x | 0) * 10000 + (y | 0);
    let v = heightCache.get(key); if (v !== undefined) return v;
    v = getGridBaseHeight(x, y); heightCache.set(key, v); return v;
}

// 2. True 3D Density Engine (For perfectly smooth Caves & Overhangs)
function getDensity(x, y, z) {
    if (z < 0) return 100.0; // Bedrock
    if (z >= MAX_Z) return -100.0; // Sky limit

    let mod = voxelMods.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
    if (mod !== undefined) return mod === 1 ? 100.0 : -100.0; 

    let baseH = getGridBaseHeightFloat(x, y);
    let density = baseH - z; 
    let depthFromSurface = baseH - z;

    // Removed the "safeWeight" crater logic here!
    
    let b = getBiome(x, y);
    let warpAmp = (b > 0.65) ? 6.0 : 1.5; 
    let warp3D = Math.sin(x*0.02 + y*0.015) + Math.cos(y*0.02 + z*0.015) + Math.sin(x*0.015 - z*0.02);
    
    // Apply 3D terrain warps across the whole world normally
    density += warp3D * warpAmp;

    if (depthFromSurface > 12) { 
        let cx = x * 0.04, cy = y * 0.04, cz = z * 0.04;
        let c1 = Math.sin(cx) + Math.cos(cy) + Math.sin(cz);
        let c2 = Math.cos(cx*1.2 - cy) + Math.sin(cy*1.2 + cz) + Math.cos(cz*1.2);
        let tube = Math.abs(c1 * c2);
        
        if (tube < 0.05) { 
            let caveHollow = Math.pow((0.05 - tube) * 20.0, 2.0); 
            density -= caveHollow; 
        }
    }
    
    return density;
}

function getSolidFast(x, y, z) { return getDensity(x, y, z) > 0; }
function getSolid(x, y, z) { return getSolidFast(x, y, z); }

function getVoxelColor(x, y, z) {
    let noise = (Math.sin(x * 12.3) + Math.cos(y * 15.2)) * 4;
    let b = getBiome(x, y);
    
    let isAirAbove = !getSolidFast(x, y, z + 1);
    let depthFromMacro = getGridBaseHeightFloat(x, y) - z;

    if (isAirAbove && depthFromMacro < 6.0) {
        if (z > 72 + (Math.sin(x*0.1)+Math.cos(y*0.1))*3) return { r: 240+noise|0, g: 245+noise|0, b: 255+noise|0 };
        // Beaches near water level
        if (z <= WATER_HEIGHT + 1.5) return { r: 210+noise|0, g: 200+noise|0, b: 150+noise|0 };
        
        let r, g, bColor;
        if (b < 0.20) { r = 220; g = 195; bColor = 130; } 
        else if (b < 0.45) { r = 85; g = 150; bColor = 65; } 
        else if (b < 0.65) { r = 55; g = 120; bColor = 45; } 
        else if (b < 0.80) { r = 175; g = 85; bColor = 50; } 
        else { r = 115; g = 115; bColor = 120; } 
        
        return { r: Math.max(0, Math.min(255, r + noise)) | 0, g: Math.max(0, Math.min(255, g + noise)) | 0, b: Math.max(0, Math.min(255, bColor + noise)) | 0 };
    }
    
    if (depthFromMacro < 12.0) {
        if (getGridBaseHeightInt(x, y) > 72) return {r: 105, g: 105, b: 110}; 
        if (b < 0.20) return {r: 200, g: 175, b: 110}; 
        if (b >= 0.65 && b < 0.80) return {r: 140, g: 70, b: 35}; 
        return {r: 95, g: 65, b: 35}; 
    }
    
    let v = 90 + (Math.sin(x*0.5)*Math.cos(y*0.5) + Math.sin(z*0.5))*8; 
    return {r: v|0, g: (v*0.95)|0, b: (v*0.9)|0}; 
}

// Gradient Descent Mesh Smoothing: Replaces jagged cubes with perfectly smooth contours
function getSmoothVertex(cx, cy, cz) {
    let solidCount = 0, sumX = 0, sumY = 0, sumZ = 0, hasMod = false;
    
    for(let dx=-1; dx<=0; dx++) {
        for(let dy=-1; dy<=0; dy++) {
            for(let dz=-1; dz<=0; dz++) {
                let mx = cx+dx, my = cy+dy, mz = cz+dz;
                let mod = voxelMods.get(`${mx},${my},${mz}`);
                let isSolid = false;
                if (mod !== undefined) { isSolid = mod === 1; hasMod = true; } 
                else { isSolid = getSolidFast(mx, my, mz); }
                
                if (isSolid) {
                    solidCount++; sumX += (mx+0.5); sumY += (my+0.5); sumZ += (mz+0.5);
                }
            }
        }
    }
    if (solidCount === 0 || solidCount === 8) return {x: cx, y: cy, z: cz};
    
    if (hasMod) {
        let w = 0.65;
        return { x: cx + (sumX/solidCount - cx)*w, y: cy + (sumY/solidCount - cy)*w, z: cz + (sumZ/solidCount - cz)*w };
    }

    let d0 = getDensity(cx, cy, cz);
    let gx = (getDensity(cx + 1, cy, cz) - getDensity(cx - 1, cy, cz)) * 0.5;
    let gy = (getDensity(cx, cy + 1, cz) - getDensity(cx, cy - 1, cz)) * 0.5;
    let gz = (getDensity(cx, cy, cz + 1) - getDensity(cx, cy, cz - 1)) * 0.5;
    
    let magSq = gx*gx + gy*gy + gz*gz;
    if (magSq > 0.001) {
        let t = d0 / magSq;
        let ox = -t * gx, oy = -t * gy, oz = -t * gz;
        let maxOffset = 0.55;
        ox = Math.max(-maxOffset, Math.min(maxOffset, ox));
        oy = Math.max(-maxOffset, Math.min(maxOffset, oy));
        oz = Math.max(-maxOffset, Math.min(maxOffset, oz));
        return { x: cx + ox, y: cy + oy, z: cz + oz };
    }

    let w = 0.65;
    return { x: cx + (sumX/solidCount - cx)*w, y: cy + (sumY/solidCount - cy)*w, z: cz + (sumZ/solidCount - cz)*w };
}

function buildChunkMesh(cx, cy) {
    let faces =[];

    // Geometrically stitches the flat water plane onto the sloped beach polygons perfectly 
    function getWaterVertex(px, py, h) {
        // Search vertical column to find exact intersection with terrain face
        for (let cz = Math.floor(h) - 1; cz <= Math.floor(h) + 1; cz++) {
            let svBot = getSmoothVertex(px, py, cz);
            let svTop = getSmoothVertex(px, py, cz + 1);
            
            let dz = svTop.z - svBot.z;
            if (dz > 0.0001) {
                let t = (h - svBot.z) / dz;
                if (t >= 0 && t <= 1) {
                    return { 
                        x: svBot.x + (svTop.x - svBot.x) * t, 
                        y: svBot.y + (svTop.y - svBot.y) * t, 
                        z: h // Enforce absolutely flat water
                    };
                }
            }
        }
        // If terrain doesn't cross the water plane here, return perfectly flat grid coords
        return { x: px, y: py, z: h };
    }

    function addFace(x, y, z, p1, p2, p3, p4, nx, ny, nz, shade, col, isWater = false) {
        faces.push({ 
            pts: [ 
                isWater ? getWaterVertex(p1[0], p1[1], p1[2]) : getSmoothVertex(p1[0], p1[1], p1[2]), 
                isWater ? getWaterVertex(p2[0], p2[1], p2[2]) : getSmoothVertex(p2[0], p2[1], p2[2]), 
                isWater ? getWaterVertex(p3[0], p3[1], p3[2]) : getSmoothVertex(p3[0], p3[1], p3[2]), 
                isWater ? getWaterVertex(p4[0], p4[1], p4[2]) : getSmoothVertex(p4[0], p4[1], p4[2]) 
            ], 
            cx: x+0.5+nx*0.5, cy: y+0.5+ny*0.5, cz: z+0.5+nz*0.5, norm: {x:nx, y:ny, z:nz}, col: col, shade: shade, isWater: isWater
        });
    }

    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            for (let z = 0; z < MAX_Z; z++) { // Traverse full expanded height
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
            
            // Single plane of water dynamically stitched to land contours 
            if (getGridBaseHeightFloat(x + 0.5, y + 0.5) < WATER_HEIGHT + 0.6) {
                let wCol = {r: 30, g: 110, b: 200, a: 0.6}; 
                addFace(x, y, WATER_LEVEL, [x, y, WATER_HEIGHT], [x+1, y, WATER_HEIGHT], [x+1, y+1, WATER_HEIGHT], [x, y+1, WATER_HEIGHT], 0, 0, 1, 1.0, wCol, true);
                addFace(x, y, WATER_LEVEL, [x, y+1, WATER_HEIGHT], [x+1, y+1, WATER_HEIGHT], [x+1, y, WATER_HEIGHT], [x, y, WATER_HEIGHT], 0, 0, -1, 0.8, wCol, true);
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
                if (Math.hypot(x-cx, y-cy, z-cz) <= radius && z >= 0 && z < MAX_Z) {
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

// Raycast downwards from max height to guarantee safe spawn floor
let startZ = MAX_Z - 1;
while (startZ > 0 && !getSolidFast(0, 0, startZ)) startZ--;
player.x = 0; player.y = 0; player.z = startZ + 1.5;

function getEntityAt(gx, gy) {
    if (Math.sqrt(gx*gx + gy*gy) < 20) return null; // Safe Zone Clearance
    if (getGridBaseHeightFloat(gx, gy) <= WATER_HEIGHT + 0.5) return null; // NO WATER ENTITIES

    let biome = getBiome(gx, gy), cluster = Math.sin(gx * 0.1) * Math.cos(gy * 0.12) + Math.sin((gx - gy) * 0.08), h = getHash(gx, gy, 0);
    
    if (biome < 0.20) { 
        if (h < 0.005) return '💀'; if (h < 0.015) return '🌵'; if (h < 0.03) return '🪨'; 
    } else if (biome < 0.45) { 
        if (cluster > 0.4) { if (h < 0.02) return '🌳'; if (h < 0.04) return '🪨'; } 
        else { if (h < 0.08) return '🌻'; if (h < 0.12) return '🌷'; if (h < 0.15) return '🌼'; }
    } else if (biome < 0.65) { 
        if (cluster > 0.2) { if (h < 0.12) return '🌲'; if (h < 0.20) return '🌳'; if (h < 0.23) return '🪨'; } 
        else { if (h < 0.02) return '🌳'; if (h < 0.05) return '🪨'; if (h < 0.08) return '🌹'; }
    } else if (biome < 0.80) { 
        if (cluster > 0.5) { if (h < 0.02) return '🪾'; if (h < 0.06) return '🪨'; if (h < 0.08) return '🌵'; } 
        else { if (h < 0.01) return '💀'; if (h < 0.04) return '🪨'; }
    } else { 
        if (cluster > 0.6) { if (h < 0.04) return '🌲'; if (h < 0.15) return '🪨'; } 
        else { if (h < 0.08) return '🪨'; if (h < 0.10) return '🪾'; }
    }
    return null;
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
    let chunk =[];
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            let info = getEntityBaseInfo(x, y); let entKey = `${x},${y}`;
            if (info && !destroyedEntities.has(entKey)) {
                let floorIntZ = MAX_Z - 1;
                while(floorIntZ >= 0 && !getSolidFast(Math.floor(x + 0.5), Math.floor(y + 0.5), floorIntZ)) floorIntZ--;
                if (floorIntZ < 0) continue; 
                
                chunk.push({ type: 'emoji', emoji: info.emoji, size: info.size, wx: x + 0.5, wy: y + 0.5, h: (floorIntZ + 1.0) - info.plantOffset, hp: 4, entKey: entKey }); 
            }
        }
    }
    
    let chunkHash = getHash(cx, cy, 5), cx_offset = cx * CHUNK_SIZE + CHUNK_SIZE / 2, cy_offset = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
    let bZInt = MAX_Z - 1;
    while (bZInt >= 0 && !getSolidFast(Math.floor(cx_offset), Math.floor(cy_offset), bZInt)) bZInt--;
    let bZ = bZInt + 1.0;

    if (chunkHash > 0.94 && bZ > WATER_HEIGHT + 1.0) {
        let items = new Array(10).fill(null); for(let k = 0; k < Math.floor(getHash(cx, cy, 7) * 4); k++) items[Math.floor(Math.random() * 10)] = { type: 'heal', emoji: '🩹', amount: 25 };
        containers.push({ x: cx_offset, y: cy_offset, z: bZ, emoji: ['🧳', '🎒', '📦'][Math.floor(chunkHash * 1000) % 3], size: 0.9, items: items });
    } else if (chunkHash > 0.88 && chunkHash <= 0.94 && bZ > WATER_HEIGHT + 1.0) {
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
                if (getSolidFast(x, y, z)) return true;
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
    let ents =[], b = activeBuilding, totalW = b.rooms * b.roomW;
    if (activeFloor === 0) ents.push({ emoji: '🚪', x: (b.emoji === '⛺' ? 0.5 : b.roomW / 2), y: (b.emoji === '⛺' ? b.roomH / 2 : 0.5), z: 0.1, size: (b.emoji === '⛺' ? 2.0 : 2.5), action: 'exit', label: (b.emoji === '⛺' ? 'Exit Tent' : 'Exit to Overworld') });
    if (b.floors > 1) ents.push({ emoji: '🪜', x: totalW - 1.5, y: b.roomH - 1.5, z: 0.1, size: 2.5, action: 'stairs', label: (activeFloor === 0 ? 'Go Upstairs' : (activeFloor === b.floors - 1 ? 'Go Downstairs' : 'Use Stairs')) });
    return ents;
}

function getInteriorWalls() {
    let walls =[], b = activeBuilding, totalW = b.rooms * b.roomW, h = b.roomH;
    if (b.emoji === '⛺') {
        let steps = 6; 
        for(let i=0; i<steps; i++) { let x1 = (i/steps)*totalW, x2 = ((i+1)/steps)*totalW; walls.push({ pts: [ {x:x1, y:h/2, z:b.wallH}, {x:x2, y:h/2, z:b.wallH}, {x:x2, y:0, z:0}, {x:x1, y:0, z:0} ], color: patternArmyGreen }); walls.push({ pts: [ {x:x2, y:h/2, z:b.wallH}, {x:x1, y:h/2, z:b.wallH}, {x:x1, y:h, z:0}, {x:x2, y:h, z:0} ], color: patternArmyGreen }); }
        walls.push({ pts: [ {x:0, y:h/2, z:b.wallH}, {x:0, y:0, z:0}, {x:0, y:h, z:0} ], color: patternArmyGreenDark }); walls.push({ pts: [ {x:totalW, y:h/2, z:b.wallH}, {x:totalW, y:h, z:0}, {x:totalW, y:0, z:0} ], color: patternArmyGreenDark }); return walls;
    }
    function addSegWall(p1x, p1y, p2x, p2y, color) { let dx = p2x - p1x, dy = p2y - p1y, len = Math.hypot(dx, dy), steps = Math.ceil(len / 2); for(let i=0; i<steps; i++) walls.push({ p1: {x: p1x + dx*(i/steps), y: p1y + dy*(i/steps)}, p2: {x: p1x + dx*((i+1)/steps), y: p1y + dy*((i+1)/steps)}, color: color }); }
    addSegWall(0, h, totalW, h, '#9c4a4a'); addSegWall(0, 0, totalW, 0, '#8b3a3a'); addSegWall(0, 0, 0, h, '#7a2a2a'); addSegWall(totalW, 0, totalW, h, '#7a2a2a');
    for(let r = 1; r < b.rooms; r++) { let rx = r * b.roomW; addSegWall(rx, 0, rx, h/2 - 1.5, '#6a1a1a'); addSegWall(rx, h/2 + 1.5, rx, h, '#6a1a1a'); } return walls;
}