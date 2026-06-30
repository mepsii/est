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
let solidMaterial = null;
let glassMaterial = null;

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

const BlockTextureAtlas = {
    canvas: null,
    texture: null,
    initialized: false,
    loaded: false,
    uvCache: null,
    
    // Maps blockId to Slot index in our atlas
    // blockId 4 = Wood Block (Slot 1)
    // blockId 5 = Stone Cube (Slot 2)
    mappings: {
        4: 1, // Wood
        5: 2  // Stone
    },
    
    init() {
        if (this.initialized) return;
        this.initialized = true;
        
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 256;
        const ctx = this.canvas.getContext('2d');
        
        // Fill entire atlas with white by default (so slot 0 is pure white fallback)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 512, 256);
        
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        
        // Pre-calculate and cache UV mappings to avoid object allocations in hot paths
        this.uvCache = [];
        const atlasW = 512;
        const atlasH = 256;
        const slotSize = 128;
        
        for (let slot = 0; slot < 8; slot++) {
            this.uvCache[slot] = [];
            let col = slot % 4;
            let row = Math.floor(slot / 4);
            let px = col * slotSize;
            let py = row * slotSize;
            
            let uMin = px / atlasW;
            let uMax = (px + slotSize) / atlasW;
            let vMin = 1.0 - (py + slotSize) / atlasH;
            let vMax = 1.0 - py / atlasH;
            
            for (let face = 0; face < 6; face++) {
                this.uvCache[slot][face] = getFaceCornerUVs(face, uMin, vMin, uMax, vMax);
            }
        }
        
        const texturesToLoad = [
            { id: 4, src: 'textures/blocks/woodplank.png', slot: 1 },
            { id: 5, src: 'textures/blocks/cobble.png', slot: 2 },
            { id: 1, src: 'textures/blocks/grass.png', slot: 3 },
            { id: 9, src: 'textures/blocks/window.png', slot: 4 }
        ];
        
        let loadedCount = 0;
        const checkDone = () => {
            loadedCount++;
            if (loadedCount === texturesToLoad.length) {
                this.loaded = true;
                this.texture.needsUpdate = true;
            }
        };
        
        texturesToLoad.forEach(t => {
            const img = new Image();
            img.onload = () => {
                console.log(`BlockTextureAtlas: Successfully loaded texture: ${t.src}`);
                let col = t.slot % 4;
                let row = Math.floor(t.slot / 4);
                ctx.clearRect(col * 128, row * 128, 128, 128);
                if (t.id !== 9) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(col * 128, row * 128, 128, 128);
                    ctx.drawImage(img, col * 128, row * 128, 128, 128);
                } else {
                    // For glass block, flip Y to invert vertically
                    ctx.save();
                    ctx.translate(col * 128 + 64, row * 128 + 64);
                    ctx.scale(1, -1);
                    ctx.drawImage(img, -64, -64, 128, 128);
                    ctx.restore();
                }
                checkDone();
            };
            img.onerror = () => {
                console.warn(`BlockTextureAtlas: Failed to load texture: ${t.src}. Using procedural fallback.`);
                let col = t.slot % 4;
                let row = Math.floor(t.slot / 4);
                if (t.id === 4) {
                    ctx.fillStyle = '#a06e3c';
                    ctx.fillRect(col * 128, row * 128, 128, 128);
                    ctx.fillStyle = '#78461e';
                    for (let y = 16; y < 128; y += 32) {
                        ctx.fillRect(col * 128, row * 128 + y, 128, 4);
                    }
                } else if (t.id === 5) {
                    ctx.fillStyle = '#8c8c8c';
                    ctx.fillRect(col * 128, row * 128, 128, 128);
                    ctx.fillStyle = '#5c5c5c';
                    for (let i = 0; i < 20; i++) {
                        let rx = Math.floor(Math.random() * 100);
                        let ry = Math.floor(Math.random() * 100);
                        ctx.fillRect(col * 128 + rx, row * 128 + ry, 24, 16);
                    }
                } else if (t.id === 1) {
                    ctx.fillStyle = '#55a02d';
                    ctx.fillRect(col * 128, row * 128, 128, 128);
                    ctx.fillStyle = '#3c781e';
                    for (let i = 0; i < 40; i++) {
                        let rx = Math.floor(Math.random() * 110);
                        let ry = Math.floor(Math.random() * 110);
                        ctx.fillRect(col * 128 + rx, row * 128 + ry, 8, 8);
                    }
                } else if (t.id === 9) {
                    ctx.fillStyle = 'rgba(200, 240, 255, 0.4)';
                    ctx.fillRect(col * 128, row * 128, 128, 128);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 8;
                    ctx.strokeRect(col * 128 + 4, row * 128 + 4, 120, 120);
                    ctx.beginPath();
                    ctx.moveTo(col * 128 + 30, row * 128 + 30);
                    ctx.lineTo(col * 128 + 50, row * 128 + 50);
                    ctx.moveTo(col * 128 + 70, row * 128 + 70);
                    ctx.lineTo(col * 128 + 90, row * 128 + 90);
                    ctx.stroke();
                }
                checkDone();
            };
            img.src = t.src;
        });
    },
    
    getSlotUVs(slotIndex, faceIndex) {
        if (!this.uvCache) return null;
        let fIdx = Math.max(0, Math.min(5, faceIndex));
        let sIdx = Math.max(0, Math.min(7, slotIndex));
        return this.uvCache[sIdx][fIdx];
    }
};

// Initialize Three.js scene, camera, lights, and mesh containers
function initThree() {
    globalInstancedMeshes.clear();
    camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene = new THREE.Scene();
    
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true });
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
    const solidMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide
    });
    dynamicSolidMesh = new THREE.Mesh(solidGeo, solidMat);
    dynamicSolidMesh.frustumCulled = false;
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
    dynamicCloudMesh.frustumCulled = false;
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
    dynamicPlayerMesh.frustumCulled = false;
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
    dynamicZombieMesh.frustumCulled = false;
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
        scene.remove(cached.glassMesh);
        if (cached.glassMesh) cached.glassMesh.geometry.dispose();
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
    const glassFaces = [];
    const waterFaces = [];
    for (let f of faces) {
        if (f.isWater) waterFaces.push(f);
        else if (f.vType === 9) glassFaces.push(f);
        else solidFaces.push(f);
    }
    
    const solidMesh = buildFacesMesh(solidFaces, false, false);
    const glassMesh = buildFacesMesh(glassFaces, false, true);
    const waterMesh = buildFacesMesh(waterFaces, true, false);
    
    if (solidMesh) scene.add(solidMesh);
    if (glassMesh) scene.add(glassMesh);
    if (waterMesh) scene.add(waterMesh);
    
    // Build static billboards inside chunk (trees, rocks, flowers, cactuses, skulls)
    let [cx, cy] = key.split(',').map(Number);
    let chunkEntities = getMapChunk(cx, cy);
    
    // Store the raw chunkEntities directly so they can be rendered via instancing in render.js
    threeChunks.set(key, { solidMesh, glassMesh, waterMesh, facesRef: faces, entities: chunkEntities });
}

function getSolidMaterial() {
    if (solidMaterial) return solidMaterial;
    if (!BlockTextureAtlas.initialized) {
        BlockTextureAtlas.init();
    }
    solidMaterial = new THREE.MeshLambertMaterial({
        map: BlockTextureAtlas.texture,
        vertexColors: true,
        side: THREE.FrontSide
    });
    return solidMaterial;
}

function getGlassMaterial() {
    if (glassMaterial) return glassMaterial;
    if (!BlockTextureAtlas.initialized) {
        BlockTextureAtlas.init();
    }
    glassMaterial = new THREE.MeshLambertMaterial({
        map: BlockTextureAtlas.texture,
        vertexColors: true,
        transparent: true,
        alphaTest: 0.05,
        side: THREE.FrontSide
    });
    return glassMaterial;
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
function buildFacesMesh(faces, isWater, isGlass = false) {
    if (faces.length === 0) return null;
    
    const positions = [];
    const colors = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    let vertCount = 0;
    
    if (!isWater && !BlockTextureAtlas.initialized) {
        BlockTextureAtlas.init();
    }
    
    for (let f of faces) {
        const pts = f.pts;
        if (pts.length < 3) continue;
        
        let faceUVs = null;
        let slotIndex = 0;
        
        if (!isWater) {
            // Determine faceIndex from normal vector (round to avoid float precision mismatches)
            let faceIndex = 0;
            const nx = Math.round(f.norm.x);
            const ny = Math.round(f.norm.y);
            const nz = Math.round(f.norm.z);
            if (nx === 0 && ny === 0 && nz === 1) faceIndex = 4; // Top
            else if (nx === 0 && ny === 0 && nz === -1) faceIndex = 5; // Bottom
            else if (nx === 1 && ny === 0 && nz === 0) faceIndex = 3; // Right
            else if (nx === -1 && ny === 0 && nz === 0) faceIndex = 2; // Left
            else if (nx === 0 && ny === 1 && nz === 0) faceIndex = 0; // Front
            else if (nx === 0 && ny === -1 && nz === 0) faceIndex = 1; // Back
            
            // Map voxel type to slot index
            if (f.vType === 9) {
                if (faceIndex === 4 || faceIndex === 5) {
                    slotIndex = 1; // woodplank
                } else {
                    slotIndex = 4; // window
                }
            } else if (f.vType !== undefined && BlockTextureAtlas.mappings[f.vType] !== undefined) {
                slotIndex = BlockTextureAtlas.mappings[f.vType];
            } else if (enableGrassTexture && (f.vType === 1 || f.vType === 6) && f.col.g > f.col.r && f.col.b < 100) {
                slotIndex = 3;
            }
            
            faceUVs = BlockTextureAtlas.getSlotUVs(slotIndex, faceIndex);
        }
        
        for (let i = 0; i < pts.length; i++) {
            const pt = pts[i];
            positions.push(pt.x, pt.z, pt.y);
            
            // Override base color to white for textured blocks to prevent color tinting, but keep ambient/shadow shading
            let r, g, b;
            if (!isWater && slotIndex > 0) {
                r = f.shade;
                g = f.shade;
                b = f.shade;
            } else {
                r = (f.col.r / 255) * f.shade;
                g = (f.col.g / 255) * f.shade;
                b = (f.col.b / 255) * f.shade;
            }
            const a = f.col.a !== undefined ? f.col.a : 1.0;
            colors.push(r, g, b, a);
            
            normals.push(f.norm.x, f.norm.z, f.norm.y);
            
            if (!isWater) {
                if (faceUVs && faceUVs[i]) {
                    uvs.push(faceUVs[i].u, faceUVs[i].v);
                } else {
                    uvs.push(0.0, 0.0);
                }
            }
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
    if (!isWater) {
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    geometry.setIndex(indices);
    
    let material;
    if (isWater) {
        material = getWaterMaterial();
    } else if (isGlass) {
        material = getGlassMaterial();
    } else {
        material = getSolidMaterial();
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

function updateDynamicAttribute(geometry, attributeName, dataArray, itemSize) {
    let attr = geometry.getAttribute(attributeName);
    const requiredLength = dataArray.length;
    
    if (!attr || attr.array.length < requiredLength) {
        const capacity = Math.max(Math.ceil(requiredLength * 1.3 / itemSize) * itemSize, 1024 * itemSize);
        const typedArray = new Float32Array(capacity);
        typedArray.set(dataArray);
        
        attr = new THREE.BufferAttribute(typedArray, itemSize);
        attr.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute(attributeName, attr);
    } else {
        attr.array.set(dataArray);
        attr.needsUpdate = true;
        attr.updateRange.offset = 0;
        attr.updateRange.count = requiredLength;
    }
}

// Update buffer geometry attributes
function updateBufferGeometry(geometry, data, hasUVs) {
    if (data.vertCount === 0) {
        geometry.setDrawRange(0, 0);
        return;
    }
    
    updateDynamicAttribute(geometry, 'position', data.positions, 3);
    updateDynamicAttribute(geometry, 'color', data.colors, 4);
    updateDynamicAttribute(geometry, 'normal', data.normals, 3);
    if (hasUVs) {
        updateDynamicAttribute(geometry, 'uv', data.uvs, 2);
    }
    
    // Update index
    let indexAttr = geometry.getIndex();
    const requiredIndices = data.indices.length;
    if (!indexAttr || indexAttr.array.length < requiredIndices) {
        const capacity = Math.max(Math.ceil(requiredIndices * 1.3), 1024);
        const typedArray = new Uint32Array(capacity);
        typedArray.set(data.indices);
        
        indexAttr = new THREE.BufferAttribute(typedArray, 1);
        indexAttr.setUsage(THREE.DynamicDrawUsage);
        geometry.setIndex(indexAttr);
    } else {
        indexAttr.array.set(data.indices);
        indexAttr.needsUpdate = true;
        indexAttr.updateRange.offset = 0;
        indexAttr.updateRange.count = requiredIndices;
    }
    
    geometry.setDrawRange(0, requiredIndices);
}

function buildThreeMeshFromModel(modelName, conf) {
    if (typeof WEAPON_MODELS === 'undefined') return null;
    const model = WEAPON_MODELS[modelName];
    if (!model) return null;
    
    const positions = [];
    const colors = [];
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
        
        indices.push(vertCount, vertCount + 2, vertCount + 1);
        vertCount += 3;
    }
    
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    return new THREE.Mesh(geom, mat);
}

function rebuildAllChunkMeshes() {
    threeChunks.forEach((cached, key) => {
        if (cached.solidMesh) scene.remove(cached.solidMesh);
        if (cached.glassMesh) scene.remove(cached.glassMesh);
        if (cached.waterMesh) scene.remove(cached.waterMesh);
    });
    threeChunks.clear();
}
