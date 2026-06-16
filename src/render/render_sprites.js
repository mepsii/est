//THIS IS render_sprites.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

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
const heldWeaponMeshes = {}; // Cache for pre-built weapon meshes

function updateHeldWeapon(wData) {
    let wName = wData.name.toLowerCase();
    let model = WEAPON_MODELS[wName];
    if (!model || wData.isMelee) {
        if (heldWeaponGroup.visible) {
            heldWeaponGroup.visible = false;
        }
        lastHeldWeaponId = null;
        return;
    }
    
    if (!heldWeaponGroup.visible) {
        heldWeaponGroup.visible = true;
    }
    
    // Only toggle visibility if the equipped weapon has changed
    if (lastHeldWeaponId !== wName) {
        // Hide all cached weapon meshes first
        for (let key in heldWeaponMeshes) {
            heldWeaponMeshes[key].visible = false;
        }
        
        // If the mesh is not yet cached, build/clone it once
        if (!heldWeaponMeshes[wName]) {
            let conf = WEAPON_MODEL_CONFIG[wName] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0 };
            
            if (window.NATIVE_GLTF_MODELS && window.NATIVE_GLTF_MODELS[wName]) {
                console.log(`[Weapon System] Cloning and caching native 3D GLTF mesh for: ${wData.name}`);
                const mesh = window.NATIVE_GLTF_MODELS[wName].clone();
                mesh.scale.set(conf.scale, conf.scale, conf.scale);
                mesh.rotation.set(conf.rotX, conf.rotY, conf.rotZ);
                
                heldWeaponGroup.add(mesh);
                heldWeaponMeshes[wName] = mesh;
            } else {
                console.log(`[Weapon System] Building and caching 3D mesh from OBJ faces for: ${wData.name}`);
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
                
                const mat = new THREE.MeshLambertMaterial({
                    vertexColors: true,
                    flatShading: true,
                    side: THREE.FrontSide
                });
                
                const mesh = new THREE.Mesh(geom, mat);
                heldWeaponGroup.add(mesh);
                heldWeaponMeshes[wName] = mesh;
            }
        }
        
        // Show the active weapon mesh
        heldWeaponMeshes[wName].visible = true;
        lastHeldWeaponId = wName;
    }
}

function getMuzzleWorldPos() {
    let activeItem = inventory[hotbarSelection];
    let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;
    if (!curW || activeItem.id !== 'pistol') return null;
    
    // Explicitly update camera and child matrices so local matrix changes are immediately baked into world matrices
    camera.updateMatrixWorld(true);
    
    let isFirstPerson = (player.inVehicle ? player.vehicleView === '1st' : player.view === '1st');
    if (isFirstPerson && !freecam) {
        let muzzleLocal = new THREE.Vector3(0.0, 0.1245, -0.32);
        let camMuzzle = new THREE.Vector3(
            heldWeaponGroup.position.x + muzzleLocal.x,
            heldWeaponGroup.position.y + muzzleLocal.y,
            heldWeaponGroup.position.z + muzzleLocal.z
        );
        camMuzzle.applyMatrix4(camera.matrixWorld);
        return {
            x: camMuzzle.x,
            y: camMuzzle.z,
            z: camMuzzle.y
        };
    } else {
        // Third person
        let scale = player.baseHeight / 32.0;
        let rotAngle = player.angle - Math.PI / 2;
        let cosH = Math.cos(rotAngle);
        let sinH = Math.sin(rotAngle);
        
        let pitchAngle = player.pitch;
        let rArmPitch = 1.57 - pitchAngle;
        let rElbowBend = 0.1;
        
        let localHandPt = { x: -6, y: 0.5, z: 12.0 };
        let handPt1 = rotateAroundPivot(localHandPt.x, localHandPt.y, localHandPt.z, -6, 0, 18, rElbowBend, 0, 0);
        let handPt2 = rotateAroundPivot(handPt1.x, handPt1.y, handPt1.z, -6, 0, 24, rArmPitch, 0, 0);
        
        let hx = handPt2.x * scale;
        let hy = handPt2.y * scale;
        let hz = handPt2.z * scale;
        
        let wxHand = hx * cosH - hy * sinH;
        let wyHand = hx * sinH + hy * cosH;
        let wzHand = hz;
        
        let realX = player.x;
        let realY = player.y;
        let realZ = player.z;
        
        let worldHandPt = {
            x: realX + wxHand,
            y: realY + wyHand,
            z: realZ + wzHand
        };
        
        let conf = WEAPON_MODEL_CONFIG['pistol'] || { scale: 0.2 };
        let weaponScale = conf.scale * 1.3;
        
        let p1 = {
            x: 0.0041 * 1.3,
            y: 0.1245 * 1.3,
            z: -0.32 * 1.3
        };
        
        let p2 = rotate3D(p1.x, p1.y, p1.z, rArmPitch - 1.57, 0, 0);
        
        let wxW = p2.x * cosH - p2.y * sinH;
        let wyW = p2.x * sinH + p2.y * cosH;
        let wzW = p2.z;
        
        return {
            x: worldHandPt.x + wxW,
            y: worldHandPt.y + wyW,
            z: worldHandPt.z + wzW
        };
    }
}
