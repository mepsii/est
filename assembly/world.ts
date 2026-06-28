// assembly/world.ts

// --- Globals ---
let worldSeed: f64 = 0.0;

export function init(seed: f64): void {
  worldSeed = seed;
}

// --- Terrain & Voxel Cache ---
class TerrainData {
  baseH: f64;
  lakeSurface: f64;
  isLake: bool;
  oceanSurface: f64;
  moisture: f64;
  elevation: f64;
  roadType: i32;
  roadH: f64;
  roadMinDist: f64;
  roadT: f64;
  roadSegLen: f64;
}

const terrainCache = new Map<u64, TerrainData>();

@inline
function getTerrainKey(x: i32, y: i32): u64 {
  return ((x as u32 as u64) << 32) | (y as u32 as u64);
}

// Packed coordinates map for block modifications:
// Key: (x & 0xFFFFFF) << 40 | (y & 0xFFFFFF) << 16 | (z & 0xFFFF)
const voxelMods = new Map<u64, i32>();

// --- Noise Functions ---
@inline
function hash(x: f64, y: f64, z: f64): f64 {
  let h = (x * 127.1 + y * 311.7 + z * 74.7 + worldSeed) * 43758.5453123;
  return h - Math.floor(h);
}

@inline
function lerp(a: f64, b: f64, t: f64): f64 {
  return a + (b - a) * (3.0 - t * 2.0) * t * t;
}

function noise3D(x: f64, y: f64, z: f64): f64 {
  let xi = Math.floor(x);
  let yi = Math.floor(y);
  let zi = Math.floor(z);
  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;

  let v000 = hash(xi, yi, zi);
  let v100 = hash(xi + 1, yi, zi);
  let v010 = hash(xi, yi + 1, zi);
  let v110 = hash(xi + 1, yi + 1, zi);
  let v001 = hash(xi, yi, zi + 1);
  let v101 = hash(xi + 1, yi, zi + 1);
  let v011 = hash(xi, yi + 1, zi + 1);
  let v111 = hash(xi + 1, yi + 1, zi + 1);

  let x1 = lerp(v000, v100, xf);
  let x2 = lerp(v010, v110, xf);
  let x3 = lerp(v001, v101, xf);
  let x4 = lerp(v011, v111, xf);

  let y1 = lerp(x1, x2, yf);
  let y2 = lerp(x3, x4, yf);

  return lerp(y1, y2, zf);
}

@inline
function noise2D(x: f64, y: f64): f64 {
  return noise3D(x, y, 0.0);
}

function fbm2D(x: f64, y: f64, octaves: i32): f64 {
  let v = 0.0;
  let a = 0.5;
  let f = 1.0;
  for (let i = 0; i < octaves; i++) {
    v += noise2D(x * f, y * f) * a;
    f *= 2.0;
    a *= 0.5;
  }
  return v;
}

// --- Road Query Results (Singletons to avoid GC allocation) ---
let roadTypeResult: i32 = 0;
let roadHResult: f64 = 0.0;
let roadMinDistResult: f64 = 999999.0;
let roadTResult: f64 = 0.0;
let roadSegLenResult: f64 = 0.0;

@inline
function nodeHash(i: i32, j: i32, seedOffset: f64): f64 {
  let h = ((i as f64) * 127.1 + (j as f64) * 311.7 + seedOffset + worldSeed) * 43758.5453123;
  return h - Math.floor(h);
}

function getNaturalHeight(x: f64, y: f64): f64 {
  let nx = x * 0.003;
  let ny = y * 0.003;
  let elevation = fbm2D(nx, ny, 4);
  let roughness = fbm2D(nx * 3.0, ny * 3.0, 3);
  return elevation * 60.0 + 10.0 + (roughness * 10.0 * elevation);
}

function getNaturalHeightWithWater(x: f64, y: f64): f64 {
  let nx = x * 0.003, ny = y * 0.003;

  let elevation = fbm2D(nx, ny, 4);
  let roughness = fbm2D(nx * 3.0, ny * 3.0, 3);

  let baseH = elevation * 60.0 + 10.0 + (roughness * 10.0 * elevation);
  let oceanSurface = 24.0;

  let heightDiff = Math.max(0.0, baseH - oceanSurface);
  let dynamicValleyWidth = 0.06 + (heightDiff * 0.004);

  let riverNoise = Math.abs(fbm2D(nx * 1.2 + 50.0, ny * 1.2 + 50.0, 3) - 0.5) * 2.0;

  if (riverNoise < dynamicValleyWidth && baseH > oceanSurface - 5.0) {
    let riverCenter = 0.015;
    let carveAlpha = 0.0;

    if (riverNoise < riverCenter) {
      carveAlpha = 1.0;
    } else {
      let t = 1.0 - ((riverNoise - riverCenter) / (dynamicValleyWidth - riverCenter));
      carveAlpha = t * t * (3.0 - 2.0 * t);
    }

    let riverBottom = oceanSurface - 3.0 - (roughness * 2.0);
    baseH = lerp(baseH, riverBottom, carveAlpha);
  }

  let lakeMask = fbm2D(nx * 4.0 + 20.0, ny * 4.0 + 20.0, 2);
  let pondMask = fbm2D(nx * 15.0, ny * 15.0, 2);

  if (lakeMask > 0.65 || pondMask > 0.72) {
    let poolLevel = Math.floor((baseH - 1.0) / 4.0) * 4.0;
    let lakeSurface = Math.max(oceanSurface, poolLevel);
    let maskVal = lakeMask > 0.65 ? (lakeMask - 0.65) * 3.0 : (pondMask - 0.72) * 4.0;
    let t = Math.min(1.0, maskVal * 1.5);
    let depthCurve = t * t * (3.0 - 2.0 * t);
    let depth = depthCurve * 15.0;
    baseH = Math.min(baseH, lakeSurface + 1.5 - depth);
  }

  return baseH;
}

function queryRoad(x: f64, y: f64): void {
  let S: f64 = 256.0;
  let cellX = Math.floor(x / S) as i32;
  let cellY = Math.floor(y / S) as i32;

  roadMinDistResult = 999999.0;
  roadTypeResult = 0;
  roadTResult = 0.0;
  roadSegLenResult = 0.0;
  roadHResult = 0.0;

  for (let i = cellX - 1; i <= cellX + 1; i++) {
    for (let j = cellY - 1; j <= cellY + 1; j++) {
      let densityA = noise2D((i as f64) * 0.05, (j as f64) * 0.05);
      if (densityA <= 0.05) continue;

      let jxA = (nodeHash(i, j, 1.0) - 0.5) * 0.4 * S;
      let jyA = (nodeHash(i, j, 2.0) - 0.5) * 0.4 * S;
      let ax = (i as f64) * S + jxA;
      let ay = (j as f64) * S + jyA;

      // Connection 1: right neighbor (i+1, j)
      let densityB1 = noise2D(((i + 1) as f64) * 0.05, (j as f64) * 0.05);
      if (densityB1 > 0.05 && nodeHash(i, j, 3.0) > 0.10) {
        let jxB = (nodeHash(i + 1, j, 1.0) - 0.5) * 0.4 * S;
        let jyB = (nodeHash(i + 1, j, 2.0) - 0.5) * 0.4 * S;
        let bx = ((i + 1) as f64) * S + jxB;
        let by = (j as f64) * S + jyB;

        let dx = bx - ax;
        let dy = by - ay;
        let lenSq = dx * dx + dy * dy;
        if (lenSq > 0.0) {
          let mx = ax + 0.5 * dx;
          let my = ay + 0.5 * dy;
          let roadTypeNoise = noise2D(mx * 0.0002, my * 0.0002);
          let isAsphalt = (roadTypeNoise > 0.45);

          // Warp coordinates per road type:
          let warpFactor = isAsphalt ? 4.0 : 36.0;
          let warpFreq = isAsphalt ? 0.003 : 0.02;
          let wx = x + (noise2D(x * warpFreq, y * warpFreq) - 0.5) * warpFactor;
          let wy = y + (noise2D(x * warpFreq + 100.0, y * warpFreq + 100.0) - 0.5) * warpFactor;

          let hA = getNaturalHeight(ax, ay);
          let hB = getNaturalHeight(bx, by);
          let allowed = true;
          let crosses = false;
          let bridgeThreshold = isAsphalt ? 8.0 : 16.0;

          for (let step = 1; step <= 3; step++) {
            let tVal = (step as f64) * 0.25;
            let px = ax + tVal * dx;
            let py = ay + tVal * dy;
            let hC = lerp(hA, hB, tVal);
            let hN = getNaturalHeight(px, py);
            let blend = 0.25;
            if (isAsphalt) {
              if (hN > hC) {
                let allowDeepCut = (nodeHash(i, j, 8.0) < 0.15);
                blend = allowDeepCut ? 0.20 : 0.95;
              } else {
                blend = 0.20;
              }
            } else {
              blend = 1.0;
            }
            let rH = hC * (1.0 - blend) + hN * blend;
            let aH = getNaturalHeightWithWater(px, py);
            if (aH <= 24.5 || (rH - aH) > bridgeThreshold) {
              crosses = true;
              break;
            }
          }
          if (crosses) {
            let segHash = nodeHash(i, j, 5.0);
            let bridgeAllowChance = isAsphalt ? 0.15 : 0.001;
            if (segHash > bridgeAllowChance) {
              allowed = false;
            }
          }

          if (allowed) {
            let t = ((wx - ax) * dx + (wy - ay) * dy) / lenSq;
            t = Math.max(0.0, Math.min(1.0, t));
            let projx = ax + t * dx;
            let projy = ay + t * dy;
            let distx = wx - projx;
            let disty = wy - projy;
            let dist = Math.sqrt(distx * distx + disty * disty);
            if (dist < roadMinDistResult) {
              roadMinDistResult = dist;
              roadTResult = t;
              roadSegLenResult = Math.sqrt(lenSq);
              let hC = lerp(hA, hB, t);
              let hN = getNaturalHeight(projx, projy);
              let blend = 0.25;
              if (isAsphalt) {
                if (hN > hC) {
                  let allowDeepCut = (nodeHash(i, j, 8.0) < 0.15);
                  blend = allowDeepCut ? 0.20 : 0.95;
                } else {
                  blend = 0.20;
                }
              } else {
                blend = 1.0;
              }
              roadHResult = hC * (1.0 - blend) + hN * blend;
              roadTypeResult = isAsphalt ? 8 : 7;
            }
          }
        }
      }

      // Connection 2: top neighbor (i, j+1)
      let densityB2 = noise2D((i as f64) * 0.05, ((j + 1) as f64) * 0.05);
      if (densityB2 > 0.05 && nodeHash(i, j, 4.0) > 0.10) {
        let jxB = (nodeHash(i, j + 1, 1.0) - 0.5) * 0.4 * S;
        let jyB = (nodeHash(i, j + 1, 2.0) - 0.5) * 0.4 * S;
        let bx = (i as f64) * S + jxB;
        let by = ((j + 1) as f64) * S + jyB;

        let dx = bx - ax;
        let dy = by - ay;
        let lenSq = dx * dx + dy * dy;
        if (lenSq > 0.0) {
          let mx = ax + 0.5 * dx;
          let my = ay + 0.5 * dy;
          let roadTypeNoise = noise2D(mx * 0.0002, my * 0.0002);
          let isAsphalt = (roadTypeNoise > 0.45);

          // Warp coordinates per road type:
          let warpFactor = isAsphalt ? 4.0 : 36.0;
          let warpFreq = isAsphalt ? 0.003 : 0.02;
          let wx = x + (noise2D(x * warpFreq, y * warpFreq) - 0.5) * warpFactor;
          let wy = y + (noise2D(x * warpFreq + 100.0, y * warpFreq + 100.0) - 0.5) * warpFactor;

          let hA = getNaturalHeight(ax, ay);
          let hB = getNaturalHeight(bx, by);
          let allowed = true;
          let crosses = false;
          let bridgeThreshold = isAsphalt ? 8.0 : 16.0;

          for (let step = 1; step <= 3; step++) {
            let tVal = (step as f64) * 0.25;
            let px = ax + tVal * dx;
            let py = ay + tVal * dy;
            let hC = lerp(hA, hB, tVal);
            let hN = getNaturalHeight(px, py);
            let blend = 0.25;
            if (isAsphalt) {
              if (hN > hC) {
                let allowDeepCut = (nodeHash(i, j, 9.0) < 0.15);
                blend = allowDeepCut ? 0.20 : 0.95;
              } else {
                blend = 0.20;
              }
            } else {
              blend = 1.0;
            }
            let rH = hC * (1.0 - blend) + hN * blend;
            let aH = getNaturalHeightWithWater(px, py);
            if (aH <= 24.5 || (rH - aH) > bridgeThreshold) {
              crosses = true;
              break;
            }
          }
          if (crosses) {
            let segHash = nodeHash(i, j, 6.0);
            let bridgeAllowChance = isAsphalt ? 0.15 : 0.001;
            if (segHash > bridgeAllowChance) {
              allowed = false;
            }
          }

          if (allowed) {
            let t = ((wx - ax) * dx + (wy - ay) * dy) / lenSq;
            t = Math.max(0.0, Math.min(1.0, t));
            let projx = ax + t * dx;
            let projy = ay + t * dy;
            let distx = wx - projx;
            let disty = wy - projy;
            let dist = Math.sqrt(distx * distx + disty * disty);
            if (dist < roadMinDistResult) {
              roadMinDistResult = dist;
              roadTResult = t;
              roadSegLenResult = Math.sqrt(lenSq);
              let hC = lerp(hA, hB, t);
              let hN = getNaturalHeight(projx, projy);
              let blend = 0.25;
              if (isAsphalt) {
                if (hN > hC) {
                  let allowDeepCut = (nodeHash(i, j, 9.0) < 0.15);
                  blend = allowDeepCut ? 0.20 : 0.95;
                } else {
                  blend = 0.20;
                }
              } else {
                blend = 1.0;
              }
              roadHResult = hC * (1.0 - blend) + hN * blend;
              roadTypeResult = isAsphalt ? 8 : 7;
            }
          }
        }
      }
    }
  }
}

// --- Terrain Generation ---
function getTerrain(x: f64, y: f64): TerrainData {
  let nx = x * 0.003, ny = y * 0.003;

  let elevation = fbm2D(nx, ny, 4);
  let moisture = fbm2D(nx + 100.0, ny + 100.0, 3);
  let roughness = fbm2D(nx * 3.0, ny * 3.0, 3);

  let baseH = elevation * 60.0 + 10.0 + (roughness * 10.0 * elevation);
  let oceanSurface = 24.0;
  let lakeSurface = 0.0;
  let isLake = false;

  let heightDiff = Math.max(0.0, baseH - oceanSurface);
  let dynamicValleyWidth = 0.06 + (heightDiff * 0.004);

  let riverNoise = Math.abs(fbm2D(nx * 1.2 + 50.0, ny * 1.2 + 50.0, 3) - 0.5) * 2.0;

  if (riverNoise < dynamicValleyWidth && baseH > oceanSurface - 5.0) {
    let riverCenter = 0.015;
    let carveAlpha = 0.0;

    if (riverNoise < riverCenter) {
      carveAlpha = 1.0;
    } else {
      let t = 1.0 - ((riverNoise - riverCenter) / (dynamicValleyWidth - riverCenter));
      carveAlpha = t * t * (3.0 - 2.0 * t);
    }

    let riverBottom = oceanSurface - 3.0 - (roughness * 2.0);
    baseH = lerp(baseH, riverBottom, carveAlpha);
  }

  let lakeMask = fbm2D(nx * 4.0 + 20.0, ny * 4.0 + 20.0, 2);
  let pondMask = fbm2D(nx * 15.0, ny * 15.0, 2);

  if (lakeMask > 0.65 || pondMask > 0.72) {
    isLake = true;
    let poolLevel = Math.floor((baseH - 1.0) / 4.0) * 4.0;
    lakeSurface = Math.max(oceanSurface, poolLevel);
    let maskVal = lakeMask > 0.65 ? (lakeMask - 0.65) * 3.0 : (pondMask - 0.72) * 4.0;
    let t = Math.min(1.0, maskVal * 1.5);
    let depthCurve = t * t * (3.0 - 2.0 * t);
    let depth = depthCurve * 15.0;
    baseH = Math.min(baseH, lakeSurface + 1.5 - depth);
  }

  // Query road
  queryRoad(x, y);
  let roadType = 0;
  let roadH = 0.0;
  let roadMinDist = 999999.0;
  let roadT = 0.0;
  let roadSegLen = 0.0;

  if (roadTypeResult != 0) {
    roadType = roadTypeResult;
    roadH = roadHResult;
    roadMinDist = roadMinDistResult;
    roadT = roadTResult;
    roadSegLen = roadSegLenResult;

    if (roadH > baseH + 3.0) {
      // Bridge: do not modify baseH (keep natural valley open)
    } else {
      let widthLimit: f64 = (roadType == 8 || roadType == 18) ? 4.2 : 3.0;
      let blendLimit: f64 = widthLimit + 3.0;
      let alpha = 0.0;
      if (roadMinDist < widthLimit) {
        alpha = 1.0;
      } else if (roadMinDist < blendLimit) {
        alpha = 1.0 - (roadMinDist - widthLimit) / 3.0;
      }
      baseH = lerp(baseH, roadH, alpha);
    }
  }

  let res = new TerrainData();
  res.baseH = baseH;
  res.lakeSurface = lakeSurface;
  res.isLake = isLake;
  res.oceanSurface = oceanSurface;
  res.moisture = moisture;
  res.elevation = elevation;
  res.roadType = roadType;
  res.roadH = roadH;
  res.roadMinDist = roadMinDist;
  res.roadT = roadT;
  res.roadSegLen = roadSegLen;
  return res;
}

function getTerrainFast(x: i32, y: i32): TerrainData {
  let key = getTerrainKey(x, y);
  if (terrainCache.has(key)) {
    return terrainCache.get(key);
  }
  let t = getTerrain(x as f64, y as f64);
  terrainCache.set(key, t);
  if (terrainCache.size > 15000000) {
    terrainCache.clear();
  }
  return t;
}

// --- Terrain Getters for JS ---
export function getTerrainBaseH(x: i32, y: i32): f64 { return getTerrainFast(x, y).baseH; }
export function getTerrainLakeSurface(x: i32, y: i32): f64 { return getTerrainFast(x, y).lakeSurface; }
export function getTerrainIsLake(x: i32, y: i32): bool { return getTerrainFast(x, y).isLake; }
export function getTerrainOceanSurface(x: i32, y: i32): f64 { return getTerrainFast(x, y).oceanSurface; }
export function getTerrainMoisture(x: i32, y: i32): f64 { return getTerrainFast(x, y).moisture; }
export function getTerrainElevation(x: i32, y: i32): f64 { return getTerrainFast(x, y).elevation; }
export function getTerrainRoadType(x: i32, y: i32): i32 { return getTerrainFast(x, y).roadType; }
export function getTerrainRoadMinDist(x: i32, y: i32): f64 { return getTerrainFast(x, y).roadMinDist; }
export function getTerrainRoadH(x: i32, y: i32): f64 { return getTerrainFast(x, y).roadH; }
export function getTerrainRoadT(x: i32, y: i32): f64 { return getTerrainFast(x, y).roadT; }
export function getTerrainRoadSegLen(x: i32, y: i32): f64 { return getTerrainFast(x, y).roadSegLen; }

@inline
function isVoxelSolid(v: i32): bool {
  return v == 1 || v == 6 || v >= 3;
}

@inline
function isVoxelCube(v: i32): bool {
  return v >= 3 && v != 6 && v != 7 && v != 8;
}

@inline
function shouldRenderFace(v: i32, neighbor: i32): bool {
  if (!isVoxelSolid(neighbor)) return true;
  if (isVoxelCube(v) != isVoxelCube(neighbor)) return true;
  return false;
}

// --- Voxel Storage ---
function getVoxel(x: i32, y: i32, z: i32, t: TerrainData): i32 {
  if (z < 0) return 1;
  if (z >= 96) return 0; // MAX_Z

  let modKey = (((x & 0xFFFFFF) as u32 as u64) << 40) | (((y & 0xFFFFFF) as u32 as u64) << 16) | ((z & 0xFFFF) as u32 as u64);
  if (voxelMods.has(modKey)) {
    let mod = voxelMods.get(modKey);
    return mod <= 0 ? 0 : mod;
  }

  if (t.roadType != 0) {
    let isBridge = (t.roadH > t.baseH + 3.0);
    let widthLimit: f64 = (t.roadType == 8 || t.roadType == 18) ? 4.2 : 3.0;
    if (isBridge) {
      if (t.roadMinDist < widthLimit) {
        let isBarrier = (t.roadMinDist >= (widthLimit - 0.6));
        let roadZ = Math.floor(t.roadH) as i32;

        if (isBarrier) {
          if (z == roadZ || z == roadZ + 1 || z == roadZ - 1) {
            return t.roadType == 7 ? 4 : 3; // Wood (4) for dirt road, Concrete (3) for asphalt
          }
          if (z > roadZ + 1) {
            return 0; // Air above barrier
          }
        } else {
          if (z == roadZ || z == roadZ - 1) {
            return t.roadType; // Asphalt (8) or Dirt (7) road deck
          }
          if (z > roadZ) {
            return 0; // Air above road
          }
        }

        if (z < roadZ - 1) {
          let naturalV = 0;
          let density = t.baseH - (z as f64);
          if (density < -15.0) {
            if (z <= (t.oceanSurface as i32)) naturalV = 2;
            else if (t.isLake && z <= (t.lakeSurface as i32)) naturalV = 2;
          } else if (density > 20.0) {
            naturalV = 1;
          } else {
            let structure = noise3D((x as f64) * 0.04, (y as f64) * 0.04, (z as f64) * 0.04);
            let densityAdjusted = density + structure * 10.0;
            if (densityAdjusted > 0.0) {
              naturalV = 1;
            } else {
              if (z <= (t.oceanSurface as i32)) naturalV = 2;
              else if (t.isLake && z <= (t.lakeSurface as i32)) naturalV = 2;
            }
          }

          if (naturalV == 1) {
            return 1;
          }

          // Generate support pillars under the bridge
          let distAlongSeg = t.roadT * t.roadSegLen;
          let isPillar = (t.roadMinDist < 1.0) && (Math.abs(distAlongSeg - Math.round(distAlongSeg / 12.0) * 12.0) < 1.0);
          if (isPillar) {
            return t.roadType == 7 ? 4 : 3; // Wood (4) for dirt road, Concrete (3) for asphalt
          }

          return naturalV;
        }
      }
    } else {
      if (t.roadMinDist < widthLimit) {
        let roadZ = Math.floor(t.baseH) as i32;
        if (z == roadZ) {
          return t.roadType; // Road surface block
        }
      }
    }
  }

  let density = t.baseH - (z as f64);

  if (density < -15.0) {
    if (z <= (t.oceanSurface as i32)) return 2;
    if (t.isLake && z <= (t.lakeSurface as i32)) return 2;
    return 0;
  }
  if (density > 20.0) return 1;

  let structure = noise3D((x as f64) * 0.04, (y as f64) * 0.04, (z as f64) * 0.04);
  let structureScale = 1.0;
  if (t.roadType != 0) {
    let isBridge = (t.roadH > t.baseH + 3.0);
    if (!isBridge) {
      let widthLimit: f64 = (t.roadType == 8 || t.roadType == 18) ? 4.2 : 3.0;
      let blendLimit: f64 = widthLimit + 3.0;
      let alpha = 0.0;
      if (t.roadMinDist < widthLimit) {
        alpha = 1.0;
      } else if (t.roadMinDist < blendLimit) {
        alpha = 1.0 - (t.roadMinDist - widthLimit) / 3.0;
      }
      structureScale = 1.0 - alpha;
    }
  }
  density += structure * 10.0 * structureScale;

  let depth = t.baseH - (z as f64);
  if (depth > 12.0) {
    let caveNoise = Math.abs(noise3D((x as f64) * 0.03, (y as f64) * 0.03, (z as f64) * 0.03) - 0.5) * 2.0;
    if (caveNoise < 0.25) {
      density -= (0.25 - caveNoise) * 40.0;
    }
  }

  if (density > 0.5) return 1;
  if (density > 0.0) return 6;
  if (z <= (t.oceanSurface as i32)) return 2;
  if (t.isLake && z <= (t.lakeSurface as i32)) return 2;

  return 0;
}

export function getVoxelWasm(x: i32, y: i32, z: i32): i32 {
  let t = getTerrainFast(x, y);
  return getVoxel(x, y, z, t);
}

export function getSolidWasm(x: i32, y: i32, z: i32): bool {
  let v = getVoxelWasm(x, y, z);
  return isVoxelSolid(v);
}

class ColorData {
  r: u8;
  g: u8;
  b: u8;
}

@inline
function clampColor(val: f64): u8 {
  if (val < 0.0) return 0;
  if (val > 255.0) return 255;
  return val as u8;
}

function getVoxelColor(x: i32, y: i32, z: i32, vType: i32, t: TerrainData): ColorData {
  let v = vType;
  if (v == 3) {
    let col = new ColorData();
    col.r = 150; col.g = 150; col.b = 150;
    return col;
  }
  if (v == 4) {
    let col = new ColorData();
    col.r = 160; col.g = 110; col.b = 60;
    return col;
  }
  if (v == 5) {
    let col = new ColorData();
    col.r = 140; col.g = 140; col.b = 140;
    return col;
  }
  if (v == 7 || v == 17) {
    let col = new ColorData();
    let noise = hash(x as f64, y as f64, z as f64) * 12.0;
    col.r = clampColor(110.0 + noise);
    col.g = clampColor(85.0 + noise);
    col.b = clampColor(55.0 + noise);
    return col;
  }
  if (v == 8 || v == 18) {
    let col = new ColorData();
    let noise = hash(x as f64, y as f64, z as f64) * 8.0;
    col.r = clampColor(55.0 + noise);
    col.g = clampColor(55.0 + noise);
    col.b = clampColor(58.0 + noise);
    return col;
  }

  let depthFromMacro = t.baseH - (z as f64);
  let colorNoise = hash(x as f64, y as f64, z as f64) * 15.0;

  let upV = getVoxel(x, y, z + 1, t);
  let isSurface = !isVoxelSolid(upV);
  let isUnderWater = (z <= (t.oceanSurface as i32)) || (t.isLake && z <= (t.lakeSurface as i32));

  let rockDepth = t.elevation > 0.65 ? 3.0 : 6.0;
  if (depthFromMacro > rockDepth || (isSurface && depthFromMacro > 15.0)) {
    let rv = 90.0 + colorNoise;
    let col = new ColorData();
    col.r = clampColor(rv);
    col.g = clampColor(rv * 0.95);
    col.b = clampColor(rv * 0.9);
    return col;
  }

  if (!isSurface || isUnderWater) {
    if (isUnderWater && (z >= (t.oceanSurface as i32) - 2 || (t.isLake && z >= (t.lakeSurface as i32) - 2))) {
      let col = new ColorData();
      col.r = clampColor(200.0 + colorNoise);
      col.g = clampColor(180.0 + colorNoise);
      col.b = clampColor(130.0 + colorNoise);
      return col;
    }
    let col = new ColorData();
    col.r = clampColor(95.0 + colorNoise);
    col.g = clampColor(65.0 + colorNoise);
    col.b = clampColor(35.0 + colorNoise);
    return col;
  }

  if ((z >= (t.oceanSurface as i32) && (z as f64) <= t.oceanSurface + 1.5) || (t.isLake && z >= (t.lakeSurface as i32) && (z as f64) <= t.lakeSurface + 1.5)) {
    let col = new ColorData();
    col.r = clampColor(210.0 + colorNoise);
    col.g = clampColor(200.0 + colorNoise);
    col.b = clampColor(150.0 + colorNoise);
    return col;
  }
  if (t.elevation > 0.70 && (z as f64) > t.baseH - 2.0) {
    let col = new ColorData();
    col.r = clampColor(240.0 + colorNoise);
    col.g = clampColor(245.0 + colorNoise);
    col.b = clampColor(255.0 + colorNoise);
    return col;
  }
  if (t.moisture < 0.35) {
    let col = new ColorData();
    col.r = clampColor(200.0 + colorNoise);
    col.g = clampColor(175.0 + colorNoise);
    col.b = clampColor(110.0 + colorNoise);
    return col;
  }
  if (t.moisture > 0.6) {
    let col = new ColorData();
    col.r = clampColor(55.0 + colorNoise);
    col.g = clampColor(120.0 + colorNoise);
    col.b = clampColor(45.0 + colorNoise);
    return col;
  }
  let col = new ColorData();
  col.r = clampColor(85.0 + colorNoise);
  col.g = clampColor(150.0 + colorNoise);
  col.b = clampColor(65.0 + colorNoise);
  return col;
}

export function getVoxelColorWasm(x: i32, y: i32, z: i32): u32 {
  let t = getTerrainFast(x, y);
  let v = getVoxel(x, y, z, t);
  let col = getVoxelColor(x, y, z, v, t);
  return (col.r as u32) | ((col.g as u32) << 8) | ((col.b as u32) << 16);
}

export function modifyTerrainWasm(cx: f64, cy: f64, cz: f64, radius: f64, amount: i32): void {
  let x_start = Math.floor(cx - radius) as i32;
  let x_end = Math.ceil(cx + radius) as i32;
  let y_start = Math.floor(cy - radius) as i32;
  let y_end = Math.ceil(cy + radius) as i32;
  let z_start = Math.floor(cz - radius) as i32;
  let z_end = Math.ceil(cz + radius) as i32;

  for (let x = x_start; x <= x_end; x++) {
    for (let y = y_start; y <= y_end; y++) {
      for (let z = z_start; z <= z_end; z++) {
        let dx = (x as f64) - cx;
        let dy = (y as f64) - cy;
        let dz = (z as f64) - cz;
        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist <= radius && z >= 0 && z < 96) {
          let modKey = (((x & 0xFFFFFF) as u32 as u64) << 40) | (((y & 0xFFFFFF) as u32 as u64) << 16) | ((z & 0xFFFF) as u32 as u64);
          voxelMods.set(modKey, amount);
        }
      }
    }
  }
}

// --- Chunk Meshing Buffer & Structs ---
class Vertex {
  x: f32;
  y: f32;
  z: f32;
}

const CHUNK_SIZE_VAL: i32 = 32;
const PADDED_SIZE: i32 = CHUNK_SIZE_VAL + 2;
const LAYER_SIZE: i32 = PADDED_SIZE * PADDED_SIZE;
const VOXEL_BUFFER_SIZE: i32 = PADDED_SIZE * PADDED_SIZE * 98;
const MESH_BUFFER_SIZE: i32 = 960000;

// pre-allocated voxels buffer for chunk meshing (neighborhood includes padding: size 34x34x98)
const voxels = new Uint8Array(VOXEL_BUFFER_SIZE);

// pre-allocated flat mesh buffer (max 40,000 faces, each 24 floats = 960,000 floats)
const meshBuffer = new Float32Array(MESH_BUFFER_SIZE);
let faceCount = 0;

export function getMeshBufferPointer(): usize {
  return changetype<usize>(meshBuffer.dataStart);
}

@inline
function getVoxelLocal(voxels: Uint8Array, lx: i32, ly: i32, lz: i32): u8 {
  return voxels[(lx + 1) + (ly + 1) * PADDED_SIZE + (lz + 1) * LAYER_SIZE];
}

function getSmoothVertexLocal(voxels: Uint8Array, lx: i32, ly: i32, lz: i32, gx: f32, gy: f32, gz: f32): Vertex {
  let sumX: f32 = 0;
  let sumY: f32 = 0;
  let sumZ: f32 = 0;
  let count: f32 = 0;
  let touchesCube = false;

  let hasHalfBelow = false;
  let hasFullBelow = false;
  let hasSolidAbove = false;

  for (let dx = -1; dx <= 0; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      for (let dz = -1; dz <= 0; dz++) {
        let v = getVoxelLocal(voxels, lx + dx, ly + dy, lz + dz);
        if (isVoxelCube(v)) touchesCube = true;
        if (isVoxelSolid(v)) {
          sumX += ((gx + (dx as f32)) as f32) + 0.5;
          sumY += ((gy + (dy as f32)) as f32) + 0.5;
          if (v == 6) {
            sumZ += ((gz + (dz as f32)) as f32) + 0.25;
          } else {
            sumZ += ((gz + (dz as f32)) as f32) + 0.5;
          }
          count += 1.0;

          if (dz == -1) {
            if (v == 6) {
              hasHalfBelow = true;
            } else {
              hasFullBelow = true;
            }
          } else if (dz == 0) {
            hasSolidAbove = true;
          }
        }
      }
    }
  }

  let res = new Vertex();
  if (touchesCube || count == 0.0 || count == 8.0) {
    res.x = gx; res.y = gy; res.z = gz;
  } else {
    let targetZ: f32 = (hasHalfBelow && !hasFullBelow && !hasSolidAbove) ? (gz - (0.5 as f32)) : gz;
    let w: f32 = 0.5;
    res.x = gx + (sumX / count - gx) * w;
    res.y = gy + (sumY / count - gy) * w;
    res.z = targetZ + (sumZ / count - targetZ) * w;
  }

  // Snap roadway surface vertices to the smooth grade of the road
  let t = getTerrainFast(gx as i32, gy as i32);
  if (t.roadType != 0) {
    let widthLimit: f64 = (t.roadType == 8 || t.roadType == 18) ? 4.2 : 3.0;
    let blendLimit: f64 = widthLimit + 3.0;
    if (t.roadMinDist < blendLimit) {
      let targetH = (t.roadH > t.baseH + 3.0) ? t.roadH : t.baseH;
      if ((gz as f64) > Math.floor(targetH) + 0.5 && Math.abs((gz as f64) - targetH) < 1.2) {
        let alpha = 0.0;
        if (t.roadMinDist < widthLimit) {
          alpha = 1.0;
        } else {
          alpha = 1.0 - (t.roadMinDist - widthLimit) / 3.0;
        }
        let roadZ = targetH as f32;
        res.x = (res.x * (1.0 - alpha as f32) + gx * alpha as f32) as f32;
        res.y = (res.y * (1.0 - alpha as f32) + gy * alpha as f32) as f32;
        res.z = (res.z * (1.0 - alpha as f32) + roadZ * alpha as f32) as f32;
      }
    }
  }

  return res;
}

function getWaterVertexLocal(
  voxels: Uint8Array,
  lx: i32, ly: i32, lz: i32,
  gx: f32, gy: f32, gz: f32,
  isTop: bool
): Vertex {
  let res = new Vertex();
  if (!isTop) {
    res.x = gx; res.y = gy; res.z = gz;
    return res;
  }
  let sv = getSmoothVertexLocal(voxels, lx, ly, lz, gx, gy, gz);
  res.x = sv.x;
  res.y = sv.y;
  res.z = gz - 0.55;
  return res;
}

function addFace(
  lx: i32, ly: i32, lz: i32,
  gx: i32, gy: i32, gz: i32,
  p1x: f32, p1y: f32, p1z: f32,
  p2x: f32, p2y: f32, p2z: f32,
  p3x: f32, p3y: f32, p3z: f32,
  p4x: f32, p4y: f32, p4z: f32,
  nx: f32, ny: f32, nz: f32,
  shade: f32,
  colR: u8, colG: u8, colB: u8, colA: u8,
  vType: i32,
  voxels: Uint8Array,
  t: TerrainData
): void {
  let v1 = new Vertex();
  let v2 = new Vertex();
  let v3 = new Vertex();
  let v4 = new Vertex();

  if (vType == 2) {
    let cx_start = gx - lx;
    let cy_start = gy - ly;
    v1 = getWaterVertexLocal(voxels, (p1x as i32) - cx_start, (p1y as i32) - cy_start, p1z as i32, p1x, p1y, p1z, p1z > (gz as f32));
    v2 = getWaterVertexLocal(voxels, (p2x as i32) - cx_start, (p2y as i32) - cy_start, p2z as i32, p2x, p2y, p2z, p2z > (gz as f32));
    v3 = getWaterVertexLocal(voxels, (p3x as i32) - cx_start, (p3y as i32) - cy_start, p3z as i32, p3x, p3y, p3z, p3z > (gz as f32));
    v4 = getWaterVertexLocal(voxels, (p4x as i32) - cx_start, (p4y as i32) - cy_start, p4z as i32, p4x, p4y, p4z, p4z > (gz as f32));
  } else if (isVoxelCube(vType)) {
    v1.x = p1x; v1.y = p1y; v1.z = p1z;
    v2.x = p2x; v2.y = p2y; v2.z = p2z;
    v3.x = p3x; v3.y = p3y; v3.z = p3z;
    v4.x = p4x; v4.y = p4y; v4.z = p4z;
  } else {
    let cx_start = gx - lx;
    let cy_start = gy - ly;

    v1 = getSmoothVertexLocal(voxels, (p1x as i32) - cx_start, (p1y as i32) - cy_start, p1z as i32, p1x, p1y, p1z);
    v2 = getSmoothVertexLocal(voxels, (p2x as i32) - cx_start, (p2y as i32) - cy_start, p2z as i32, p2x, p2y, p2z);
    v3 = getSmoothVertexLocal(voxels, (p3x as i32) - cx_start, (p3y as i32) - cy_start, p3z as i32, p3x, p3y, p3z);
    v4 = getSmoothVertexLocal(voxels, (p4x as i32) - cx_start, (p4y as i32) - cy_start, p4z as i32, p4x, p4y, p4z);
  }

  // Check if underground
  let isUnderground = false;
  if (isVoxelSolid(vType)) {
    let airX = gx + (nx as i32);
    let airY = gy + (ny as i32);
    let airZ = lz + (nz as i32);
    for (let checkZ = airZ; checkZ < 96; checkZ++) {
      let checkV = getVoxel(airX, airY, checkZ, getTerrainFast(airX, airY));
      if (isVoxelSolid(checkV)) {
        isUnderground = true;
        break;
      }
    }
  }

  let base = faceCount * 24;
  if (base + 24 > meshBuffer.length) return;

  meshBuffer[base + 0] = v1.x; meshBuffer[base + 1] = v1.y; meshBuffer[base + 2] = v1.z;
  meshBuffer[base + 3] = v2.x; meshBuffer[base + 4] = v2.y; meshBuffer[base + 5] = v2.z;
  meshBuffer[base + 6] = v3.x; meshBuffer[base + 7] = v3.y; meshBuffer[base + 8] = v3.z;
  meshBuffer[base + 9] = v4.x; meshBuffer[base + 10] = v4.y; meshBuffer[base + 11] = v4.z;

  meshBuffer[base + 12] = nx; meshBuffer[base + 13] = ny; meshBuffer[base + 14] = nz;

  // Centroid
  meshBuffer[base + 15] = (v1.x + v2.x + v3.x + v4.x) / 4.0;
  meshBuffer[base + 16] = (v1.y + v2.y + v3.y + v4.y) / 4.0;
  meshBuffer[base + 17] = (v1.z + v2.z + v3.z + v4.z) / 4.0;

  // Voxel coords
  meshBuffer[base + 18] = gx as f32;
  meshBuffer[base + 19] = gy as f32;
  meshBuffer[base + 20] = gz as f32;

  // Packed Color (RGBA)
  let colorVal: u32 = (colR as u32) | ((colG as u32) << 8) | ((colB as u32) << 16) | ((colA as u32) << 24);
  meshBuffer[base + 21] = reinterpret<f32>(colorVal);

  // Packed Flags
  // bit 0: isWater
  // bit 1: underground
  // bits 8-15: shade (scaled 0-255)
  let flagsVal: u32 = 0;
  if (vType == 2) flagsVal |= 1;
  if (isUnderground) flagsVal |= 2;
  let shadeByte = (shade * 255.0) as u32;
  flagsVal |= (shadeByte << 8);
  meshBuffer[base + 22] = reinterpret<f32>(flagsVal);

  meshBuffer[base + 23] = vType as f32;

  faceCount++;
}

export function buildChunkMeshWasm(cx: i32, cy: i32): i32 {
  faceCount = 0;

  // Populate local voxels array
  for (let lx = -1; lx <= CHUNK_SIZE_VAL; lx++) {
    let gx = cx * CHUNK_SIZE_VAL + lx;
    for (let ly = -1; ly <= CHUNK_SIZE_VAL; ly++) {
      let gy = cy * CHUNK_SIZE_VAL + ly;
      let t = getTerrainFast(gx, gy);
      for (let lz = -1; lz <= 96; lz++) {
        let idx = (lx + 1) + (ly + 1) * PADDED_SIZE + (lz + 1) * LAYER_SIZE;
        if (lz < 0) {
          voxels[idx] = 1;
        } else if (lz >= 96) {
          voxels[idx] = 0;
        } else {
          voxels[idx] = getVoxel(gx, gy, lz, t);
        }
      }
    }
  }

  // Generate faces
  for (let lx = 0; lx < CHUNK_SIZE_VAL; lx++) {
    let gx = cx * CHUNK_SIZE_VAL + lx;
    for (let ly = 0; ly < CHUNK_SIZE_VAL; ly++) {
      let gy = cy * CHUNK_SIZE_VAL + ly;
      let t = getTerrainFast(gx, gy);
      for (let lz = 0; lz < 96; lz++) {
        let idx = (lx + 1) + (ly + 1) * PADDED_SIZE + (lz + 1) * LAYER_SIZE;
        let v = voxels[idx];
        if (isVoxelSolid(v)) {
          let col = getVoxelColor(gx, gy, lz, v, t);

          let up = voxels[idx + LAYER_SIZE];
          let dn = voxels[idx - LAYER_SIZE];
          let px = voxels[idx + 1];
          let nx = voxels[idx - 1];
          let py = voxels[idx + PADDED_SIZE];
          let ny = voxels[idx - PADDED_SIZE];

          let fR = col.r, fG = col.g, fB = col.b, fA: u8 = 255;

          // up
          if (lz == 95 || shouldRenderFace(v, up)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    0, 0, 1, 1.0, fR, fG, fB, fA, v, voxels, t);
          }
          // dn
          if (lz == 0 || shouldRenderFace(v, dn)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    0, 0, -1, 0.3, fR, fG, fB, fA, v, voxels, t);
          }
          // px
          if (shouldRenderFace(v, px)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    1, 0, 0, 0.7, fR, fG, fB, fA, v, voxels, t);
          }
          // nx
          if (shouldRenderFace(v, nx)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    -1, 0, 0, 0.5, fR, fG, fB, fA, v, voxels, t);
          }
          // py
          if (shouldRenderFace(v, py)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    0, 1, 0, 0.8, fR, fG, fB, fA, v, voxels, t);
          }
          // ny
          if (shouldRenderFace(v, ny)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    0, -1, 0, 0.6, fR, fG, fB, fA, v, voxels, t);
          }
        } else if (v == 2) {
          let colorNoise = hash(gx as f64, gy as f64, lz as f64) * 10.0;
          let fR: u8 = clampColor(30.0 + colorNoise);
          let fG: u8 = clampColor(110.0 + colorNoise);
          let fB: u8 = clampColor(200.0 + colorNoise);
          let fA: u8 = 140; // 0.55 * 255 = 140

          let up = voxels[idx + LAYER_SIZE];

          // up
          if (lz == 95 || up == 0) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    0, 0, 1, 1.0, fR, fG, fB, fA, v, voxels, t);
          }
          // px
          if (voxels[idx + 1] == 0) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    1, 0, 0, 0.7, fR, fG, fB, fA, v, voxels, t);
          }
          // nx
          if (voxels[idx - 1] == 0) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    -1, 0, 0, 0.5, fR, fG, fB, fA, v, voxels, t);
          }
          // py
          if (voxels[idx + PADDED_SIZE] == 0) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    0, 1, 0, 0.8, fR, fG, fB, fA, v, voxels, t);
          }
          // ny
          if (voxels[idx - PADDED_SIZE] == 0) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    0, -1, 0, 0.6, fR, fG, fB, fA, v, voxels, t);
          }
        }
      }
    }
  }

  return faceCount;
}
