//THIS IS world.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// --- World Generation & Voxel Storage ---
const WORLD_SEED = Math.random() * 10000;
const biomeCache = new Map(), entityInfoCache = new Map(), mapChunks = new Map();
const chunkMeshes = new Map(), voxelMods = new Map(), terrainCache = new Map();
const MAX_Z = 96;

const WATER_LEVEL = 24;
const WATER_HEIGHT = 24.35; 

function hash(x, y, z) {
    let h = (x * 127.1 + y * 311.7 + z * 74.7 + WORLD_SEED) * 43758.5453123;
    return h - Math.floor(h);
}

function lerp(a, b, t) { return a + (b - a) * (3.0 - t * 2.0) * t * t; }

function noise3D(x, y, z) {
    let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    
    let v000 = hash(xi, yi, zi), v100 = hash(xi+1, yi, zi);
    let v010 = hash(xi, yi+1, zi), v110 = hash(xi+1, yi+1, zi);
    let v001 = hash(xi, yi, zi+1), v101 = hash(xi+1, yi, zi+1);
    let v011 = hash(xi, yi+1, zi+1), v111 = hash(xi+1, yi+1, zi+1);
    
    let x1 = lerp(v000, v100, xf), x2 = lerp(v010, v110, xf);
    let x3 = lerp(v001, v101, xf), x4 = lerp(v011, v111, xf);
    let y1 = lerp(x1, x2, yf), y2 = lerp(x3, x4, yf);
    
    return lerp(y1, y2, zf);
}

function noise2D(x, y) { return noise3D(x, y, 0); }

function fbm2D(x, y, octaves) {
    let v = 0, a = 0.5, f = 1.0;
    for(let i=0; i<octaves; i++) {
        v += noise2D(x * f, y * f) * a;
        f *= 2.0; a *= 0.5;
    }
    return v;
}

function getTerrain(x, y) {
    let nx = x * 0.003, ny = y * 0.003;
    
    let elevation = fbm2D(nx, ny, 4); 
    let moisture = fbm2D(nx + 100, ny + 100, 3);
    let roughness = fbm2D(nx * 3, ny * 3, 3);
    
    let baseH = elevation * 60 + 10 + (roughness * 10 * elevation);
    let oceanSurface = WATER_LEVEL; 
    let lakeSurface = 0;
    let isLake = false;

    let heightDiff = Math.max(0, baseH - oceanSurface);
    let dynamicValleyWidth = 0.06 + (heightDiff * 0.004); 
    
    let riverNoise = Math.abs(fbm2D(nx * 1.2 + 50, ny * 1.2 + 50, 3) - 0.5) * 2.0; 
    
    if (riverNoise < dynamicValleyWidth && baseH > oceanSurface - 5) {
        let riverCenter = 0.015; 
        let carveAlpha = 0;
        
        if (riverNoise < riverCenter) {
            carveAlpha = 1.0; 
        } else {
            let t = 1.0 - ((riverNoise - riverCenter) / (dynamicValleyWidth - riverCenter));
            carveAlpha = t * t * (3.0 - 2.0 * t); 
        }
        
        let riverBottom = oceanSurface - 3 - (roughness * 2); 
        baseH = lerp(baseH, riverBottom, carveAlpha);
    }

    let lakeMask = fbm2D(nx * 4 + 20, ny * 4 + 20, 2);
    let pondMask = fbm2D(nx * 15, ny * 15, 2); 

    if (lakeMask > 0.65 || pondMask > 0.72) {
        isLake = true;
        let poolLevel = Math.floor((baseH - 1) / 4) * 4; 
        lakeSurface = Math.max(oceanSurface, poolLevel); 
        let maskVal = lakeMask > 0.65 ? (lakeMask - 0.65) * 3 : (pondMask - 0.72) * 4;
        let t = Math.min(1.0, maskVal * 1.5);
        let depthCurve = t * t * (3 - 2 * t);
        let depth = depthCurve * 15; 
        baseH = Math.min(baseH, lakeSurface + 1.5 - depth);
    }

    return { baseH, lakeSurface, isLake, oceanSurface, moisture, elevation };
}

function getTerrainFast(x, y) {
    let key = `${Math.floor(x)},${Math.floor(y)}`;
    let val = terrainCache.get(key);
    if (val !== undefined) return val;
    let t = getTerrain(x, y);
    terrainCache.set(key, t);
    if (terrainCache.size > 20000) terrainCache.clear();
    return t;
}

function getGridBaseHeight(x, y) { return Math.floor(getTerrainFast(x, y).baseH); }
function getGridBaseHeightFloat(x, y) { return getTerrainFast(x, y).baseH; }
function getBiome(x, y) { return getTerrainFast(x, y).moisture; }

function getVoxel(x, y, z, t = null) {
    if (z < 0) return 1; 
    if (z >= MAX_Z) return 0; 
    
    let mod = voxelMods.get(`${x},${y},${z}`);
    if (mod !== undefined) return mod === 1 ? 1 : (mod === 3 ? 3 : 0);
    
    if (!t) t = getTerrainFast(x, y);
    
    let density = t.baseH - z;
    
    if (density < -15) {
        if (z <= t.oceanSurface) return 2; 
        if (t.isLake && z <= t.lakeSurface) return 2; 
        return 0; 
    }
    if (density > 20) return 1; 
    
    let structure = noise3D(x * 0.04, y * 0.04, z * 0.04);
    density += structure * 10.0; 
    
    let depth = t.baseH - z;
    if (depth > 12) {
        let caveNoise = Math.abs(noise3D(x * 0.03, y * 0.03, z * 0.03) - 0.5) * 2.0;
        if (caveNoise < 0.25) density -= (0.25 - caveNoise) * 40.0;
    }
    
    if (density > 0) return 1; 
    if (z <= t.oceanSurface) return 2; 
    if (t.isLake && z <= t.lakeSurface) return 2; 
    
    return 0; 
}

function getSolidFast(x, y, z) { 
    let v = getVoxel(x, y, z);
    return v === 1 || v === 3; 
}
function getSolid(x, y, z) { return getSolidFast(x, y, z); }

function getVoxelColor(x, y, z, vType = null) {
    let v = vType || getVoxel(x, y, z);
    if (v === 3) return { r: 150, g: 150, b: 150 };

    let t = getTerrainFast(x, y);
    let depthFromMacro = t.baseH - z;
    let colorNoise = hash(x, y, z) * 15;
    
    let isSurface = (getVoxel(x, y, z + 1) !== 1 && getVoxel(x, y, z + 1) !== 3); 
    let isUnderWater = (z <= t.oceanSurface) || (t.isLake && z <= t.lakeSurface);
    
    let rockDepth = t.elevation > 0.65 ? 3.0 : 6.0; 
    if (depthFromMacro > rockDepth || (isSurface && depthFromMacro > 15.0)) {
        let rv = 90 + colorNoise;
        return { r: rv|0, g: (rv*0.95)|0, b: (rv*0.9)|0 };
    }
    
    if (!isSurface || isUnderWater) {
        if (isUnderWater && (z >= t.oceanSurface - 2 || (t.isLake && z >= t.lakeSurface - 2))) {
            return { r: 200 + colorNoise, g: 180 + colorNoise, b: 130 + colorNoise }; 
        }
        return { r: 95 + colorNoise, g: 65 + colorNoise, b: 35 + colorNoise }; 
    }
    
    if ((z >= t.oceanSurface && z <= t.oceanSurface + 1.5) || (t.isLake && z >= t.lakeSurface && z <= t.lakeSurface + 1.5)) {
        return { r: 210 + colorNoise, g: 200 + colorNoise, b: 150 + colorNoise }; 
    }
    if (t.elevation > 0.70 && z > t.baseH - 2.0) {
        return { r: 240 + colorNoise, g: 245 + colorNoise, b: 255 + colorNoise }; 
    }
    if (t.moisture < 0.35) {
        return { r: 200 + colorNoise, g: 175 + colorNoise, b: 110 + colorNoise }; 
    }
    if (t.moisture > 0.6) {
        return { r: 55 + colorNoise, g: 120 + colorNoise, b: 45 + colorNoise }; 
    }
    return { r: 85 + colorNoise, g: 150 + colorNoise, b: 65 + colorNoise }; 
}

function getSmoothVertex(cx, cy, cz) {
    let sumX = 0, sumY = 0, sumZ = 0, count = 0;
    let touchesCube = false;
    
    for (let dx = -1; dx <= 0; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
            for (let dz = -1; dz <= 0; dz++) {
                let v = getVoxel(cx + dx, cy + dy, cz + dz);
                if (v === 3) touchesCube = true; 
                if (v === 1 || v === 3) {
                    sumX += (cx + dx + 0.5);
                    sumY += (cy + dy + 0.5);
                    sumZ += (cz + dz + 0.5);
                    count++;
                }
            }
        }
    }
    
    if (touchesCube) return { x: cx, y: cy, z: cz };

    if (count === 0 || count === 8) return { x: cx, y: cy, z: cz };
    
    let w = 0.5;
    return { 
        x: cx + (sumX / count - cx) * w, 
        y: cy + (sumY / count - cy) * w, 
        z: cz + (sumZ / count - cz) * w 
    };
}

function getCubeVertex(px, py, pz) { return { x: px, y: py, z: pz }; }

function getWaterVertex(px, py, pz, isTop) {
    return { x: px, y: py, z: isTop ? pz - 0.15 : pz };
}

function buildChunkMesh(cx, cy) {
    let faces = [];

    function addFace(x, y, z, p1, p2, p3, p4, nx, ny, nz, shade, col, type) {
        let pts;
        if (type === 2) { 
            pts = [
                getWaterVertex(p1[0], p1[1], p1[2], p1[2] > z),
                getWaterVertex(p2[0], p2[1], p2[2], p2[2] > z),
                getWaterVertex(p3[0], p3[1], p3[2], p3[2] > z),
                getWaterVertex(p4[0], p4[1], p4[2], p4[2] > z)
            ];
        } else if (type === 3) {
            pts = [
                getCubeVertex(p1[0], p1[1], p1[2]),
                getCubeVertex(p2[0], p2[1], p2[2]),
                getCubeVertex(p3[0], p3[1], p3[2]),
                getCubeVertex(p4[0], p4[1], p4[2])
            ];
        } else { 
            pts = [
                getSmoothVertex(p1[0], p1[1], p1[2]),
                getSmoothVertex(p2[0], p2[1], p2[2]),
                getSmoothVertex(p3[0], p3[1], p3[2]),
                getSmoothVertex(p4[0], p4[1], p4[2])
            ];
        }
        
        let isUnderground = false;
        if (type === 1 || type === 3) {
            let airX = x + nx, airY = y + ny, airZ = z + nz;
            for (let checkZ = airZ; checkZ < MAX_Z; checkZ++) {
                let checkV = getVoxel(airX, airY, checkZ);
                if (checkV === 1 || checkV === 3) {
                    isUnderground = true;
                    break;
                }
            }
        }

        faces.push({ 
            pts: pts, 
            cx: x + 0.5 + nx * 0.5, cy: y + 0.5 + ny * 0.5, cz: z + 0.5 + nz * 0.5, 
            bx: x, by: y, bz: z, underground: isUnderground,
            norm: { x: nx, y: ny, z: nz }, 
            col: col, shade: shade, isWater: (type === 2) 
        });
    }

    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            let t = getTerrainFast(x, y);
            let colVoxels = new Uint8Array(MAX_Z);
            
            for (let z = 0; z < MAX_Z; z++) {
                colVoxels[z] = getVoxel(x, y, z, t);
            }
            
            for (let z = 0; z < MAX_Z; z++) {
                let v = colVoxels[z];
                if (v === 1 || v === 3) { 
                    let col = getVoxelColor(x, y, z, v);
                    let up = z < MAX_Z - 1 ? colVoxels[z+1] : 0;
                    let dn = z > 0 ? colVoxels[z-1] : 1;
                    let px = getVoxel(x+1, y, z);
                    let nx = getVoxel(x-1, y, z);
                    let py = getVoxel(x, y+1, z);
                    let ny = getVoxel(x, y-1, z);

                    if (z === MAX_Z - 1 || (up !== 1 && up !== 3)) addFace(x, y, z, [x, y, z+1], [x+1, y, z+1], [x+1, y+1, z+1], [x, y+1, z+1], 0, 0, 1, 1.0, col, v);
                    if (z === 0 || (dn !== 1 && dn !== 3)) addFace(x, y, z, [x, y+1, z], [x+1, y+1, z], [x+1, y, z], [x, y, z], 0, 0, -1, 0.3, col, v);
                    if (px !== 1 && px !== 3) addFace(x, y, z, [x+1, y, z], [x+1, y+1, z], [x+1, y+1, z+1], [x+1, y, z+1], 1, 0, 0, 0.7, col, v);
                    if (nx !== 1 && nx !== 3) addFace(x, y, z, [x, y+1, z], [x, y, z], [x, y, z+1], [x, y+1, z+1], -1, 0, 0, 0.5, col, v);
                    if (py !== 1 && py !== 3) addFace(x, y, z, [x+1, y+1, z], [x, y+1, z], [x, y+1, z+1], [x+1, y+1, z+1], 0, 1, 0, 0.8, col, v);
                    if (ny !== 1 && ny !== 3) addFace(x, y, z, [x, y, z], [x+1, y, z], [x+1, y, z+1], [x, y, z+1], 0, -1, 0, 0.6, col, v);
                } 
                else if (v === 2) { 
                    let wCol = { r: 30, g: 110, b: 200, a: 0.6 };
                    let up = z < MAX_Z - 1 ? colVoxels[z+1] : 0;
                    if (z === MAX_Z - 1 || up === 0) addFace(x, y, z, [x, y, z+1], [x+1, y, z+1], [x+1, y+1, z+1], [x, y+1, z+1], 0, 0, 1, 1.0, wCol, 2);
                    if (getVoxel(x+1, y, z) === 0) addFace(x, y, z, [x+1, y, z], [x+1, y+1, z], [x+1, y+1, z+1], [x+1, y, z+1], 1, 0, 0, 0.7, wCol, 2);
                    if (getVoxel(x-1, y, z) === 0) addFace(x, y, z, [x, y+1, z], [x, y, z], [x, y, z+1], [x, y+1, z+1], -1, 0, 0, 0.5, wCol, 2);
                    if (getVoxel(x, y+1, z) === 0) addFace(x, y, z, [x+1, y+1, z], [x, y+1, z], [x, y+1, z+1], [x+1, y+1, z+1], 0, 1, 0, 0.8, wCol, 2);
                    if (getVoxel(x, y-1, z) === 0) addFace(x, y, z, [x, y, z], [x+1, y, z], [x+1, y, z+1], [x, y, z+1], 0, -1, 0, 0.6, wCol, 2);
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
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
            for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
                if (Math.hypot(x - cx, y - cy, z - cz) <= radius && z >= 0 && z < MAX_Z) {
                    voxelMods.set(`${x},${y},${z}`, amount);
                    modifiedChunks.add(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`);
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

function getAimVoxel(range) {
    const pitchAngle = Math.atan2(player.pitch, canvas.width * currentZoom);
    let step = 0.2;
    for (let i = 0; i <= range / step; i++) {
        let rx = player.x + Math.cos(player.angle) * Math.cos(pitchAngle) * (i * step);
        let ry = player.y + Math.sin(player.angle) * Math.cos(pitchAngle) * (i * step);
        let rz = (player.z + player.baseHeight) + Math.sin(pitchAngle) * (i * step); 
        
        if (getSolid(Math.floor(rx), Math.floor(ry), Math.floor(rz))) {
            return {
                hitX: rx, hitY: ry, hitZ: rz,
                placeX: rx - Math.cos(player.angle)*Math.cos(pitchAngle)*step,
                placeY: ry - Math.sin(player.angle)*Math.cos(pitchAngle)*step,
                placeZ: rz - Math.sin(pitchAngle)*step
            };
        }
    }
    return null;
}

let startZ = MAX_Z - 1;
while (startZ > 0 && getVoxel(0, 0, startZ) !== 1) startZ--;
player.x = 0; player.y = 0; player.z = startZ + 1.5;

function getEntityAt(gx, gy) {
    if (Math.sqrt(gx*gx + gy*gy) < 20) return null; 
    
    let t = getTerrainFast(gx, gy);
    if (t.isLake || t.baseH <= t.oceanSurface) return null; 

    let cluster = fbm2D(gx * 0.1, gy * 0.1, 2);
    let h = hash(gx, gy, 0);
    
    if (t.elevation > 0.70) { 
        if (cluster > 0.5 && h < 0.05) return '🌲';
        if (h < 0.08) return '🪨'; 
    } else if (t.moisture < 0.35) { 
        if (h < 0.01) return '💀'; 
        if (h < 0.03) return '🌵'; 
        if (h < 0.05) return '🪨'; 
    } else if (t.moisture > 0.6) { 
        if (cluster > 0.3) { 
            if (h < 0.20) return '🌳'; 
            if (h < 0.25) return '🪾'; 
        } else { 
            if (h < 0.05) return '🌹'; 
            if (h < 0.08) return '🌻'; 
        }
    } else { 
        if (cluster > 0.6 && h < 0.05) return '🌳'; 
        if (h < 0.05) return '🌼'; 
        if (h < 0.08) return '🌷'; 
        if (h < 0.10) return '🪨';
    }
    return null;
}

function getEntityBaseInfo(x, y) {
    const key = (x | 0) * 10007 + (y | 0); 
    if (entityInfoCache.has(key)) return entityInfoCache.get(key);
    
    let em = getEntityAt(x, y), result = null;
    if (em) {
        let v = hash(x, y, 10), finalSize = ENTITIES_DATA[em].baseSize, solid = ENTITIES_DATA[em].solid, plantOffset = 0.1; 
        if (em === '🪨') { 
            if (v < 0.4) { finalSize = 0.25; solid = false; plantOffset = 0.05; } 
            else if (v > 0.8) { finalSize = 1.6; plantOffset = 0.3; } 
            else { finalSize = 0.7; plantOffset = 0.15; } 
        } else if (TREE_EMOJIS.has(em)) { 
            finalSize += (v - 0.5) * 3.5; plantOffset = 0.4; 
        } else if (em === '🌵') { 
            finalSize += (v - 0.5) * 0.6; plantOffset = 0.2; 
        } else if (FLOWER_EMOJIS.has(em)) { 
            finalSize += (v - 0.5) * 0.3; plantOffset = 0.05; 
        }
        result = { emoji: em, size: finalSize, solid, plantOffset };
    }
    entityInfoCache.set(key, result); return result;
}

function getMapChunk(cx, cy) {
    const key = cx * 2003 + cy; 
    if (mapChunks.has(key)) return mapChunks.get(key);
    
    let chunk = [];
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            let info = getEntityBaseInfo(x, y); 
            let entKey = `${x},${y}`;
            if (info && !destroyedEntities.has(entKey)) {
                let floorIntZ = MAX_Z - 1;
                while(floorIntZ >= 0 && getVoxel(Math.floor(x + 0.5), Math.floor(y + 0.5), floorIntZ) !== 1) floorIntZ--;
                if (floorIntZ < 0) continue; 
                
                chunk.push({ type: 'emoji', emoji: info.emoji, size: info.size, wx: x + 0.5, wy: y + 0.5, h: (floorIntZ + 1.0) - info.plantOffset, hp: 4, entKey: entKey }); 
            }
        }
    }
    
    let chunkHash = hash(cx, cy, 5), cx_offset = cx * CHUNK_SIZE + CHUNK_SIZE / 2, cy_offset = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
    let bZInt = MAX_Z - 1;
    while (bZInt >= 0 && getVoxel(Math.floor(cx_offset), Math.floor(cy_offset), bZInt) !== 1) bZInt--;
    let bZ = bZInt + 1.0;

    if (getVoxel(Math.floor(cx_offset), Math.floor(cy_offset), bZInt + 1) !== 2) {
        if (chunkHash > 0.94) {
            let items = new Array(10).fill(null); 
            for(let k = 0; k < Math.floor(hash(cx, cy, 7) * 4); k++) items[Math.floor(Math.random() * 10)] = { type: 'heal', emoji: '🩹', amount: 25 };
            containers.push({ x: cx_offset, y: cy_offset, z: bZ, emoji: ['🧳', '🎒', '📦'][Math.floor(chunkHash * 1000) % 3], size: 0.9, items: items });
        } else if (chunkHash > 0.88 && chunkHash <= 0.94) {
            let def = ANIMAL_TYPES[Math.floor(chunkHash * 1000) % ANIMAL_TYPES.length];
            animals.push({ x: cx_offset, y: cy_offset, z: bZ, emoji: def.emoji, size: def.size, hp: def.hp, speed: def.speed, dead: false, drop: def.drop, moveAngle: Math.random() * Math.PI * 2, moveTimer: 0 });
        }
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