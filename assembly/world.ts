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

  let res = new TerrainData();
  res.baseH = baseH;
  res.lakeSurface = lakeSurface;
  res.isLake = isLake;
  res.oceanSurface = oceanSurface;
  res.moisture = moisture;
  res.elevation = elevation;
  return res;
}

function getTerrainFast(x: i32, y: i32): TerrainData {
  let key = getTerrainKey(x, y);
  if (terrainCache.has(key)) {
    return terrainCache.get(key);
  }
  let t = getTerrain(x as f64, y as f64);
  terrainCache.set(key, t);
  if (terrainCache.size > 20000) {
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

// --- Voxel Storage ---
function getVoxel(x: i32, y: i32, z: i32, t: TerrainData): i32 {
  if (z < 0) return 1;
  if (z >= 96) return 0; // MAX_Z

  let modKey = (((x & 0xFFFFFF) as u32 as u64) << 40) | (((y & 0xFFFFFF) as u32 as u64) << 16) | ((z & 0xFFFF) as u32 as u64);
  if (voxelMods.has(modKey)) {
    let mod = voxelMods.get(modKey);
    return mod == 1 ? 1 : (mod == 3 ? 3 : 0);
  }

  let density = t.baseH - (z as f64);

  if (density < -15.0) {
    if (z <= (t.oceanSurface as i32)) return 2;
    if (t.isLake && z <= (t.lakeSurface as i32)) return 2;
    return 0;
  }
  if (density > 20.0) return 1;

  let structure = noise3D((x as f64) * 0.04, (y as f64) * 0.04, (z as f64) * 0.04);
  density += structure * 10.0;

  let depth = t.baseH - (z as f64);
  if (depth > 12.0) {
    let caveNoise = Math.abs(noise3D((x as f64) * 0.03, (y as f64) * 0.03, (z as f64) * 0.03) - 0.5) * 2.0;
    if (caveNoise < 0.25) {
      density -= (0.25 - caveNoise) * 40.0;
    }
  }

  if (density > 0.0) return 1;
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
  return v == 1 || v == 3;
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

  let depthFromMacro = t.baseH - (z as f64);
  let colorNoise = hash(x as f64, y as f64, z as f64) * 15.0;

  let upV = getVoxel(x, y, z + 1, t);
  let isSurface = (upV != 1 && upV != 3);
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

export function modifyTerrainWasm(cx: i32, cy: i32, cz: i32, radius: f64, amount: i32): void {
  let r = radius;
  let r_int = Math.ceil(r) as i32;

  for (let x = cx - r_int; x <= cx + r_int; x++) {
    for (let y = cy - r_int; y <= cy + r_int; y++) {
      for (let z = cz - r_int; z <= cz + r_int; z++) {
        let dx = (x - cx) as f64;
        let dy = (y - cy) as f64;
        let dz = (z - cz) as f64;
        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist <= r && z >= 0 && z < 96) {
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

// pre-allocated voxels buffer for chunk meshing (neighborhood includes padding: size 10x10x98)
const voxels = new Uint8Array(10 * 10 * 98);

// pre-allocated flat mesh buffer (max 10,000 faces, each 24 floats = 240,000 floats)
const meshBuffer = new Float32Array(240000);
let faceCount = 0;

export function getMeshBufferPointer(): usize {
  return changetype<usize>(meshBuffer.dataStart);
}

@inline
function getVoxelLocal(voxels: Uint8Array, lx: i32, ly: i32, lz: i32): u8 {
  return voxels[(lx + 1) + (ly + 1) * 10 + (lz + 1) * 100];
}

function getSmoothVertexLocal(voxels: Uint8Array, lx: i32, ly: i32, lz: i32, gx: f32, gy: f32, gz: f32): Vertex {
  let sumX: f32 = 0;
  let sumY: f32 = 0;
  let sumZ: f32 = 0;
  let count: f32 = 0;
  let touchesCube = false;

  for (let dx = -1; dx <= 0; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      for (let dz = -1; dz <= 0; dz++) {
        let v = getVoxelLocal(voxels, lx + dx, ly + dy, lz + dz);
        if (v == 3) touchesCube = true;
        if (v == 1 || v == 3) {
          sumX += ((gx + (dx as f32)) as f32) + 0.5;
          sumY += ((gy + (dy as f32)) as f32) + 0.5;
          sumZ += ((gz + (dz as f32)) as f32) + 0.5;
          count += 1.0;
        }
      }
    }
  }

  let res = new Vertex();
  if (touchesCube || count == 0.0 || count == 8.0) {
    res.x = gx; res.y = gy; res.z = gz;
    return res;
  }

  let w: f32 = 0.5;
  res.x = gx + (sumX / count - gx) * w;
  res.y = gy + (sumY / count - gy) * w;
  res.z = gz + (sumZ / count - gz) * w;
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
    v1.x = p1x; v1.y = p1y; v1.z = p1z > (gz as f32) ? p1z - 0.15 : p1z;
    v2.x = p2x; v2.y = p2y; v2.z = p2z > (gz as f32) ? p2z - 0.15 : p2z;
    v3.x = p3x; v3.y = p3y; v3.z = p3z > (gz as f32) ? p3z - 0.15 : p3z;
    v4.x = p4x; v4.y = p4y; v4.z = p4z > (gz as f32) ? p4z - 0.15 : p4z;
  } else if (vType == 3) {
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
  if (vType == 1 || vType == 3) {
    let airX = gx + (nx as i32);
    let airY = gy + (ny as i32);
    let airZ = lz + (nz as i32);
    for (let checkZ = airZ; checkZ < 96; checkZ++) {
      let checkV = getVoxel(airX, airY, checkZ, getTerrainFast(airX, airY));
      if (checkV == 1 || checkV == 3) {
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

  meshBuffer[base + 23] = 0.0;

  faceCount++;
}

export function buildChunkMeshWasm(cx: i32, cy: i32): i32 {
  faceCount = 0;

  // Populate local voxels array
  for (let lx = -1; lx <= 8; lx++) {
    let gx = cx * 8 + lx;
    for (let ly = -1; ly <= 8; ly++) {
      let gy = cy * 8 + ly;
      let t = getTerrainFast(gx, gy);
      for (let lz = -1; lz <= 96; lz++) {
        let idx = (lx + 1) + (ly + 1) * 10 + (lz + 1) * 100;
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
  for (let lx = 0; lx < 8; lx++) {
    let gx = cx * 8 + lx;
    for (let ly = 0; ly < 8; ly++) {
      let gy = cy * 8 + ly;
      let t = getTerrainFast(gx, gy);
      for (let lz = 0; lz < 96; lz++) {
        let idx = (lx + 1) + (ly + 1) * 10 + (lz + 1) * 100;
        let v = voxels[idx];
        if (v == 1 || v == 3) {
          let col = getVoxelColor(gx, gy, lz, v, t);

          let up = voxels[idx + 100];
          let dn = voxels[idx - 100];
          let px = voxels[idx + 1];
          let nx = voxels[idx - 1];
          let py = voxels[idx + 10];
          let ny = voxels[idx - 10];

          let fR = col.r, fG = col.g, fB = col.b, fA: u8 = 255;

          // up
          if (lz == 95 || (up != 1 && up != 3)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    0, 0, 1, 1.0, fR, fG, fB, fA, v, voxels, t);
          }
          // dn
          if (lz == 0 || (dn != 1 && dn != 3)) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    0, 0, -1, 0.3, fR, fG, fB, fA, v, voxels, t);
          }
          // px
          if (px != 1 && px != 3) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    1, 0, 0, 0.7, fR, fG, fB, fA, v, voxels, t);
          }
          // nx
          if (nx != 1 && nx != 3) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    -1, 0, 0, 0.5, fR, fG, fB, fA, v, voxels, t);
          }
          // py
          if (py != 1 && py != 3) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    0, 1, 0, 0.8, fR, fG, fB, fA, v, voxels, t);
          }
          // ny
          if (ny != 1 && ny != 3) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz+1) as f32,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    0, -1, 0, 0.6, fR, fG, fB, fA, v, voxels, t);
          }
        } else if (v == 2) {
          let fR: u8 = 30, fG: u8 = 110, fB: u8 = 200, fA: u8 = 153; // 0.6 * 255 = 153

          let up = voxels[idx + 100];

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
          if (voxels[idx + 10] == 0) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx+1) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz) as f32,
                    (gx) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    0, 1, 0, 0.8, fR, fG, fB, fA, v, voxels, t);
          }
          // ny
          if (voxels[idx - 10] == 0) {
            addFace(lx, ly, lz, gx, gy, lz,
                    (gx) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy) as f32, (lz) as f32,
                    (gx+1) as f32, (gy+1) as f32, (lz+1) as f32,
                    (gx) as f32, (gy) as f32, (lz+1) as f32,
                    0, -1, 0, 0.6, fR, fG, fB, fA, v, voxels, t);
          }
        }
      }
    }
  }

  return faceCount;
}
