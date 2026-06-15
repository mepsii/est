//THIS IS render_init.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

let threeInitialized = false;
let scene, camera, renderer;
let ambientLight, sunLight, flashlight, muzzleFlashLight, muzzleFlashSprite;
let threeChunks = new Map();
let threeDynamicSprites = new Map();
let threePointLights = new Map();
let threeTorchGlows = new Map();
let threeVehicles = new Map();
let threeDroppedItems = new Map();
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
let weaponSwayX = 0;
let weaponSwayY = 0;
let lastPlayerAngle = undefined;
let lastPlayerPitch = undefined;
let billboardGeo;
let activeBillboardMeshes = new Set();
let waterMaterial = null;

let globalInstancedMeshes = new Map();
const instPos = new THREE.Vector3();
const instScale = new THREE.Vector3();
const instMatrix = new THREE.Matrix4();


// Persistent vectors to avoid allocation in render loop
const particleCamRight = new THREE.Vector3();
const particleCamUp = new THREE.Vector3();
const particleCamBack = new THREE.Vector3();

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

// Cache starburst-like pixelated textures for muzzle flashes
const MuzzleFlashTextureCache = {
    texture: null,
    get() {
        if (this.texture) return this.texture;
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const cx = c.getContext('2d');
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                let dx = Math.abs(x - 7.5);
                let dy = Math.abs(y - 7.5);
                // Center core: bright yellow/white
                if (dx <= 1.5 && dy <= 1.5) {
                    cx.fillStyle = 'rgba(255, 255, 200, 0.9)';
                    cx.fillRect(x, y, 1, 1);
                }
                // Spikes / cross shape: orange fade out
                else if ((dx <= 0.5 && dy <= 6.5) || (dy <= 0.5 && dx <= 6.5) || (dx <= 3.5 && dy <= 3.5)) {
                    let maxD = Math.max(dx, dy);
                    let alpha = 0.9 - (maxD / 8);
                    cx.fillStyle = `rgba(255, 170, 0, ${alpha})`;
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

// Cache radial gradient grey textures for smoke puffs
const SmokeTextureCache = {
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
                    cx.fillStyle = `rgba(220, 220, 220, ${alpha})`;
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
    globalInstancedMeshes.clear();
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
    
    // Muzzle flash point light (added directly to scene so it's not hidden with heldWeaponGroup)
    muzzleFlashLight = new THREE.PointLight(0xffdd66, 0.0, 6, 1.5);
    scene.add(muzzleFlashLight);
    
    // Muzzle flash visual sprite for first person (attached to weapon group)
    muzzleFlashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: MuzzleFlashTextureCache.get(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    muzzleFlashSprite.position.set(0, 0.1245, -0.32);
    muzzleFlashSprite.scale.set(0.18, 0.18, 1.0);
    muzzleFlashSprite.visible = false;
    heldWeaponGroup.add(muzzleFlashSprite);
    
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
        side: THREE.FrontSide,
        depthWrite: false,
        fog: false
    });
    dynamicCloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    dynamicCloudMesh.renderOrder = 2;
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

function getOrCreateInstancedMesh(emoji) {
    let instData = globalInstancedMeshes.get(emoji);
    if (!instData) {
        let texture = ThreeTextureCache.get(emoji, false, false, 1.0);
        let mat = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5,
            roughness: 1.0,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        let capacity = 1024;
        let instMesh = new THREE.InstancedMesh(billboardGeo, mat, capacity);
        instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(instMesh);
        instData = { mesh: instMesh, capacity: capacity, count: 0 };
        globalInstancedMeshes.set(emoji, instData);
    }
    return instData;
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
                if (sprite instanceof THREE.Object3D) {
                    scene.remove(sprite);
                }
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
    
    // Store the raw chunkEntities directly so they can be rendered via instancing in render.js
    threeChunks.set(key, { solidMesh, waterMesh, facesRef: faces, entities: chunkEntities });
}

function getWaterMaterial() {
    if (waterMaterial) return waterMaterial;
    
    waterMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    
    waterMaterial.userData = {
        uTime: { value: 0 }
    };
    
    waterMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = waterMaterial.userData.uTime;
        
        shader.vertexShader = `
            uniform float uTime;
            varying vec3 vWaterPos;
        ` + shader.vertexShader;
        
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            if (normal.y > 0.5) {
                float waveVal = sin(position.x * 0.5 + uTime) * cos(position.z * 0.5 + uTime * 0.8) * 0.08 +
                                sin(position.x * 0.15 - uTime * 0.5) * 0.03;
                transformed.y += waveVal;
            }
            vWaterPos = transformed;
            `
        );
        
        shader.fragmentShader = `
            uniform float uTime;
            varying vec3 vWaterPos;
        ` + shader.fragmentShader;
        
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            float shimmer = sin(vWaterPos.x * 1.0 + uTime * 1.5) * cos(vWaterPos.z * 1.0 + uTime * 1.15) * 0.15 +
                            sin(vWaterPos.x * 0.3 - uTime * 0.75) * 0.05;
            diffuseColor.rgb = clamp(diffuseColor.rgb + shimmer * 0.15, vec3(0.0), vec3(1.0));
            diffuseColor.a = clamp(diffuseColor.a + shimmer * 0.08, 0.35, 0.85);
            `
        );
    };
    
    return waterMaterial;
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
        material = getWaterMaterial();
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

// Update buffer geometry attributes
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

function buildThreeMeshFromModel(modelName, conf) {
    if (typeof WEAPON_MODELS === 'undefined') return null;
    const model = WEAPON_MODELS[modelName];
    if (!model) return null;
    
    const positions = [];
    const colors = [];
    const normals = [];
    const indices = [];
    let vertCount = 0;
    
    for (let f of model.faces) {
        const pts = [];
        for (let v of f.pts) {
            let p1 = rotate3D(v.x, v.y, v.z, conf.rotX, conf.rotY, conf.rotZ);
            p1.x *= conf.scale; p1.y *= conf.scale; p1.z *= conf.scale;
            
            let lx = p1.x + (conf.offsetX || 0);
            let ly = p1.y + (conf.offsetY || 0);
            let lz = p1.z + (conf.offsetZ || 0);
            
            // Swap Y and Z to map to Three.js space
            pts.push({ x: lx, y: lz, z: ly });
        }
        
        for (let pt of pts) {
            positions.push(pt.x, pt.y, pt.z);
            colors.push(f.color.r / 255, f.color.g / 255, f.color.b / 255, 1.0);
        }
        
        // Compute face normal in Y-up space
        let ux = pts[1].x - pts[0].x, uy = pts[1].y - pts[0].y, uz = pts[1].z - pts[0].z;
        let wx = pts[2].x - pts[0].x, wy = pts[2].y - pts[0].y, wz = pts[2].z - pts[0].z;
        let cx = uy*wz - uz*wy;
        let cy = uz*wx - ux*wz;
        let cz = ux*wy - uy*wx;
        let len = Math.hypot(cx, cy, cz);
        if (len > 0) { cx /= len; cy /= len; cz /= len; }
        
        for (let i = 0; i < pts.length; i++) {
            normals.push(cx, cy, cz);
        }
        
        indices.push(vertCount, vertCount + 2, vertCount + 1);
        vertCount += 3;
    }
    
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setIndex(indices);
    
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    return new THREE.Mesh(geom, mat);
}
