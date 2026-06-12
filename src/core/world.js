//THIS IS world.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// --- World Generation & Voxel Storage ---
const WORLD_SEED = Math.random() * 10000;
const biomeCache = new Map(), entityInfoCache = new Map(), mapChunks = new Map();
const chunkMeshes = new Map(), voxelMods = new Map(), terrainCache = new Map();

// --- WebAssembly Integration ---
let wasmLoaded = false;
let wasmExports = null;

// Decode base64 WASM binary
const wasmBytes = Uint8Array.from(atob(WASM_BASE64), c => c.charCodeAt(0));

// Instantiate WebAssembly module
WebAssembly.instantiate(wasmBytes, {
    env: {
        abort(message, fileName, lineNumber, columnNumber) {
            console.error("WASM aborted: " + message);
        }
    }
}).then(result => {
    wasmExports = result.instance.exports;
    wasmExports.init(WORLD_SEED);
    wasmLoaded = true;
    console.log("WebAssembly world module loaded successfully!");
    
    // Clear caches to force rebuild and retrieval via WASM
    terrainCache.clear();
    entityInfoCache.clear();
    mapChunks.clear();
    chunkMeshes.clear();
}).catch(err => {
    console.error("Failed to instantiate WASM module:", err);
});

const MAX_Z = 96;

const WATER_LEVEL = 24;
const WATER_HEIGHT = 24.35; 

function hash(x, y, z) {
    let h = (x * 127.1 + y * 311.7 + z * 74.7 + WORLD_SEED) * 43758.5453123;
    return h - Math.floor(h);
}

function entityHash(x, y, z) {
    let h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + WORLD_SEED) * 43758.5453123;
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
    if (wasmLoaded) {
        return {
            baseH: wasmExports.getTerrainBaseH(x, y),
            lakeSurface: wasmExports.getTerrainLakeSurface(x, y),
            isLake: wasmExports.getTerrainIsLake(x, y) !== 0,
            oceanSurface: wasmExports.getTerrainOceanSurface(x, y),
            moisture: wasmExports.getTerrainMoisture(x, y),
            elevation: wasmExports.getTerrainElevation(x, y),
            roadType: wasmExports.getTerrainRoadType(x, y),
            roadMinDist: wasmExports.getTerrainRoadMinDist(x, y),
            roadH: wasmExports.getTerrainRoadH(x, y),
            roadT: wasmExports.getTerrainRoadT(x, y),
            roadSegLen: wasmExports.getTerrainRoadSegLen(x, y)
        };
    }
    return getTerrainJS(x, y);
}

const roadResult = {
    minDist: 999999,
    roadType: 0,
    projT: 0,
    segLength: 0,
    roadH: 0
};

function nodeHash(i, j, seedOffset) {
    let h = (i * 127.1 + j * 311.7 + seedOffset + WORLD_SEED) * 43758.5453123;
    return h - Math.floor(h);
}

function getNaturalHeight(x, y) {
    let nx = x * 0.003, ny = y * 0.003;
    let elevation = fbm2D(nx, ny, 4);
    let roughness = fbm2D(nx * 3, ny * 3, 3);
    return elevation * 60 + 10 + (roughness * 10 * elevation);
}

function getNaturalHeightWithWater(x, y) {
    let nx = x * 0.003, ny = y * 0.003;
    let elevation = fbm2D(nx, ny, 4);
    let roughness = fbm2D(nx * 3, ny * 3, 3);
    let baseH = elevation * 60 + 10 + (roughness * 10 * elevation);
    let oceanSurface = WATER_LEVEL;

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
        let poolLevel = Math.floor((baseH - 1) / 4) * 4;
        let lakeSurface = Math.max(oceanSurface, poolLevel);
        let maskVal = lakeMask > 0.65 ? (lakeMask - 0.65) * 3 : (pondMask - 0.72) * 4;
        let t = Math.min(1.0, maskVal * 1.5);
        let depthCurve = t * t * (3 - 2 * t);
        let depth = depthCurve * 15;
        baseH = Math.min(baseH, lakeSurface + 1.5 - depth);
    }
    return baseH;
}

function queryRoad(x, y) {
    const S = 256.0;
    // Warp coordinates gently
    let wx = x + (noise2D(x * 0.002, y * 0.002) - 0.5) * 16.0;
    let wy = y + (noise2D(x * 0.002 + 100.0, y * 0.002 + 100.0) - 0.5) * 16.0;

    let cellX = Math.floor(wx / S);
    let cellY = Math.floor(wy / S);

    roadResult.minDist = 999999;
    roadResult.roadType = 0;
    roadResult.projT = 0;
    roadResult.segLength = 0;
    roadResult.roadH = 0;

    for (let i = cellX - 1; i <= cellX + 1; i++) {
        for (let j = cellY - 1; j <= cellY + 1; j++) {
            let densityA = noise2D(i * 0.05, j * 0.05);
            if (densityA <= 0.05) continue;

            let jxA = (nodeHash(i, j, 1.0) - 0.5) * 0.4 * S;
            let jyA = (nodeHash(i, j, 2.0) - 0.5) * 0.4 * S;
            let ax = i * S + jxA;
            let ay = j * S + jyA;

            // Connection 1: right neighbor
            let densityB1 = noise2D((i+1) * 0.05, j * 0.05);
            if (densityB1 > 0.05 && nodeHash(i, j, 3.0) > 0.10) {
                let jxB = (nodeHash(i+1, j, 1.0) - 0.5) * 0.4 * S;
                let jyB = (nodeHash(i+1, j, 2.0) - 0.5) * 0.4 * S;
                let bx = (i+1) * S + jxB;
                let by = j * S + jyB;

                let dx = bx - ax;
                let dy = by - ay;
                let lenSq = dx*dx + dy*dy;
                if (lenSq > 0) {
                    let allowed = true;
                    let crosses = false;
                    for (let step = 1; step <= 3; step++) {
                        let tVal = step * 0.25;
                        let px = ax + tVal * dx;
                        let py = ay + tVal * dy;
                        let rH = getNaturalHeight(px, py);
                        let aH = getNaturalHeightWithWater(px, py);
                        if (aH <= 24.5 || (rH - aH) > 3.0) {
                            crosses = true;
                            break;
                        }
                    }
                    if (crosses) {
                        let segHash = nodeHash(i, j, 5.0);
                        if (segHash > 0.10) { // 10% chance
                            allowed = false;
                        }
                    }

                    if (allowed) {
                        let t = ((wx - ax) * dx + (wy - ay) * dy) / lenSq;
                        t = Math.max(0, Math.min(1, t));
                        let projx = ax + t * dx;
                        let projy = ay + t * dy;
                        let dist = Math.hypot(wx - projx, wy - projy);
                        if (dist < roadResult.minDist) {
                            roadResult.minDist = dist;
                            roadResult.projT = t;
                            roadResult.segLength = Math.sqrt(lenSq);
                            roadResult.roadH = getNaturalHeight(projx, projy);

                            let mx = ax + 0.5 * dx;
                            let my = ay + 0.5 * dy;
                            let roadTypeNoise = noise2D(mx * 0.0002, my * 0.0002);
                            if (roadTypeNoise > 0.45) {
                                roadResult.roadType = 8;
                            } else {
                                roadResult.roadType = 7;
                            }
                        }
                    }
                }
            }

            // Connection 2: top neighbor
            let densityB2 = noise2D(i * 0.05, (j+1) * 0.05);
            if (densityB2 > 0.05 && nodeHash(i, j, 4.0) > 0.10) {
                let jxB = (nodeHash(i, j+1, 1.0) - 0.5) * 0.4 * S;
                let jyB = (nodeHash(i, j+1, 2.0) - 0.5) * 0.4 * S;
                let bx = i * S + jxB;
                let by = (j+1) * S + jyB;

                let dx = bx - ax;
                let dy = by - ay;
                let lenSq = dx*dx + dy*dy;
                if (lenSq > 0) {
                    let allowed = true;
                    let crosses = false;
                    for (let step = 1; step <= 3; step++) {
                        let tVal = step * 0.25;
                        let px = ax + tVal * dx;
                        let py = ay + tVal * dy;
                        let rH = getNaturalHeight(px, py);
                        let aH = getNaturalHeightWithWater(px, py);
                        if (aH <= 24.5 || (rH - aH) > 3.0) {
                            crosses = true;
                            break;
                        }
                    }
                    if (crosses) {
                        let segHash = nodeHash(i, j, 6.0);
                        if (segHash > 0.10) { // 10% chance
                            allowed = false;
                        }
                    }

                    if (allowed) {
                        let t = ((wx - ax) * dx + (wy - ay) * dy) / lenSq;
                        t = Math.max(0, Math.min(1, t));
                        let projx = ax + t * dx;
                        let projy = ay + t * dy;
                        let dist = Math.hypot(wx - projx, wy - projy);
                        if (dist < roadResult.minDist) {
                            roadResult.minDist = dist;
                            roadResult.projT = t;
                            roadResult.segLength = Math.sqrt(lenSq);
                            roadResult.roadH = getNaturalHeight(projx, projy);

                            let mx = ax + 0.5 * dx;
                            let my = ay + 0.5 * dy;
                            let roadTypeNoise = noise2D(mx * 0.0002, my * 0.0002);
                            if (roadTypeNoise > 0.45) {
                                roadResult.roadType = 8;
                            } else {
                                roadResult.roadType = 7;
                            }
                        }
                    }
                }
            }
        }
    }
}

function getTerrainJS(x, y) {
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

    queryRoad(x, y);
    let roadType = 0, roadH = 0, roadMinDist = 999999, roadT = 0, roadSegLen = 0;
    if (roadResult.roadType !== 0) {
        roadType = roadResult.roadType;
        roadH = roadResult.roadH;
        roadMinDist = roadResult.minDist;
        roadT = roadResult.projT;
        roadSegLen = roadResult.segLength;

        if (roadH > baseH + 3.0) {
            // Bridge: do not modify baseH
        } else {
            let alpha = 0;
            if (roadMinDist < 3.0) alpha = 1.0;
            else if (roadMinDist < 6.0) alpha = 1.0 - (roadMinDist - 3.0) / 3.0;
            baseH = lerp(baseH, roadH, alpha);
        }
    }

    return { baseH, lakeSurface, isLake, oceanSurface, moisture, elevation, roadType, roadH, roadMinDist, roadT, roadSegLen };
}

function getTerrainFast(x, y) {
    let key = `${Math.floor(x)},${Math.floor(y)}`;
    let val = terrainCache.get(key);
    if (val !== undefined) return val;
    let t = getTerrain(x, y);
    terrainCache.set(key, t);
    if (terrainCache.size > 15000000) terrainCache.clear();
    return t;
}

function getGridBaseHeight(x, y) { return Math.floor(getTerrainFast(x, y).baseH); }
function getGridBaseHeightFloat(x, y) { return getTerrainFast(x, y).baseH; }
function getBiome(x, y) { return getTerrainFast(x, y).moisture; }

function getVoxel(x, y, z, t = null) {
    if (wasmLoaded) {
        return wasmExports.getVoxelWasm(x, y, z);
    }
    return getVoxelJS(x, y, z, t);
}

function getVoxelJS(x, y, z, t = null) {
    if (z < 0) return 1; 
    if (z >= MAX_Z) return 0; 
    
    let mod = voxelMods.get(`${x},${y},${z}`);
    if (mod !== undefined) return mod <= 0 ? 0 : mod;
    
    if (!t) t = getTerrainFast(x, y);

    if (t.roadType && t.roadType !== 0) {
        let isBridge = (t.roadH > t.baseH + 3.0);
        if (isBridge) {
            if (t.roadMinDist < 3.0) {
                let isBarrier = (t.roadMinDist >= 2.4);
                let roadZ = Math.floor(t.roadH);

                if (isBarrier) {
                    if (z === roadZ || z === roadZ + 1) return 3;
                    if (z > roadZ + 1) return 0;
                } else {
                    if (z === roadZ) return t.roadType;
                    if (z > roadZ) return 0;
                }

                if (z < roadZ) {
                    if (z > t.baseH) {
                        let distAlongSeg = t.roadT * t.roadSegLen;
                        let isPillar = (t.roadMinDist < 1.0) && (Math.abs(distAlongSeg - Math.round(distAlongSeg / 12.0) * 12.0) < 1.0);
                        if (isPillar) return 3;

                        if (z <= t.oceanSurface) return 2;
                        if (t.isLake && z <= t.lakeSurface) return 2;
                        return 0;
                    }
                }
            }
        } else {
            if (t.roadMinDist < 3.0) {
                let roadZ = Math.floor(t.baseH);
                if (z === roadZ) return t.roadType;
            }
        }
    }
    
    let density = t.baseH - z;
    
    if (density < -15) {
        if (z <= t.oceanSurface) return 2; 
        if (t.isLake && z <= t.lakeSurface) return 2; 
        return 0; 
    }
    if (density > 20) return 1; 
    
    let structure = noise3D(x * 0.04, y * 0.04, z * 0.04);
    let structureScale = 1.0;
    if (t.roadType && t.roadType !== 0) {
        let isBridge = (t.roadH > t.baseH + 3.0);
        if (!isBridge) {
            let alpha = 0;
            if (t.roadMinDist < 3.0) alpha = 1.0;
            else if (t.roadMinDist < 6.0) alpha = 1.0 - (t.roadMinDist - 3.0) / 3.0;
            structureScale = 1.0 - alpha;
        }
    }
    density += structure * 10.0 * structureScale; 
    
    let depth = t.baseH - z;
    if (depth > 12) {
        let caveNoise = Math.abs(noise3D(x * 0.03, y * 0.03, z * 0.03) - 0.5) * 2.0;
        if (caveNoise < 0.25) density -= (0.25 - caveNoise) * 40.0;
    }
    
    if (density > 0.5) return 1; 
    if (density > 0) return 6; 
    if (z <= t.oceanSurface) return 2; 
    if (t.isLake && z <= t.lakeSurface) return 2; 
    
    return 0; 
}

function isVoxelSolid(v) {
    return v === 1 || v === 6 || v >= 3;
}

function isVoxelCube(v) {
    return v >= 3 && v !== 6 && v !== 7 && v !== 8;
}

function getSolidFast(x, y, z) {
    if (wasmLoaded) {
        return wasmExports.getSolidWasm(x, y, z) !== 0;
    }
    return getSolidFastJS(x, y, z);
}

function getSolidFastJS(x, y, z) { 
    let v = getVoxel(x, y, z);
    return isVoxelSolid(v); 
}
function getSolid(x, y, z) { return getSolidFast(x, y, z); }

function getVoxelColor(x, y, z, vType = null) {
    if (wasmLoaded) {
        let packed = wasmExports.getVoxelColorWasm(x, y, z);
        return {
            r: packed & 0xFF,
            g: (packed >> 8) & 0xFF,
            b: (packed >> 16) & 0xFF
        };
    }
    return getVoxelColorJS(x, y, z, vType);
}

function getVoxelColorJS(x, y, z, vType = null) {
    let v = vType || getVoxel(x, y, z);
    if (v === 3) return { r: 150, g: 150, b: 150 };
    if (v === 4) return { r: 160, g: 110, b: 60 };
    if (v === 5) return { r: 140, g: 140, b: 140 };
    if (v === 7) {
        let noise = hash(x, y, z) * 12;
        return {
            r: Math.max(0, Math.min(255, 110 + noise)) | 0,
            g: Math.max(0, Math.min(255, 85 + noise)) | 0,
            b: Math.max(0, Math.min(255, 55 + noise)) | 0
        };
    }
    if (v === 8) {
        let noise = hash(x, y, z) * 8;
        let t = getTerrainFast(x, y);
        if (t.roadType === 8 && t.roadMinDist < 0.15) {
            let distAlongSeg = t.roadT * t.roadSegLen;
            if (Math.floor(distAlongSeg / 4.0) % 2 === 0) {
                return {
                    r: Math.max(0, Math.min(255, 225 + noise)) | 0,
                    g: Math.max(0, Math.min(255, 185 + noise)) | 0,
                    b: Math.max(0, Math.min(255, 40 + noise)) | 0
                };
            }
        }
        return {
            r: Math.max(0, Math.min(255, 55 + noise)) | 0,
            g: Math.max(0, Math.min(255, 55 + noise)) | 0,
            b: Math.max(0, Math.min(255, 58 + noise)) | 0
        };
    }

    let t = getTerrainFast(x, y);
    let depthFromMacro = t.baseH - z;
    let colorNoise = hash(x, y, z) * 15;
    
    let isSurface = !isVoxelSolid(getVoxel(x, y, z + 1)); 
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
    
    let hasHalfBelow = false;
    let hasFullBelow = false;
    let hasSolidAbove = false;

    for (let dx = -1; dx <= 0; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
            for (let dz = -1; dz <= 0; dz++) {
                let v = getVoxel(cx + dx, cy + dy, cz + dz);
                if (isVoxelCube(v)) touchesCube = true; 
                if (isVoxelSolid(v)) {
                    sumX += (cx + dx + 0.5);
                    sumY += (cy + dy + 0.5);
                    if (v === 6) {
                        sumZ += (cz + dz + 0.25);
                    } else {
                        sumZ += (cz + dz + 0.5);
                    }
                    count++;

                    if (dz === -1) {
                        if (v === 6) {
                            hasHalfBelow = true;
                        } else {
                            hasFullBelow = true;
                        }
                    } else if (dz === 0) {
                        hasSolidAbove = true;
                    }
                }
            }
        }
    }
    
    if (touchesCube) return { x: cx, y: cy, z: cz };

    if (count === 0 || count === 8) return { x: cx, y: cy, z: cz };
    
    let targetZ = (hasHalfBelow && !hasFullBelow && !hasSolidAbove) ? (cz - 0.5) : cz;

    let w = 0.5;
    return { 
        x: cx + (sumX / count - cx) * w, 
        y: cy + (sumY / count - cy) * w, 
        z: targetZ + (sumZ / count - targetZ) * w 
    };
}

function getCubeVertex(px, py, pz) { return { x: px, y: py, z: pz }; }

function getWaterVertex(px, py, pz, isTop) {
    if (!isTop) return { x: px, y: py, z: pz };
    let sv = getSmoothVertex(px, py, pz);
    return { x: sv.x, y: sv.y, z: pz - 0.55 };
}

function buildChunkMesh(cx, cy) {
    if (wasmLoaded) {
        let faceCount = wasmExports.buildChunkMeshWasm(cx, cy);
        let ptr = wasmExports.getMeshBufferPointer();
        
        let f32 = new Float32Array(wasmExports.memory.buffer, ptr, faceCount * 24);
        let u32 = new Uint32Array(wasmExports.memory.buffer, ptr, faceCount * 24);
        
        let faces = [];
        for (let i = 0; i < faceCount; i++) {
            let base = i * 24;
            
            let p1 = { x: f32[base + 0], y: f32[base + 1], z: f32[base + 2] };
            let p2 = { x: f32[base + 3], y: f32[base + 4], z: f32[base + 5] };
            let p3 = { x: f32[base + 6], y: f32[base + 7], z: f32[base + 8] };
            let p4 = { x: f32[base + 9], y: f32[base + 10], z: f32[base + 11] };
            
            let nx = f32[base + 12];
            let ny = f32[base + 13];
            let nz = f32[base + 14];
            
            let cx_f = f32[base + 15];
            let cy_f = f32[base + 16];
            let cz_f = f32[base + 17];
            
            let bx = f32[base + 18];
            let by = f32[base + 19];
            let bz = f32[base + 20];
            
            let packedColor = u32[base + 21];
            let col = {
                r: packedColor & 0xFF,
                g: (packedColor >> 8) & 0xFF,
                b: (packedColor >> 16) & 0xFF,
                a: ((packedColor >> 24) & 0xFF) / 255
            };
            
            let packedFlags = u32[base + 22];
            let isWater = (packedFlags & 1) !== 0;
            let underground = (packedFlags & 2) !== 0;
            let shade = ((packedFlags >> 8) & 0xFF) / 255;
            
            faces.push({
                pts: [p1, p2, p3, p4],
                cx: cx_f, cy: cy_f, cz: cz_f,
                bx: bx, by: by, bz: bz,
                underground: underground,
                norm: { x: nx, y: ny, z: nz },
                col: col,
                shade: shade,
                isWater: isWater
            });
        }
        return faces;
    }
    return buildChunkMeshJS(cx, cy);
}

function buildChunkMeshJS(cx, cy) {
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
        } else if (isVoxelCube(type)) {
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
        if (isVoxelSolid(type)) {
            let airX = x + nx, airY = y + ny, airZ = z + nz;
            for (let checkZ = airZ; checkZ < MAX_Z; checkZ++) {
                let checkV = getVoxel(airX, airY, checkZ);
                if (isVoxelSolid(checkV)) {
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
                if (isVoxelSolid(v)) { 
                    let col = getVoxelColor(x, y, z, v);
                    let up = z < MAX_Z - 1 ? colVoxels[z+1] : 0;
                    let dn = z > 0 ? colVoxels[z-1] : 1;
                    let px = getVoxel(x+1, y, z);
                    let nx = getVoxel(x-1, y, z);
                    let py = getVoxel(x, y+1, z);
                    let ny = getVoxel(x, y-1, z);

                    if (z === MAX_Z - 1 || !isVoxelSolid(up)) addFace(x, y, z, [x, y, z+1], [x+1, y, z+1], [x+1, y+1, z+1], [x, y+1, z+1], 0, 0, 1, 1.0, col, v);
                    if (z === 0 || !isVoxelSolid(dn)) addFace(x, y, z, [x, y+1, z], [x+1, y+1, z], [x+1, y, z], [x, y, z], 0, 0, -1, 0.3, col, v);
                    if (!isVoxelSolid(px)) addFace(x, y, z, [x+1, y, z], [x+1, y+1, z], [x+1, y+1, z+1], [x+1, y, z+1], 1, 0, 0, 0.7, col, v);
                    if (!isVoxelSolid(nx)) addFace(x, y, z, [x, y+1, z], [x, y, z], [x, y, z+1], [x, y+1, z+1], -1, 0, 0, 0.5, col, v);
                    if (!isVoxelSolid(py)) addFace(x, y, z, [x+1, y+1, z], [x, y+1, z], [x, y+1, z+1], [x+1, y+1, z+1], 0, 1, 0, 0.8, col, v);
                    if (!isVoxelSolid(ny)) addFace(x, y, z, [x, y, z], [x+1, y, z], [x+1, y, z+1], [x, y, z+1], 0, -1, 0, 0.6, col, v);
                } 
                else if (v === 2) { 
                    let colorNoise = hash(x, y, z) * 10;
                    let wCol = { r: 30 + colorNoise | 0, g: 110 + colorNoise | 0, b: 200 + colorNoise | 0, a: 0.55 };
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

let meshesBuiltThisFrame = 0;

function getChunkMesh(cx, cy) {
    let key = `${cx},${cy}`;
    if (chunkMeshes.has(key)) return chunkMeshes.get(key);
    
    if (meshesBuiltThisFrame >= 3) {
        return [];
    }
    
    meshesBuiltThisFrame++;
    let mesh = buildChunkMesh(cx, cy);
    chunkMeshes.set(key, mesh);
    return mesh;
}

function modifyTerrain(cx, cy, cz, radius, amount) {
    if (amount <= 0) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
                for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
                    if (Math.hypot(x - cx, y - cy, z - cz) <= radius && z >= 0 && z < MAX_Z) {
                        let v = getVoxel(x, y, z);
                        if (isVoxelSolid(v)) {
                            dropMinedItem(x, y, z, v);
                        }
                    }
                }
            }
        }
    }

    if (wasmLoaded) {
        wasmExports.modifyTerrainWasm(cx, cy, cz, radius, amount);
        let modifiedChunks = new Set();
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
                modifiedChunks.add(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`);
            }
        }
        modifiedChunks.forEach(key => {
            let [mcx, mcy] = key.split(',').map(Number);
            chunkMeshes.delete(`${mcx},${mcy}`);
            chunkMeshes.delete(`${mcx+1},${mcy}`); chunkMeshes.delete(`${mcx-1},${mcy}`);
            chunkMeshes.delete(`${mcx},${mcy+1}`); chunkMeshes.delete(`${mcx},${mcy-1}`);
        });
        return;
    }
    modifyTerrainJS(cx, cy, cz, radius, amount);
}

function modifyTerrainJS(cx, cy, cz, radius, amount) {
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
    const pitchAngle = Math.atan2(player.pitch, canvas.width * baseZoom);
    const waterBob = (gameState === 'overworld' && player.isSubmerged) ? Math.sin(gameTime * 200) * 0.05 : 0;
    const camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
    let step = 0.2;
    for (let i = 0; i <= range / step; i++) {
        let rx = player.x + Math.cos(player.angle) * Math.cos(pitchAngle) * (i * step);
        let ry = player.y + Math.sin(player.angle) * Math.cos(pitchAngle) * (i * step);
        let rz = camZ + Math.sin(pitchAngle) * (i * step); 
        
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
while (startZ > 0 && !isVoxelSolid(getVoxel(0, 0, startZ))) startZ--;
let topV = getVoxel(0, 0, startZ);
player.x = 0; player.y = 0; player.z = startZ + ((topV === 6) ? 0.5 : 1.0) + 0.5;

function getEntityAt(gx, gy) {
    if (Math.sqrt(gx*gx + gy*gy) < 20) return null; 
    
    let t = getTerrainFast(gx, gy);
    if (t.roadType && t.roadType !== 0 && t.roadMinDist < 6.0) return null;
    if (t.isLake || t.baseH <= t.oceanSurface) return null; 

    let cluster = fbm2D(gx * 0.1, gy * 0.1, 2);
    let flowerCluster = fbm2D(gx * 0.08 + 200, gy * 0.08 + 200, 2);
    let rockCluster = fbm2D(gx * 0.035 + 500, gy * 0.035 + 500, 2);
    let h = entityHash(gx, gy, 0);
    let fh_rock = entityHash(gx, gy, 8);
    
    if (t.elevation > 0.70) { 
        if (cluster > 0.5 && h < 0.05) return '🌲';
        
        if (rockCluster > 0.58) {
            if (fh_rock < 0.18) return '🪨';
        } else {
            if (fh_rock < 0.015) return '🪨';
        }
    } else if (t.moisture < 0.35) { 
        if (h < 0.01) return '💀'; 
        
        let cactusCluster = fbm2D(gx * 0.15 + 800, gy * 0.15 + 800, 2);
        let fh_cactus = entityHash(gx, gy, 9);
        if (cactusCluster > 0.68) {
            if (fh_cactus < 0.20) return '🌵';
        } else {
            if (fh_cactus < 0.001) return '🌵';
        }
        
        if (rockCluster > 0.58) {
            if (fh_rock < 0.12) return '🪨';
        } else {
            if (fh_rock < 0.008) return '🪨';
        }
    } else if (t.moisture > 0.6) { 
        if (cluster > 0.3) { 
            if (h < 0.20) return '🌳'; 
            if (h < 0.25) return '🪾'; 
        } else {
            if (flowerCluster > 0.62) { 
                let fh = entityHash(gx, gy, 5);
                if (fh < 0.18) return '🌹'; 
                if (fh < 0.30) return '🌻'; 
            }
            
            if (rockCluster > 0.62) {
                if (fh_rock < 0.08) return '🪨';
            } else {
                if (fh_rock < 0.004) return '🪨';
            }
        }
    } else { 
        if (cluster > 0.6 && h < 0.05) return '🌳'; 
        
        if (flowerCluster > 0.62) {
            let fh = entityHash(gx, gy, 5);
            if (fh < 0.18) return '🌼'; 
            if (fh < 0.30) return '🌷'; 
        }
        
        if (rockCluster > 0.62) {
            if (fh_rock < 0.12) return '🪨';
        } else {
            if (fh_rock < 0.006) return '🪨';
        }
    }
    return null;
}

function getEntityBaseInfo(x, y) {
    const key = (x | 0) * 10007 + (y | 0); 
    if (entityInfoCache.has(key)) return entityInfoCache.get(key);
    
    let em = getEntityAt(x, y), result = null;
    if (em) {
        let v = entityHash(x, y, 10), finalSize = ENTITIES_DATA[em].baseSize, solid = ENTITIES_DATA[em].solid, plantOffset = 0.1; 
        if (em === '🪨') { 
            if (v < 0.55) { finalSize = 0.25; solid = false; plantOffset = 0.05; } 
            else if (v > 0.89) { finalSize = 1.6; plantOffset = 0.3; } 
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
    if (entityInfoCache.size > 5000000) entityInfoCache.clear();
    entityInfoCache.set(key, result); return result;
}

function getMapChunk(cx, cy) {
    const key = `${cx},${cy}`; 
    if (mapChunks.has(key)) return mapChunks.get(key);
    
    let chunk = [];
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
            let info = getEntityBaseInfo(x, y); 
            let entKey = `${x},${y}`;
            if (info && !destroyedEntities.has(entKey)) {
                let jx = 0, jy = 0;
                if (FLOWER_EMOJIS.has(info.emoji)) {
                    jx = (entityHash(x, y, 20) - 0.5) * 0.85;
                    jy = (entityHash(x, y, 21) - 0.5) * 0.85;
                } else if (info.emoji === '🪨' || info.emoji === '🌵' || info.emoji === '💀') {
                    jx = (entityHash(x, y, 20) - 0.5) * 0.7;
                    jy = (entityHash(x, y, 21) - 0.5) * 0.7;
                } else if (TREE_EMOJIS.has(info.emoji)) {
                    jx = (entityHash(x, y, 20) - 0.5) * 0.4;
                    jy = (entityHash(x, y, 21) - 0.5) * 0.4;
                }
                
                let wx = x + 0.5 + jx;
                let wy = y + 0.5 + jy;
                
                let floorIntZ = MAX_Z - 1;
                while(floorIntZ >= 0 && !isVoxelSolid(getVoxel(Math.floor(wx), Math.floor(wy), floorIntZ))) floorIntZ--;
                if (floorIntZ < 0) continue; 
                
                let topV = getVoxel(Math.floor(wx), Math.floor(wy), floorIntZ);
                let surfaceH = floorIntZ + ((topV === 6) ? 0.5 : 1.0);
                chunk.push({ type: 'emoji', emoji: info.emoji, size: info.size, wx: wx, wy: wy, h: surfaceH - info.plantOffset, hp: 4, entKey: entKey }); 
            }
        }
    }
    
    let chunkHash = entityHash(cx, cy, 5), cx_offset = cx * CHUNK_SIZE + CHUNK_SIZE / 2, cy_offset = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
    let bZInt = MAX_Z - 1;
    while (bZInt >= 0 && !isVoxelSolid(getVoxel(Math.floor(cx_offset), Math.floor(cy_offset), bZInt))) bZInt--;
    let topV = getVoxel(Math.floor(cx_offset), Math.floor(cy_offset), bZInt);
    let bZ = bZInt + ((topV === 6) ? 0.5 : 1.0);

    if (getVoxel(Math.floor(cx_offset), Math.floor(cy_offset), bZInt + 1) !== 2) {
        let centerT = getTerrainFast(cx_offset, cy_offset);
        let onRoad = centerT.roadType && centerT.roadMinDist < 6.0;
        if (!onRoad) {
            if (chunkHash > 0.94) {
                let items = new Array(10).fill(null); 
                for(let k = 0; k < Math.floor(entityHash(cx, cy, 7) * 4); k++) items[Math.floor(Math.random() * 10)] = { type: 'heal', emoji: '🩹', amount: 25 };
                containers.push({ x: cx_offset, y: cy_offset, z: bZ, emoji: ['🧳', '🎒', '📦'][Math.floor(chunkHash * 1000) % 3], size: 0.9, items: items });
            } else if (chunkHash > 0.88 && chunkHash <= 0.94) {
                let def = ANIMAL_TYPES[Math.floor(chunkHash * 1000) % ANIMAL_TYPES.length];
                animals.push({ x: cx_offset, y: cy_offset, z: bZ, emoji: def.emoji, size: def.size, hp: def.hp, speed: def.speed, dead: false, drop: def.drop, moveAngle: Math.random() * Math.PI * 2, moveTimer: 0 });
            }
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
                let v = getVoxel(x, y, z);
                if (isVoxelSolid(v)) {
                    let topHeight = (v === 6) ? 0.5 : 1.0;
                    if (nz < z + topHeight && nz + pHeight > z) {
                        return true;
                    }
                }
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

function dropMinedItem(x, y, z, v) {
    if (v === 3) {
        spawnDroppedItemAt({ id: 'cube', type: 'block', emoji: '🧊', count: 1 }, x + 0.5, y + 0.5, z + 0.5);
    } else if (v === 4) {
        spawnDroppedItemAt({ id: 'wood_block', type: 'block', emoji: '🪵', count: 1 }, x + 0.5, y + 0.5, z + 0.5);
    } else if (v === 5) {
        spawnDroppedItemAt({ id: 'stone_block', type: 'block', emoji: '🪨', count: 1 }, x + 0.5, y + 0.5, z + 0.5);
    } else if (v === 1 || v === 6) {
        let t = getTerrainFast(x, y);
        let depthFromMacro = t.baseH - z;
        let rockDepth = t.elevation > 0.65 ? 3.0 : 6.0;
        let isSurface = !isVoxelSolid(getVoxel(x, y, z + 1));
        let isStone = (depthFromMacro > rockDepth || (isSurface && depthFromMacro > 15.0));

        if (isStone) {
            for (let i = 0; i < 4; i++) {
                spawnDroppedItemAt({ type: 'resource', emoji: '🪨', count: 1 }, x + 0.5, y + 0.5, z + 0.5);
            }
        } else {
            spawnDroppedItemAt({ id: 'dirt', type: 'block', emoji: '🟫', count: 1 }, x + 0.5, y + 0.5, z + 0.5);
        }
    }
}