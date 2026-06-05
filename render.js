//THIS IS render.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

let threeInitialized = false;
let scene, camera, renderer;
let ambientLight, sunLight, flashlight;
let threeChunks = new Map();
let threeDynamicSprites = new Map();
let threePointLights = new Map();
let threeTorchGlows = new Map();
let dynamicSolidMesh;
let dynamicCloudMesh;
let dynamicPlayerMesh;
let dynamicZombieMesh;
let playerTexture = null;
let zombieTexture = null;
let aimBox;
let pickerBox;
let sunSprite = null;
let moonSprite = null;
let heldWeaponGroup;
let billboardGeo;
let activeBillboardMeshes = new Set();

// Helper to convert hex colors to rgb
function hexToRgb(hex) {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    let num = parseInt(cleanHex, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

// Cache canvas-based emoji sprites in THREE.CanvasTexture to prevent GPU upload overhead
const ThreeTextureCache = {
    textures: new Map(),
    get(emoji, shadow, rotate, ambient) {
        let ambStep = ambient >= 1.0 ? 1.0 : Math.max(0.1, Math.round(ambient * 20) / 20);
        const key = `${emoji}_${shadow}_${rotate}_${ambStep}`;
        if (this.textures.has(key)) return this.textures.get(key);
        
        const canvas = SpriteCache.get(emoji, shadow, rotate, ambient);
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        this.textures.set(key, texture);
        return texture;
    },
    clear() {
        for (let t of this.textures.values()) t.dispose();
        this.textures.clear();
    }
};

// Cache radial gradient glow textures for fires/torches
const GlowTextureCache = {
    texture: null,
    get() {
        if (this.texture) return this.texture;
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const cx = c.getContext('2d');
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                let dx = x - 7.5;
                let dy = y - 7.5;
                let dist = Math.hypot(dx, dy) / 8.0;
                if (dist < 1.0) {
                    let intensity = 1.0 - dist;
                    let steps = Math.ceil(intensity * 4) / 4;
                    let alpha = steps * 0.45;
                    cx.fillStyle = `rgba(255, 140, 40, ${alpha})`;
                    cx.fillRect(x, y, 1, 1);
                }
            }
        }
        this.texture = new THREE.CanvasTexture(c);
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        return this.texture;
    }
};

// Cache pixelated projection map for the flashlight
const FlashlightTextureCache = {
    texture: null,
    get() {
        if (this.texture) return this.texture;
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const cx = c.getContext('2d');
        cx.fillStyle = 'black';
        cx.fillRect(0, 0, 16, 16);
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                let dx = x - 7.5;
                let dy = y - 7.5;
                let dist = Math.hypot(dx, dy) / 8.0;
                if (dist < 1.0) {
                    let intensity = 1.0 - dist;
                    let steps = Math.ceil(intensity * 4) / 4;
                    let val = Math.floor(steps * 255);
                    cx.fillStyle = `rgb(${val}, ${val}, ${val})`;
                    cx.fillRect(x, y, 1, 1);
                }
            }
        }
        this.texture = new THREE.CanvasTexture(c);
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        return this.texture;
    }
};

// Retrieve or load player skin canvas texture
function getPlayerTexture() {
    let skinSource = (minecraftPlayerSkinImg.complete && minecraftPlayerSkinImg.naturalWidth > 0) ? minecraftPlayerSkinImg : fallbackPlayerSkinCanvas;
    if (!playerTexture) {
        playerTexture = new THREE.CanvasTexture(skinSource);
        playerTexture.minFilter = THREE.NearestFilter;
        playerTexture.magFilter = THREE.NearestFilter;
    } else if (playerTexture.image !== skinSource) {
        playerTexture.image = skinSource;
        playerTexture.needsUpdate = true;
    }
    return playerTexture;
}

// Retrieve or load zombie skin canvas texture
function getZombieTexture() {
    let skinSource = (minecraftZombieSkinImg.complete && minecraftZombieSkinImg.naturalWidth > 0) ? minecraftZombieSkinImg : fallbackZombieSkinCanvas;
    if (!zombieTexture) {
        zombieTexture = new THREE.CanvasTexture(skinSource);
        zombieTexture.minFilter = THREE.NearestFilter;
        zombieTexture.magFilter = THREE.NearestFilter;
    } else if (zombieTexture.image !== skinSource) {
        zombieTexture.image = skinSource;
        zombieTexture.needsUpdate = true;
    }
    return zombieTexture;
}

// Cache damage number canvases
const DmgTextCache = {
    textures: new Map(),
    get(text) {
        if (this.textures.has(text)) return this.textures.get(text);
        const c = document.createElement('canvas');
        c.width = 128; c.height = 64;
        const cx = c.getContext('2d');
        cx.font = 'bold 36px sans-serif';
        cx.fillStyle = 'rgb(255, 50, 50)';
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillText(text, 64, 32);
        
        const texture = new THREE.CanvasTexture(c);
        this.textures.set(text, texture);
        return texture;
    }
};

// Initialize Three.js scene, camera, lights, and mesh containers
function initThree() {
    camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene = new THREE.Scene();
    
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Ambient light
    ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // Directional day/night cycle light
    sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    scene.add(sunLight);
    
    // Flashlight Spotlight
    flashlight = new THREE.SpotLight(0xffffff, 1.5, 80, Math.PI / 12, 0.2, 1.0);
    flashlight.map = FlashlightTextureCache.get();
    scene.add(flashlight);
    scene.add(flashlight.target);
    
    scene.add(camera);
    
    // Voxel selection target box mesh
    const aimGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const aimMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
    });
    aimBox = new THREE.Mesh(aimGeo, aimMat);
    aimBox.visible = false;
    scene.add(aimBox);
    
    // Coord picker box mesh
    const pickerGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const pickerMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
    });
    pickerBox = new THREE.Mesh(pickerGeo, pickerMat);
    pickerBox.visible = false;
    scene.add(pickerBox);
    
    // Group for rendering first-person held weapons
    heldWeaponGroup = new THREE.Group();
    camera.add(heldWeaponGroup);
    
    // Dynamic Solid Color mesh for weapons, vehicles, limbs
    const solidGeo = new THREE.BufferGeometry();
    const solidMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    dynamicSolidMesh = new THREE.Mesh(solidGeo, solidMat);
    scene.add(dynamicSolidMesh);
    
    // Dynamic transparent mesh for clouds
    const cloudGeo = new THREE.BufferGeometry();
    const cloudMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    dynamicCloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(dynamicCloudMesh);
    
    // Dynamic Player Steve skin mesh
    const playerGeo = new THREE.BufferGeometry();
    const playerMat = new THREE.MeshStandardMaterial({
        map: getPlayerTexture(),
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    dynamicPlayerMesh = new THREE.Mesh(playerGeo, playerMat);
    scene.add(dynamicPlayerMesh);
    
    // Dynamic Zombie skin mesh
    const zombieGeo = new THREE.BufferGeometry();
    const zombieMat = new THREE.MeshStandardMaterial({
        map: getZombieTexture(),
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    dynamicZombieMesh = new THREE.Mesh(zombieGeo, zombieMat);
    scene.add(dynamicZombieMesh);
    
    billboardGeo = new THREE.PlaneGeometry(1, 1);
    
    threeInitialized = true;
}

// Check if viewport size changed and update renderer
function checkResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        if (threeInitialized) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    }
}

// Convert chunk faces from WASM/JS mesher to persistent BufferGeometries in Three.js
function updateChunkMesh(key, faces) {
    if (threeChunks.has(key)) {
        const cached = threeChunks.get(key);
        scene.remove(cached.solidMesh);
        if (cached.solidMesh) cached.solidMesh.geometry.dispose();
        scene.remove(cached.waterMesh);
        if (cached.waterMesh) cached.waterMesh.geometry.dispose();
        if (cached.entities) {
            for (let sprite of cached.entities) {
                scene.remove(sprite);
            }
        }
        threeChunks.delete(key);
    }
    
    if (!faces || faces.length === 0) return;
    
    const solidFaces = [];
    const waterFaces = [];
    for (let f of faces) {
        if (f.isWater) waterFaces.push(f);
        else solidFaces.push(f);
    }
    
    const solidMesh = buildFacesMesh(solidFaces, false);
    const waterMesh = buildFacesMesh(waterFaces, true);
    
    if (solidMesh) scene.add(solidMesh);
    if (waterMesh) scene.add(waterMesh);
    
    // Build static billboards inside chunk (trees, rocks, flowers, cactuses, skulls)
    let [cx, cy] = key.split(',').map(Number);
    let chunkEntities = getMapChunk(cx, cy);
    const entitiesSprites = [];
    
    for (let obj of chunkEntities) {
        let texture = ThreeTextureCache.get(obj.emoji, false, false, 1.0);
        let mat = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5,
            roughness: 1.0,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        let mesh = new THREE.Mesh(billboardGeo, mat);
        let size = obj.size;
        
        // Base aligned coordinate system mapping
        mesh.position.set(obj.wx, obj.h + size / 2, obj.wy);
        mesh.scale.set(size * 1.5, size * 1.5, 1.0);
        scene.add(mesh);
        entitiesSprites.push(mesh);
    }
    
    threeChunks.set(key, { solidMesh, waterMesh, facesRef: faces, entities: entitiesSprites });
}

// Helper to batch faces to single BufferGeometry mesh
function buildFacesMesh(faces, isWater) {
    if (faces.length === 0) return null;
    
    const positions = [];
    const colors = [];
    const normals = [];
    const indices = [];
    let vertCount = 0;
    
    for (let f of faces) {
        const pts = f.pts;
        if (pts.length < 3) continue;
        
        for (let pt of pts) {
            positions.push(pt.x, pt.z, pt.y);
            
            // Apply AO / directional shading factor baked into vertex color
            const r = (f.col.r / 255) * f.shade;
            const g = (f.col.g / 255) * f.shade;
            const b = (f.col.b / 255) * f.shade;
            const a = f.col.a !== undefined ? f.col.a : 1.0;
            colors.push(r, g, b, a);
            
            normals.push(f.norm.x, f.norm.z, f.norm.y);
        }
        
        // Split quads into triangles
        indices.push(vertCount, vertCount + 2, vertCount + 1);
        if (pts.length === 4) {
            indices.push(vertCount, vertCount + 3, vertCount + 2);
            vertCount += 4;
        } else {
            vertCount += 3;
        }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    let material;
    if (isWater) {
        material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
    } else {
        material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
    }
    
    return new THREE.Mesh(geometry, material);
}

// Temporary geometry buffer arrays for dynamic frame-by-frame batched models
const dynamicBuffers = {
    solid: { positions: [], colors: [], normals: [], indices: [], vertCount: 0 },
    cloud: { positions: [], colors: [], normals: [], indices: [], vertCount: 0 },
    player: { positions: [], colors: [], normals: [], uvs: [], indices: [], vertCount: 0 },
    zombie: { positions: [], colors: [], normals: [], uvs: [], indices: [], vertCount: 0 }
};

// Add triangle/quad faces to frame buffers
function addFaceToDynamicBuffer(bufferType, facePts, colorObj, norm, uvs = null) {
    const buf = dynamicBuffers[bufferType];
    const vStart = buf.vertCount;
    
    for (let i = 0; i < facePts.length; i++) {
        const pt = facePts[i];
        buf.positions.push(pt.x, pt.z, pt.y);
        
        const r = colorObj.r / 255;
        const g = colorObj.g / 255;
        const b = colorObj.b / 255;
        const a = colorObj.a !== undefined ? colorObj.a : 1.0;
        buf.colors.push(r, g, b, a);
        
        buf.normals.push(norm.x, norm.z, norm.y);
        
        if (uvs && uvs[i]) {
            buf.uvs.push(uvs[i].u, uvs[i].v);
        }
    }
    
    buf.indices.push(vStart, vStart + 2, vStart + 1);
    if (facePts.length === 4) {
        buf.indices.push(vStart, vStart + 3, vStart + 2);
        buf.vertCount += 4;
    } else {
        buf.vertCount += 3;
    }
}

// Upload frame dynamic buffers to dynamic geometries
function uploadDynamicBuffers() {
    updateBufferGeometry(dynamicSolidMesh.geometry, dynamicBuffers.solid, false);
    updateBufferGeometry(dynamicCloudMesh.geometry, dynamicBuffers.cloud, false);
    updateBufferGeometry(dynamicPlayerMesh.geometry, dynamicBuffers.player, true);
    updateBufferGeometry(dynamicZombieMesh.geometry, dynamicBuffers.zombie, true);
}

function updateBufferGeometry(geometry, data, hasUVs) {
    if (data.vertCount === 0) {
        geometry.setIndex([]);
        return;
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 4));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    if (hasUVs) {
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    }
    geometry.setIndex(data.indices);
    geometry.computeBoundingSphere();
}

// Render dynamic billboards (monsters, chests, animals) using pooled Canvas textures
const activeSpritesThisFrame = new Set();
const activePointLightsThisFrame = new Set();
const activeTorchGlowsThisFrame = new Set();

function drawBillboardEmoji(obj, emoji, size, x, y, z, targeted = false, ghost = false, dead = false, spinScaleX = undefined) {
    let key = obj;
    activeSpritesThisFrame.add(key);
    
    let mesh = threeDynamicSprites.get(key);
    let texture = ThreeTextureCache.get(emoji, targeted, dead, 1.0);
    
    if (!mesh) {
        let mat = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5,
            roughness: 1.0,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        mesh = new THREE.Mesh(billboardGeo, mat);
        scene.add(mesh);
        threeDynamicSprites.set(key, mesh);
    } else {
        mesh.material.map = texture;
        mesh.material.opacity = ghost ? 0.5 : 1.0;
        mesh.material.needsUpdate = true;
    }
    
    mesh.position.set(x, z + size / 2, y);
    
    let scaleX = size * 1.5;
    if (spinScaleX !== undefined) {
        scaleX *= spinScaleX;
    }
    mesh.scale.set(scaleX, size * 1.5, 1.0);
    
    activeBillboardMeshes.add(mesh);
}

// Render point light sources for torches
function drawTorchLight(c) {
    let key = c;
    activePointLightsThisFrame.add(key);
    
    let light = threePointLights.get(key);
    if (!light) {
        light = new THREE.PointLight(0xffaa44, 5.0, 30, 1.0);
        scene.add(light);
        threePointLights.set(key, light);
    }
    light.position.set(c.x, c.z + 0.5, c.y);
    light.intensity = c.flicker * 5.0;
    
    // Add atmospheric orange glow billboard
    activeTorchGlowsThisFrame.add(key);
    let glow = threeTorchGlows.get(key);
    if (!glow) {
        let glowMat = new THREE.SpriteMaterial({
            map: GlowTextureCache.get(),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        glow = new THREE.Sprite(glowMat);
        scene.add(glow);
        threeTorchGlows.set(key, glow);
    }
    glow.position.set(c.x, c.z + 0.4, c.y);
    glow.scale.set(c.size * 10 * c.flicker, c.size * 10 * c.flicker, 1.0);
}

// Rebuild and attach the held weapon model in first-person view
let lastHeldWeaponId = null;

function updateHeldWeapon(wData) {
    let wName = wData.name.toLowerCase();
    let model = WEAPON_MODELS[wName];
    if (!model || wData.isMelee) {
        heldWeaponGroup.visible = false;
        return;
    }
    
    heldWeaponGroup.visible = true;
    if (lastHeldWeaponId === wData.name) return;
    lastHeldWeaponId = wData.name;
    
    while(heldWeaponGroup.children.length > 0) {
        let child = heldWeaponGroup.children[0];
        heldWeaponGroup.remove(child);
        child.geometry.dispose();
    }
    
    let conf = WEAPON_MODEL_CONFIG[wName] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0 };
    const positions = [];
    const colors = [];
    const normals = [];
    const indices = [];
    let vertCount = 0;
    
    for (let f of model.faces) {
        let pts = [];
        for (let v of f.pts) {
            let r = rotate3D(v.x, v.y, v.z, conf.rotX, conf.rotY, conf.rotZ);
            let mx = r.x * conf.scale;
            let my = -r.z * conf.scale;
            let mz = r.y * conf.scale;
            pts.push({ x: mx, y: mz, z: -my });
        }
        
        for (let pt of pts) {
            positions.push(pt.x, pt.y, pt.z);
            colors.push(f.color.r / 255, f.color.g / 255, f.color.b / 255, 1.0);
        }
        
        let ux = pts[1].x - pts[0].x, uy = pts[1].y - pts[0].y, uz = pts[1].z - pts[0].z;
        let wx = pts[2].x - pts[0].x, wy = pts[2].y - pts[0].y, wz = pts[2].z - pts[0].z;
        let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
        let len = Math.hypot(nx, ny, nz);
        
        for (let i = 0; i < pts.length; i++) {
            normals.push(nx/len, ny/len, nz/len);
        }
        
        indices.push(vertCount, vertCount + 1, vertCount + 2);
        vertCount += 3;
    }
    
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setIndex(indices);
    
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geom, mat);
    heldWeaponGroup.add(mesh);
}

// MAIN RENDER LOOP ROUTINE
function render() {
    if (isLoading) return;
    if (isPaused && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) return;
    
    checkResize();
    
    if (!threeInitialized) {
        initThree();
    }
    
    let realPlayerX = player.x;
    let realPlayerY = player.y;
    
    let bestPickDepth = Infinity;
    let bestPickPoint = null;
    let bestPickVehicle = null;
    
    let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
    let camX, camY, camZ;
    let renderAngle, renderPitch;
    
    if (freecam) {
        camX = freecamX;
        camY = freecamY;
        camZ = freecamZ;
        renderAngle = freecamAngle;
        renderPitch = freecamPitch;
    } else {
        camX = player.x;
        camY = player.y;
        camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
        
        if (!player.inVehicle && (player.view === '3rd_back' || player.view === '3rd_front')) {
            let dist = 4.2;
            let startX = player.x;
            let startY = player.y;
            let startZ = player.z + 1.0;
            
            let reachedDist = dist;
            let step = 0.25;
            let dirSign = (player.view === '3rd_front') ? 1.0 : -1.0;
            for (let d = step; d <= dist; d += step) {
                let checkX = player.x + Math.cos(player.angle) * dirSign * d;
                let checkY = player.y + Math.sin(player.angle) * dirSign * d;
                let checkZ = startZ + (0.2 / dist) * d;
                if (getSolid(Math.floor(checkX), Math.floor(checkY), Math.floor(checkZ))) {
                    reachedDist = d - 0.25;
                    break;
                }
            }
            if (reachedDist < 0.25) reachedDist = 0.25;
            
            camX = player.x + Math.cos(player.angle) * dirSign * reachedDist;
            camY = player.y + Math.sin(player.angle) * dirSign * reachedDist;
            camZ = startZ + (0.2 / dist) * reachedDist + (player.zOffset || 0) + waterBob;
        }
        
        renderAngle = player.angle;
        renderPitch = player.pitch;
        let isFrontView = (player.inVehicle ? player.vehicleView === '3rd_front' : player.view === '3rd_front');
        if (isFrontView) {
            renderAngle = player.angle + Math.PI;
            renderPitch = -player.pitch;
        }
    }
    
    player.x = camX;
    player.y = camY;
    
    currentCamX = camX;
    currentCamY = camY;
    currentCamZ = camZ;
    currentCamAngle = renderAngle;
    currentCamPitch = renderPitch;
    
    // Position and rotate Three.js camera
    camera.position.set(camX, camZ, camY);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = -renderAngle - Math.PI / 2;
    camera.rotation.x = Math.atan2(renderPitch, canvas.width * currentZoom);
    
    // Smooth camera FOV zooming updates
    let fovDegrees = parseInt(document.getElementById('dbg-fov').value || 80);
    let targetHFov = isZooming ? fovDegrees / 2.0 : fovDegrees;
    let aspect = window.innerWidth / window.innerHeight;
    camera.fov = (2 * Math.atan(Math.tan((targetHFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    
    let sky = getSkyColor(gameTime);
    let fogColor = (gameState === 'overworld') ? sky : { r: 10, g: 13, b: 4 };
    let fogColorHex = (fogColor.r << 16) | (fogColor.g << 8) | fogColor.b;
    let ambientVal = getAmbientLight(gameTime);
    
    // Update sky color and dynamic GPU fog
    renderer.setClearColor(fogColorHex, 1.0);
    scene.background = new THREE.Color(fogColorHex);
    
    if (thickFogEnabled) {
        scene.fog = new THREE.Fog(fogColorHex, VIEW_DIST * 0.25, VIEW_DIST * 0.8);
    } else {
        scene.fog = new THREE.Fog(fogColorHex, VIEW_DIST * 0.5, VIEW_DIST * 1.1);
    }
    
    // Sync ambient and directional lighting
    let ambientR = sky.r / 255;
    let ambientG = sky.g / 255;
    let ambientB = sky.b / 255;
    
    // Add blue-tinted moonlight ambient boost at night
    if (gameState === 'overworld') {
        let nightFactor = 1.0 - ambientVal;
        if (nightFactor > 0) {
            ambientR = Math.max(ambientR, nightFactor * 0.15);
            ambientG = Math.max(ambientG, nightFactor * 0.20);
            ambientB = Math.max(ambientB, nightFactor * 0.38);
        }
    }
    
    ambientLight.color.setRGB(ambientR, ambientG, ambientB);
    ambientLight.intensity = (gameState === 'overworld') ? ambientVal * 0.5 + 0.22 : 0.15;
    
    let sunTimeAngle = ((gameTime - 6) / 24) * Math.PI * 2;
    let sunDx = Math.cos(sunTimeAngle) * 500;
    let sunDz = Math.sin(sunTimeAngle) * 500;
    let sunDy = 150;
    
    // If night (sun below horizon), point moonLight from above
    let lightDz = sunDz;
    if (lightDz < 0) {
        lightDz = -lightDz;
    }
    sunLight.position.set(sunDx, lightDz, sunDy).normalize();
    
    if (sunDz > 0) {
        sunLight.color.setRGB(1.0, 0.95, 0.9);
        sunLight.intensity = (sunDz / 500) * 0.9;
    } else {
        sunLight.color.setRGB(0.25, 0.4, 0.7);
        sunLight.intensity = (Math.abs(sunDz) / 500) * 0.22;
    }
    if (gameState !== 'overworld') {
        sunLight.intensity = 0.02;
    }
    
    // Update player flashlight spotlight
    if (isFlashlightOn) {
        flashlight.intensity = 1.5;
        flashlight.position.copy(camera.position);
        camera.updateMatrixWorld();
        let targetPos = new THREE.Vector3(0, 0, -30);
        targetPos.applyMatrix4(camera.matrixWorld);
        flashlight.target.position.copy(targetPos);
    } else {
        flashlight.intensity = 0.0;
    }
    
    // Clear frame temporary dynamic buffers
    dynamicBuffers.solid = { positions: [], colors: [], normals: [], indices: [], vertCount: 0 };
    dynamicBuffers.cloud = { positions: [], colors: [], normals: [], indices: [], vertCount: 0 };
    dynamicBuffers.player = { positions: [], colors: [], normals: [], uvs: [], indices: [], vertCount: 0 };
    dynamicBuffers.zombie = { positions: [], colors: [], normals: [], uvs: [], indices: [], vertCount: 0 };
    
    activeSpritesThisFrame.clear();
    activePointLightsThisFrame.clear();
    activeTorchGlowsThisFrame.clear();
    activeBillboardMeshes.clear();
    
    if (typeof meshesBuiltThisFrame !== 'undefined') {
        meshesBuiltThisFrame = 0;
    }
    
    // Sync static chunks terrain persistent meshes
    let pCx = Math.floor(player.x / CHUNK_SIZE);
    let pCy = Math.floor(player.y / CHUNK_SIZE);
    let maxForwardDist = VIEW_DIST * 1.15;
    let chunkRadius = Math.ceil(maxForwardDist / CHUNK_SIZE);
    
    const visibleChunks = new Set();
    
    if (gameState === 'overworld') {
        for (let cx = pCx - chunkRadius; cx <= pCx + chunkRadius; cx++) {
            for (let cy = pCy - chunkRadius; cy <= pCy + chunkRadius; cy++) {
                let dx = cx * CHUNK_SIZE + CHUNK_SIZE/2 - player.x, dy = cy * CHUNK_SIZE + CHUNK_SIZE/2 - player.y;
                let dist2D = Math.hypot(dx, dy);
                if (dist2D > maxForwardDist + CHUNK_SIZE * 2.0) continue;
                
                let key = `${cx},${cy}`;
                visibleChunks.add(key);
                
                let faces = chunkMeshes.get(key);
                if (!faces) {
                    getMapChunk(cx, cy);
                    faces = getChunkMesh(cx, cy);
                }
                
                let cached = threeChunks.get(key);
                if (!cached || cached.facesRef !== faces) {
                    updateChunkMesh(key, faces);
                    cached = threeChunks.get(key);
                }
                if (cached && cached.entities) {
                    for (let mesh of cached.entities) {
                        activeBillboardMeshes.add(mesh);
                    }
                }
            }
        }
    }
    
    // Evict distant chunk terrain meshes
    for (let key of threeChunks.keys()) {
        if (!visibleChunks.has(key)) {
            const cached = threeChunks.get(key);
            scene.remove(cached.solidMesh);
            if (cached.solidMesh) cached.solidMesh.geometry.dispose();
            scene.remove(cached.waterMesh);
            if (cached.waterMesh) cached.waterMesh.geometry.dispose();
            if (cached.entities) {
                for (let sprite of cached.entities) {
                    scene.remove(sprite);
                }
            }
            threeChunks.delete(key);
        }
    }
    
    // Run FBM clouds generator
    if (gameState === 'overworld') {
        let cloudViewDist = VIEW_DIST * 4.0;
        let cloudHeight = 130;
        let cloudGrid = 20;
        let cloudRad = Math.ceil(cloudViewDist / cloudGrid);
        let cloudSpeed = 25;
        let cloudMoveX = gameTime * cloudSpeed;
        let pCxCloud = Math.floor((player.x - cloudMoveX) / cloudGrid);
        let pCyCloud = Math.floor(player.y / cloudGrid);
        
        let cGridSize = cloudRad * 2 + 3;
        let cloudNoise = new Float32Array(cGridSize * cGridSize);
        for (let x = 0; x < cGridSize; x++) {
            for (let y = 0; y < cGridSize; y++) {
                let cx = pCxCloud - cloudRad - 1 + x;
                let cy = pCyCloud - cloudRad - 1 + y;
                cloudNoise[x + y * cGridSize] = fbm2D(cx * cloudGrid * 0.012, cy * cloudGrid * 0.012, 2);
            }
        }
        
        let cH = 12;
        let colorTop = { r: 255, g: 255, b: 255, a: 0.5 };
        let colorBottom = { r: 210, g: 210, b: 210, a: 0.5 };
        let colorSide1 = { r: 235, g: 235, b: 235, a: 0.5 };
        let colorSide2 = { r: 220, g: 220, b: 220, a: 0.5 };
        
        for (let x = 1; x < cGridSize - 1; x++) {
            for (let y = 1; y < cGridSize - 1; y++) {
                if (cloudNoise[x + y * cGridSize] > 0.45) {
                    let cx = pCxCloud - cloudRad - 1 + x;
                    let cy = pCyCloud - cloudRad - 1 + y;
                    let wx = cx * cloudGrid + cloudMoveX;
                    let wy = cy * cloudGrid;
                    
                    let n_px = cloudNoise[(x + 1) + y * cGridSize] > 0.45;
                    let n_nx = cloudNoise[(x - 1) + y * cGridSize] > 0.45;
                    let n_py = cloudNoise[x + (y + 1) * cGridSize] > 0.45;
                    let n_ny = cloudNoise[x + (y - 1) * cGridSize] > 0.45;
                    
                    let addCloudFace = (pts, col) => {
                        let u = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y, z: pts[1].z - pts[0].z };
                        let w = { x: pts[2].x - pts[0].x, y: pts[2].y - pts[0].y, z: pts[2].z - pts[0].z };
                        let nx = u.y*w.z - u.z*w.y, ny = u.z*w.x - u.x*w.z, nz = u.x*w.y - u.y*w.x;
                        let len = Math.hypot(nx, ny, nz);
                        let norm = { x: nx/len, y: ny/len, z: nz/len };
                        
                        addFaceToDynamicBuffer('cloud', pts, col, norm);
                    };
                    
                    addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight} ], colorBottom);
                    addCloudFace([ {x: wx, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], colorTop);
                    
                    if (!n_nx) addCloudFace([ {x: wx, y: wy, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy, z: cloudHeight + cH} ], colorSide1);
                    if (!n_px) addCloudFace([ {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH} ], colorSide1);
                    if (!n_ny) addCloudFace([ {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH} ], colorSide2);
                    if (!n_py) addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], colorSide2);
                }
            }
        }
    }
    
    // Position revolving sun/moon billboards in the sky
    if (gameState === 'overworld') {
        let sunDx = Math.cos(sunTimeAngle) * 200;
        let sunDz = Math.sin(sunTimeAngle) * 200;
        let sunDy = 60;
        
        if (!sunSprite) {
            let texture = ThreeTextureCache.get('☀️', false, false, 1.0);
            sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false }));
            scene.add(sunSprite);
        }
        sunSprite.position.set(camera.position.x + sunDx, camera.position.y + sunDz, camera.position.z + sunDy);
        sunSprite.scale.set(20, 20, 1);
        
        if (!moonSprite) {
            let texture = ThreeTextureCache.get('🌕', false, false, 1.0);
            moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false }));
            scene.add(moonSprite);
        }
        moonSprite.position.set(camera.position.x - sunDx, camera.position.y - sunDz, camera.position.z - sunDy);
        moonSprite.scale.set(16, 16, 1);
    } else {
        if (sunSprite) sunSprite.visible = false;
        if (moonSprite) moonSprite.visible = false;
    }
    
    // Reset CPU activeRenderList counts for dynamic skeletons mesher
    renderCount = 0;
    
    // Render interior building structures
    if (gameState === 'interior') {
        let walls = getInteriorWalls();
        for (let w of walls) {
            if (w.pts) {
                let pt0 = w.pts[0], pt1 = w.pts[1], pt2 = w.pts[2], pt3 = w.pts[3];
                let ux = pt1.x - pt0.x, uy = pt1.y - pt0.y, uz = pt1.z - pt0.z;
                let wx = pt2.x - pt0.x, wy = pt2.y - pt0.y, wz = pt2.z - pt0.z;
                let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                let len = Math.hypot(nx, ny, nz);
                let norm = { x: nx/len, y: ny/len, z: nz/len };
                let color = typeof w.color === 'string' ? hexToRgb(w.color) : w.color;
                addFaceToDynamicBuffer('solid', w.pts, color, norm);
            } else {
                let p1 = w.p1;
                let p2 = w.p2;
                let wh = activeBuilding.wallH;
                let pts = [
                    { x: p1.x, y: p1.y, z: 0 },
                    { x: p2.x, y: p2.y, z: 0 },
                    { x: p2.x, y: p2.y, z: wh },
                    { x: p1.x, y: p1.y, z: wh }
                ];
                let ux = p2.x - p1.x, uy = p2.y - p1.y;
                let norm = { x: -uy, y: ux, z: 0 };
                let len = Math.hypot(norm.x, norm.y);
                norm.x /= len; norm.y /= len;
                let color = typeof w.color === 'string' ? hexToRgb(w.color) : w.color;
                addFaceToDynamicBuffer('solid', pts, color, norm);
            }
        }
        
        let interiorEnts = getInteriorEntities();
        for (let e of interiorEnts) {
            drawBillboardEmoji(e, e.emoji, e.size, e.x, e.y, e.z, e === interactTarget);
        }
    }
    
    // Draw dynamic containers
    for (let e of containers) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(e, e.emoji, e.size, e.x, e.y, e.z, e === interactTarget);
        }
    }
    
    // Draw dynamic animals
    for (let e of animals) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(e, e.emoji, e.size, e.x, e.y, e.z, e === interactTarget, false, e.dead);
        }
    }
    
    // Draw dynamic buildings
    for (let b of buildings) {
        let dist = Math.hypot(b.x - player.x, b.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(b, b.emoji, 4.5, b.x, b.y, b.z, b === interactTarget);
        }
    }
    
    // Draw dynamic dropped items
    for (let e of droppedItems) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (gameState === 'interior' || dist < VIEW_DIST) {
            let itemId = e.item.id;
            let model = itemId ? WEAPON_MODELS[itemId] : null;
            let bobZ = Math.sin(e.hoverTime * 0.08) * 0.12 + 0.08;
            let itemZ = e.z + bobZ;
            
            if (model) {
                let conf = WEAPON_MODEL_CONFIG[itemId] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0 };
                let scale = conf.scale * 1.5;
                let spinAngle = e.hoverTime * 0.012;
                let ryaw = conf.rotZ + spinAngle;
                
                for (let f of model.faces) {
                    let wPts = [];
                    for (let pt of f.pts) {
                        let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, ryaw);
                        wPts.push({
                            x: e.x + p1.x * scale,
                            y: e.y + p1.y * scale,
                            z: itemZ + p1.z * scale + 0.15
                        });
                    }
                    
                    let ux = wPts[1].x - wPts[0].x, uy = wPts[1].y - wPts[0].y, uz = wPts[1].z - wPts[0].z;
                    let wx = wPts[2].x - wPts[0].x, wy = wPts[2].y - wPts[0].y, wz = wPts[2].z - wPts[0].z;
                    let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                    let len = Math.hypot(nx, ny, nz);
                    let norm = { x: nx/len, y: ny/len, z: nz/len };
                    
                    let color = e === interactTarget ? { r: f.color.r + 40, g: f.color.g + 40, b: f.color.b + 40 } : f.color;
                    addFaceToDynamicBuffer('solid', wPts, color, norm);
                }
            } else {
                drawBillboardEmoji(e, e.item.emoji, 0.55, e.x, e.y, itemZ, e === interactTarget, false, false, Math.cos(e.hoverTime * 0.012));
            }
        }
    }
    
    // Draw dynamic torches
    for (let c of torches) {
        let dist = Math.hypot(c.x - player.x, c.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(c, c.emoji, c.size, c.x, c.y, c.z);
            drawTorchLight(c);
        }
    }
    
    // Draw dynamic projectiles
    for (let p of projectiles) {
        let dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist < VIEW_DIST) {
            let size = 0.05;
            let pts = [
                { x: p.x - size, y: p.y - size, z: p.z - size },
                { x: p.x + size, y: p.y - size, z: p.z - size },
                { x: p.x + size, y: p.y + size, z: p.z - size },
                { x: p.x - size, y: p.y + size, z: p.z - size },
                { x: p.x - size, y: p.y - size, z: p.z + size },
                { x: p.x + size, y: p.y - size, z: p.z + size },
                { x: p.x + size, y: p.y + size, z: p.z + size },
                { x: p.x - size, y: p.y + size, z: p.z + size }
            ];
            const BOX_FACES = [
                [2, 3, 7, 6], [0, 1, 5, 4], [3, 0, 4, 7], [1, 2, 6, 5], [4, 5, 6, 7], [3, 2, 1, 0]
            ];
            let color = p.owner === 'player' ? { r: 255, g: 255, b: 0 } : { r: 255, g: 50, b: 50 };
            for (let fIdx of BOX_FACES) {
                let ptsArray = [ pts[fIdx[0]], pts[fIdx[1]], pts[fIdx[2]], pts[fIdx[3]] ];
                addFaceToDynamicBuffer('solid', ptsArray, color, { x: 0, y: 0, z: 1 });
            }
        }
    }
    
    // Draw dynamic particles (blood, dirt)
    for (let b of bloodParticles) {
        if (b.isLimb && b.is3D) {
            add3DLimbFaces(b, ambientVal);
        } else {
            let size = b.size;
            let pts = [
                { x: b.x - size, y: b.y - size, z: b.z },
                { x: b.x + size, y: b.y - size, z: b.z },
                { x: b.x + size, y: b.y + size, z: b.z },
                { x: b.x - size, y: b.y + size, z: b.z }
            ];
            addFaceToDynamicBuffer('solid', pts, b.color, { x: 0, y: 0, z: 1 });
        }
    }
    
    // Draw dynamic coordinate picker candidate box highlight
    if (typeof placementItem !== 'undefined' && placementItem !== null) {
        let target = getPlacementTarget();
        drawBillboardEmoji(placementItem, placementItem.emoji, placementItem.type === 'torch' ? 0.4 : 4.5, target.x, target.y, target.z, false, true);
    }
    
    // Draw targeted voxel highlight box outline
    let activeItem = inventory[hotbarSelection];
    let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;
    if (curW && (curW.type === 'block' || curW.toolType === 'pickaxe' || curW.toolType === 'shovel')) {
        let aim = getAimVoxel(curW.range);
        if (aim) {
            let isPlace = (curW.type === 'block');
            let targetX = isPlace ? aim.placeX : aim.hitX;
            let targetY = isPlace ? aim.placeY : aim.hitY;
            let targetZ = isPlace ? aim.placeZ : aim.hitZ;
            let isFine = (curW.type === 'block' && isVoxelCube(curW.blockId)) || curW.toolType === 'pickaxe';
            
            let mx = isFine ? Math.floor(targetX) : targetX;
            let my = isFine ? Math.floor(targetY) : targetY;
            let mz = isFine ? Math.floor(targetZ) : targetZ;
            
            if (isFine) {
                aimBox.position.set(mx + 0.5, mz + 0.5, my + 0.5);
                aimBox.scale.set(1, 1, 1);
            } else {
                aimBox.position.set(mx, mz, my);
                aimBox.scale.set(1.4, 1.4, 1.4);
            }
            aimBox.visible = true;
        } else {
            aimBox.visible = false;
        }
    } else {
        aimBox.visible = false;
    }
    
    // Draw pick coordination highlight box
    if (coordPickerActive && lastPickedCoord && lastPickedCoord.world) {
        let w = lastPickedCoord.world;
        pickerBox.position.set(w.x, w.z, w.y);
        pickerBox.visible = true;
    } else {
        pickerBox.visible = false;
    }
    
    // Draw vehicles
    for (let v of vehicles) {
        let model = WEAPON_MODELS[v.type];
        if (model) {
            let conf = VEHICLE_MODEL_CONFIG[v.type] || { scale: 1, rotX: 0, rotY: 0, rotZ: 0, offsetZ: 0 };
            let vcx = Math.cos(v.angle), vsx = Math.sin(v.angle);
            
            for (let f of model.faces) {
                let wPts = [];
                for (let pt of f.pts) {
                    let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, conf.rotZ);
                    p1.x *= conf.scale; p1.y *= conf.scale; p1.z *= conf.scale;
                    
                    let cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
                    let cr = Math.cos(v.roll), sr = Math.sin(v.roll);
                    
                    let p2x = p1.x * cp - p1.z * sp;
                    let p2y = p1.y;
                    let p2z = p1.x * sp + p1.z * cp;
                    
                    let p3x = p2x;
                    let p3y = p2y * cr - p2z * sr;
                    let p3z = p2y * sr + p2z * cr;
                    
                    let wx = p3x * vcx - p3y * vsx;
                    let wy = p3x * vsx + p3y * vcx;
                    
                    wPts.push({ x: v.x + wx, y: v.y + wy, z: v.z + p3z + (conf.offsetZ || 0) });
                }
                
                let ux = wPts[1].x - wPts[0].x, uy = wPts[1].y - wPts[0].y, uz = wPts[1].z - wPts[0].z;
                let wx = wPts[2].x - wPts[0].x, wy = wPts[2].y - wPts[0].y, wz = wPts[2].z - wPts[0].z;
                let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                let len = Math.hypot(nx, ny, nz);
                let norm = { x: nx/len, y: ny/len, z: nz/len };
                
                let color = v === interactTarget ? { r: f.color.r + 40, g: f.color.g + 40, b: f.color.b + 40 } : f.color;
                addFaceToDynamicBuffer('solid', wPts, color, norm);
            }
        } else {
            drawBillboardEmoji(v, '🚚', 4.0, v.x, v.y, v.z, v === interactTarget);
        }
    }
    
    // Draw dynamic enemies
    for (let e of enemies) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < VIEW_DIST) {
            if (e.type === 'zombie3d' || e.type === 'zombie' || e.type === 'experimental') {
                add3DZombieFaces(e, ambientVal);
            } else {
                drawBillboardEmoji(e, e.emoji || '👽', e.size, e.x, e.y, e.z, e === interactTarget, false, e.dead);
            }
        }
    }
    
    // Draw player in third person views
    let shouldRenderPlayer = false;
    if (freecam) {
        shouldRenderPlayer = true;
    } else if (player.inVehicle) {
        shouldRenderPlayer = (player.vehicleView === '3rd_back' || player.vehicleView === '3rd_front');
    } else {
        shouldRenderPlayer = (player.view === '3rd_back' || player.view === '3rd_front');
    }
    if (shouldRenderPlayer) {
        add3DPlayerFaces(ambientVal, realPlayerX, realPlayerY);
    }
    
    // Draw floating damage numbers
    for (let d of damageTexts) {
        let key = d;
        activeSpritesThisFrame.add(key);
        
        let sprite = threeDynamicSprites.get(key);
        let texture = DmgTextCache.get(String(Math.round(d.amt * 10) / 10));
        if (!sprite) {
            let mat = new THREE.SpriteMaterial({ map: texture, transparent: true, fog: true });
            sprite = new THREE.Sprite(mat);
            scene.add(sprite);
            threeDynamicSprites.set(key, sprite);
        }
        sprite.position.set(d.x, d.z + 1.2, d.y);
        sprite.scale.set(1.5, 0.75, 1.0);
        sprite.material.opacity = d.life / 60.0;
        sprite.material.needsUpdate = true;
    }
    
    // Process standard renderPool faces (populate dynamic buffers)
    for (let i = 0; i < renderCount; i++) {
        let o = renderPool[i];
        if (o.type === 'objWorldFace') {
            let bufferType = 'solid';
            let uvs = null;
            if (o.texture) {
                if (o.texture === minecraftZombieSkinImg || o.texture === fallbackSkinCanvas) {
                    bufferType = 'zombie';
                } else if (o.texture === minecraftPlayerSkinImg || o.texture === fallbackPlayerSkinCanvas) {
                    bufferType = 'player';
                }
                uvs = o.uvs;
            }
            
            let normalizedUVs = null;
            if (uvs) {
                let imgW = o.texture.naturalWidth || o.texture.width || 64;
                let imgH = o.texture.naturalHeight || o.texture.height || 64;
                normalizedUVs = uvs.map(pt => ({
                    u: pt.u / imgW,
                    v: 1.0 - (pt.v / imgH)
                }));
            }
            
            let pts = o.pts;
            let ux = pts[1].x - pts[0].x, uy = pts[1].y - pts[0].y, uz = pts[1].z - pts[0].z;
            let wx = pts[2].x - pts[0].x, wy = pts[2].y - pts[0].y, wz = pts[2].z - pts[0].z;
            let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
            let len = Math.hypot(nx, ny, nz);
            let norm = len > 0 ? { x: nx/len, y: ny/len, z: nz/len } : { x: 0, y: 0, z: 1 };
            
            let color = o.flash ? { r: 255, g: 255, b: 255 } : o.color;
            if (o.targeted) {
                color = { r: Math.min(255, color.r + 40), g: Math.min(255, color.g + 40), b: Math.min(255, color.b + 40) };
            }
            if (o.alpha !== undefined && o.alpha < 1.0) {
                color.a = o.alpha;
            }
            
            addFaceToDynamicBuffer(bufferType, pts, color, norm, normalizedUVs);
        }
    }
    
    // Upload dynamic meshes to GPU
    uploadDynamicBuffers();
    
    // Draw held weapon in first person view
    let isFirstPerson = (player.inVehicle ? player.vehicleView === '1st' : player.view === '1st');
    if (isFirstPerson && !freecam) {
        let activeItem = inventory[hotbarSelection];
        let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;
        if (curW) {
            updateHeldWeapon(curW);
            
            let wName = curW.name.toLowerCase();
            let conf = WEAPON_MODEL_CONFIG[wName] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0, offsetX: 0.2, offsetY: 0.5, offsetZ: -0.2 };
            
            let isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
            let bobX = isMoving && !flightMode ? Math.cos(gameTime * 200) * 0.01 : 0;
            let bobY = isMoving && !flightMode ? Math.abs(Math.sin(gameTime * 200)) * 0.02 : 0;
            let recoilOffset = fireCooldown > 0 ? (fireCooldown / curW.fireRate) * 0.1 : 0;
            
            let targetOffsetX = isZooming ? (conf.zoomOffsetX !== undefined ? conf.zoomOffsetX : 0) : conf.offsetX;
            let targetOffsetY = isZooming ? (conf.zoomOffsetY !== undefined ? conf.zoomOffsetY : conf.offsetY - 0.1) : conf.offsetY;
            let targetOffsetZ = isZooming ? (conf.zoomOffsetZ !== undefined ? conf.zoomOffsetZ : conf.offsetZ + 0.05) : conf.offsetZ;
            
            let ox = targetOffsetX + bobX;
            let oy = targetOffsetY - recoilOffset;
            let oz = targetOffsetZ - bobY + (recoilOffset * 0.2);
            
            heldWeaponGroup.position.set(ox, oz, -oy);
        } else {
            heldWeaponGroup.visible = false;
        }
    } else {
        heldWeaponGroup.visible = false;
    }
    
    // Clean up dynamic sprites that were not rendered
    for (let [key, sprite] of threeDynamicSprites.entries()) {
        if (!activeSpritesThisFrame.has(key)) {
            scene.remove(sprite);
            threeDynamicSprites.delete(key);
        }
    }
    
    // Clean up torch point lights that were not rendered
    for (let [key, light] of threePointLights.entries()) {
        if (!activePointLightsThisFrame.has(key)) {
            scene.remove(light);
            threePointLights.delete(key);
        }
    }
    
    // Clean up torch glows that were not rendered
    for (let [key, glow] of threeTorchGlows.entries()) {
        if (!activeTorchGlowsThisFrame.has(key)) {
            scene.remove(glow);
            threeTorchGlows.delete(key);
        }
    }
    
    // Orient and apply ambient emissive boost to all active billboard meshes to match daytime surroundings
    let dayFactor = 0.0;
    if (gameState === 'overworld') {
        dayFactor = Math.max(0.0, (ambientVal - 0.2) / 0.8);
    }
    
    // Tone down the daytime blue sky tint by mixing with grayscale average
    let avg = (ambientR + ambientG + ambientB) / 3;
    let mixedR = ambientR * 0.25 + avg * 0.75;
    let mixedG = ambientG * 0.25 + avg * 0.75;
    let mixedB = ambientB * 0.25 + avg * 0.75;
    
    let emissiveIntensity = dayFactor * 0.28;
    let emissiveColor = new THREE.Color(
        mixedR * emissiveIntensity,
        mixedG * emissiveIntensity,
        mixedB * emissiveIntensity
    );

    for (let mesh of activeBillboardMeshes) {
        mesh.quaternion.copy(camera.quaternion);
        if (mesh.material && mesh.material.emissive) {
            mesh.material.emissive.copy(emissiveColor);
        }
    }
    
    // Run WebGL Render Call
    renderer.render(scene, camera);
    
    // Update HTML overlay indicators
    let crosshairEl = document.getElementById('crosshair');
    if (crosshairEl) {
        if (isFirstPerson && !freecam) {
            crosshairEl.className = 'visible';
            if (fireCooldown > 0) crosshairEl.classList.add('recoil');
            if (isZooming) crosshairEl.classList.add('zoomed');
        } else {
            crosshairEl.className = '';
        }
    }
    
    let submergedEl = document.getElementById('submerged-overlay');
    if (submergedEl) {
        if (player.isSubmerged) {
            submergedEl.classList.add('visible');
        } else {
            submergedEl.classList.remove('visible');
        }
    }
    
    // Process picked coordinate candidate raycasting
    if (triggerCoordPick) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        if (document.pointerLockElement === canvas) {
            mouse.x = 0;
            mouse.y = 0;
        } else {
            let rect = canvas.getBoundingClientRect();
            mouse.x = ((pickX_screen - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((pickY_screen - rect.top) / rect.height) * 2 + 1;
        }
        
        raycaster.setFromCamera(mouse, camera);
        
        const targets = [];
        for (let chunk of threeChunks.values()) {
            if (chunk.solidMesh) targets.push(chunk.solidMesh);
        }
        
        const intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            const hit = intersects[0];
            const p = hit.point;
            
            bestPickPoint = { x: p.x, y: p.z, z: p.y };
            bestPickDepth = hit.distance;
            
            bestPickVehicle = null;
            for (let v of vehicles) {
                let dist = Math.hypot(v.x - bestPickPoint.x, v.y - bestPickPoint.y, v.z - bestPickPoint.z);
                if (dist < 4.0) {
                    bestPickVehicle = v;
                    break;
                }
            }
            
            let localCoords = null;
            let vType = null;
            if (bestPickVehicle) {
                let v = bestPickVehicle;
                vType = v.type;
                let cosA = Math.cos(v.angle);
                let sinA = Math.sin(v.angle);
                let dx = (bestPickPoint.x - v.x) * cosA + (bestPickPoint.y - v.y) * sinA;
                let dy = -(bestPickPoint.x - v.x) * sinA + (bestPickPoint.y - v.y) * cosA;
                let dz = bestPickPoint.z - v.z;
                localCoords = { dx, dy, dz };
            }
            
            lastPickedCoord = {
                world: bestPickPoint,
                local: localCoords,
                vehicleType: vType,
                time: performance.now()
            };
            
            console.log("PICKED COORDS (Raycast):", lastPickedCoord);
            if (window.updatePickerPanelUI) {
                window.updatePickerPanelUI();
            }
        }
        triggerCoordPick = false;
    }
    
    // Restore player coordinate states
    player.x = realPlayerX;
    player.y = realPlayerY;
}