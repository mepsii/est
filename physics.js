//THIS IS physics.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// --- Footstep Sound Effects System ---
const stepSoundsPool = [
    Array.from({ length: 3 }, () => {
        const audio = new Audio('sounds/step1.ogg');
        audio.preload = 'auto';
        return audio;
    }),
    Array.from({ length: 3 }, () => {
        const audio = new Audio('sounds/step2.ogg');
        audio.preload = 'auto';
        return audio;
    })
];
const nextStepSoundIdx = [0, 0];

function playStepSound(stepType) {
    try {
        const pool = stepSoundsPool[stepType];
        let idx = nextStepSoundIdx[stepType];
        const sound = pool[idx];
        sound.currentTime = 0;
        
        // Calculate distance from player to camera for volume attenuation
        let camX = typeof currentCamX !== 'undefined' ? currentCamX : player.x;
        let camY = typeof currentCamY !== 'undefined' ? currentCamY : player.y;
        let camZ = typeof currentCamZ !== 'undefined' ? currentCamZ : player.z;
        let dist = Math.hypot(player.x - camX, player.y - camY, player.z - camZ);
        
        // Quiet down base volume and filter by distance
        sound.volume = 0.08 / Math.max(1.0, dist * 0.5);
        
        sound.play().catch(e => {
            // Silence console warning if played before user gesture
        });
        nextStepSoundIdx[stepType] = (idx + 1) % pool.length;
    } catch (e) {
        console.error("Error playing step sound:", e);
    }
}

const mobStepSoundsPool = [
    Array.from({ length: 4 }, () => {
        const audio = new Audio('sounds/step1.ogg');
        audio.preload = 'auto';
        return audio;
    }),
    Array.from({ length: 4 }, () => {
        const audio = new Audio('sounds/step2.ogg');
        audio.preload = 'auto';
        return audio;
    })
];
const nextMobStepSoundIdx = [0, 0];

function playMobStepSound(x, y, z, stepType) {
    try {
        const pool = mobStepSoundsPool[stepType];
        let idx = nextMobStepSoundIdx[stepType];
        const sound = pool[idx];
        sound.currentTime = 0;
        
        let camX = typeof currentCamX !== 'undefined' ? currentCamX : player.x;
        let camY = typeof currentCamY !== 'undefined' ? currentCamY : player.y;
        let camZ = typeof currentCamZ !== 'undefined' ? currentCamZ : player.z;
        let dist = Math.hypot(x - camX, y - camY, z - camZ);
        
        if (dist > 35.0) return; // ignore sounds too far away to optimize
        
        // Attenuate volume based on distance (mobs are slightly quieter than player)
        let finalVolume = 0.05 / Math.max(1.0, dist * 0.7);
        if (finalVolume < 0.005) return;
        
        sound.volume = finalVolume;
        sound.play().catch(e => {
            // Silence console warning
        });
        nextMobStepSoundIdx[stepType] = (idx + 1) % pool.length;
    } catch (e) {
        console.error("Error playing mob step sound:", e);
    }
}

// --- Pistol Sound Effects ---
const pistolShotPool = Array.from({ length: 3 }, () => {
    const audio = new Audio('sounds/pistol/pistolshot1.wav');
    audio.preload = 'auto';
    return audio;
});
let nextPistolShotIdx = 0;

function playPistolShot() {
    try {
        const sound = pistolShotPool[nextPistolShotIdx];
        sound.currentTime = 0;
        sound.play();
        nextPistolShotIdx = (nextPistolShotIdx + 1) % pistolShotPool.length;
    } catch(e) {
        console.error("Error playing pistol shot sound:", e);
    }
}

function startPistolReload() {
    let activeItem = inventory[hotbarSelection];
    if (!activeItem || activeItem.id !== 'pistol') return;
    if (typeof ensurePistolAmmo === 'function') ensurePistolAmmo(activeItem);
    if (activeItem.bullets >= 10 || activeItem.reserve <= 0) return;
    if (player.pistolReloadTimer > 0) return;
    
    player.pistolReloadTimer = 60;
    if (typeof updateBulletCounterUI === 'function') updateBulletCounterUI();
}

// --- Ambient Sound Effects System ---
let ambianceAudio = null;
let waterAudio = null;
let desertAudio = null;

function updateAmbiance() {
    if (!ambianceAudio) {
        ambianceAudio = new Audio('sounds/ambiance1.wav');
        ambianceAudio.loop = true;
        ambianceAudio.volume = 0;
    }
    if (!waterAudio) {
        waterAudio = new Audio('sounds/water1.wav');
        waterAudio.loop = true;
        waterAudio.volume = 0;
    }
    if (!desertAudio) {
        desertAudio = new Audio('sounds/desert1.wav');
        desertAudio.loop = true;
        desertAudio.volume = 0;
    }
    
    let targetAmbianceVolume = 0;
    let targetWaterVolume = 0;
    let targetDesertVolume = 0;
    
    if (gameState === 'overworld' && !isLoading && hasLoaded && !isPaused) {
        let px = Math.floor(player.x);
        let py = Math.floor(player.y);
        
        // Find distance to nearest water column
        let nearestWaterDist = Infinity;
        let searchRadius = 8;
        for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
            for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
                let tx = px + dx;
                let ty = py + dy;
                let t = getTerrainFast(tx, ty);
                if (t.baseH <= 24.0 || t.isLake) { // 24 is WATER_LEVEL
                    let dist = Math.hypot(dx, dy);
                    if (dist < nearestWaterDist) {
                        nearestWaterDist = dist;
                    }
                }
            }
        }
        
        let moisture = getBiome(player.x, player.y);
        let waterFactor = 0;
        if (nearestWaterDist <= 8.0) {
            waterFactor = 1.0 - (nearestWaterDist / 8.0); // 1.0 at water, 0.0 at 8+ blocks away
        }
        
        targetWaterVolume = 0.30 * waterFactor;
        
        if (moisture >= 0.35) {
            // Player is in a green biome
            targetAmbianceVolume = 0.25 * (1.0 - waterFactor * 0.6); // fade green ambiance down by 60% near water
            targetDesertVolume = 0;
        } else {
            // Player is in desert biome
            targetAmbianceVolume = 0;
            targetDesertVolume = 0.25 * (1.0 - waterFactor * 0.6); // fade desert ambiance down by 60% near water
        }
    }
    
    // Smoothly fade ambiance volume in/out
    if (ambianceAudio.volume !== targetAmbianceVolume) {
        let diff = targetAmbianceVolume - ambianceAudio.volume;
        if (Math.abs(diff) < 0.01) {
            ambianceAudio.volume = targetAmbianceVolume;
        } else {
            ambianceAudio.volume += Math.sign(diff) * 0.005;
        }
    }
    
    // Smoothly fade water volume in/out
    if (waterAudio.volume !== targetWaterVolume) {
        let diff = targetWaterVolume - waterAudio.volume;
        if (Math.abs(diff) < 0.01) {
            waterAudio.volume = targetWaterVolume;
        } else {
            waterAudio.volume += Math.sign(diff) * 0.005;
        }
    }
    
    // Smoothly fade desert volume in/out
    if (desertAudio.volume !== targetDesertVolume) {
        let diff = targetDesertVolume - desertAudio.volume;
        if (Math.abs(diff) < 0.01) {
            desertAudio.volume = targetDesertVolume;
        } else {
            desertAudio.volume += Math.sign(diff) * 0.005;
        }
    }
    
    // Control ambiance playback
    if (targetAmbianceVolume > 0 && ambianceAudio.paused) {
        ambianceAudio.play().catch(e => {});
    } else if (targetAmbianceVolume === 0 && !ambianceAudio.paused && ambianceAudio.volume === 0) {
        ambianceAudio.pause();
    }
    
    // Control water playback
    if (targetWaterVolume > 0 && waterAudio.paused) {
        waterAudio.play().catch(e => {});
    } else if (targetWaterVolume === 0 && !waterAudio.paused && waterAudio.volume === 0) {
        waterAudio.pause();
    }
    
    // Control desert playback
    if (targetDesertVolume > 0 && desertAudio.paused) {
        desertAudio.play().catch(e => {});
    } else if (targetDesertVolume === 0 && !desertAudio.paused && desertAudio.volume === 0) {
        desertAudio.pause();
    }
}

// --- 3D Hitbox Math Helpers ---
function rotateAroundPivot(x, y, z, px, py, pz, rx, ry, rz) {
    let tx = x - px;
    let ty = y - py;
    let tz = z - pz;
    let r = rotate3D(tx, ty, tz, rx, ry, rz);
    return {
        x: r.x + px,
        y: r.y + py,
        z: r.z + pz
    };
}

function distPointToSegment(px, py, pz, p1x, p1y, p1z, p2x, p2y, p2z) {
    let dx = p2x - p1x, dy = p2y - p1y, dz = p2z - p1z;
    let len2 = dx*dx + dy*dy + dz*dz;
    let t = 0;
    if (len2 > 0) {
        t = ((px - p1x) * dx + (py - p1y) * dy + (pz - p1z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
    }
    let cx = p1x + t * dx;
    let cy = p1y + t * dy;
    let cz = p1z + t * dz;
    return Math.hypot(px - cx, py - cy, pz - cz);
}

function intersectSegmentTriangle(p1, p2, a, b, c) {
    const EPSILON = 0.0000001;
    let edge1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    let edge2 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    let dir = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    
    let h = {
        x: dir.y * edge2.z - dir.z * edge2.y,
        y: dir.z * edge2.x - dir.x * edge2.z,
        z: dir.x * edge2.y - dir.y * edge2.x
    };
    let a_dot = edge1.x * h.x + edge1.y * h.y + edge1.z * h.z;
    if (a_dot > -EPSILON && a_dot < EPSILON) return false;
    
    let f = 1.0 / a_dot;
    let s = { x: p1.x - a.x, y: p1.y - a.y, z: p1.z - a.z };
    let u = f * (s.x * h.x + s.y * h.y + s.z * h.z);
    if (u < 0.0 || u > 1.0) return false;
    
    let q = {
        x: s.y * edge1.z - s.z * edge1.y,
        y: s.z * edge1.x - s.x * edge1.z,
        z: s.x * edge1.y - s.y * edge1.x
    };
    let v = f * (dir.x * q.x + dir.y * q.y + dir.z * q.z);
    if (v < 0.0 || u + v > 1.0) return false;
    
    let t = f * (edge2.x * q.x + edge2.y * q.y + edge2.z * q.z);
    if (t >= 0.0 && t <= 1.0) {
        return t;
    }
    return false;
}

function intersectSegmentBox(p1, p2, verts) {
    const faces = [
        [2, 3, 7, 6],
        [0, 1, 5, 4],
        [3, 0, 4, 7],
        [1, 2, 6, 5],
        [4, 5, 6, 7],
        [3, 2, 1, 0]
    ];
    let minT = Infinity;
    for (let face of faces) {
        let t1 = intersectSegmentTriangle(p1, p2, verts[face[0]], verts[face[1]], verts[face[2]]);
        if (t1 !== false && t1 < minT) minT = t1;
        let t2 = intersectSegmentTriangle(p1, p2, verts[face[0]], verts[face[2]], verts[face[3]]);
        if (t2 !== false && t2 < minT) minT = t2;
    }
    return minT < Infinity ? minT : false;
}

function get3DZombieLimbBoxes(e) {
    let scale = e.size / 32.0;
    let animTime = e.animTime || 0;
    
    let legSwing = Math.sin(animTime) * 0.6;
    let rKneeBend = legSwing < 0 ? -legSwing * 0.8 : 0;
    let lKneeBend = legSwing > 0 ? legSwing * 0.8 : 0;

    let rArmPitch = 1.3 + Math.sin(animTime) * 0.1;
    let lArmPitch = 1.3 - Math.sin(animTime) * 0.1;
    let rElbowBend = 0.2 + Math.abs(Math.sin(animTime)) * 0.2;
    let lElbowBend = 0.2 + Math.abs(Math.cos(animTime)) * 0.2;

    let headPitch = 0.1 + Math.sin(animTime * 0.5) * 0.05;
    let headYaw = Math.cos(animTime * 0.3) * 0.1;

    let parts = [
        {
            name: 'torso',
            minX: -4, maxX: 4, minY: -2, maxY: 2, minZ: 12, maxZ: 24,
            active: true,
            transform: v => ({ x: v.x, y: v.y, z: v.z })
        },
        {
            name: 'head',
            minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: 24, maxZ: 32,
            active: e.hasHead !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 0, 0, 24, headPitch, 0, headYaw)
        },
        {
            name: 'leftUpperArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            active: e.hasLeftUpperArm !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -6, 0, 24, lArmPitch, 0, 0)
        },
        {
            name: 'leftLowerArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            active: e.hasLeftLowerArm !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -6, 0, 18, lElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -6, 0, 24, lArmPitch, 0, 0);
            }
        },
        {
            name: 'rightUpperArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            active: e.hasRightUpperArm !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 6, 0, 24, rArmPitch, 0, 0)
        },
        {
            name: 'rightLowerArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            active: e.hasRightLowerArm !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 6, 0, 18, rElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 6, 0, 24, rArmPitch, 0, 0);
            }
        },
        {
            name: 'leftUpperLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            active: e.hasLeftUpperLeg !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -2, 0, 12, -legSwing, 0, 0)
        },
        {
            name: 'leftLowerLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            active: e.hasLeftLowerLeg !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -2, 0, 6, -lKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -2, 0, 12, -legSwing, 0, 0);
            }
        },
        {
            name: 'rightUpperLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            active: e.hasRightUpperLeg !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 2, 0, 12, legSwing, 0, 0)
        },
        {
            name: 'rightLowerLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            active: e.hasRightLowerLeg !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 2, 0, 6, -rKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 2, 0, 12, legSwing, 0, 0);
            }
        }
    ];

    let rotAngle = e.angle - Math.PI / 2;
    let cosH = Math.cos(rotAngle);
    let sinH = Math.sin(rotAngle);

    let limbBoxes = [];

    for (let part of parts) {
        if (!part.active) continue;

        let localVerts = [
            { x: part.minX, y: part.minY, z: part.minZ },
            { x: part.maxX, y: part.minY, z: part.minZ },
            { x: part.maxX, y: part.maxY, z: part.minZ },
            { x: part.minX, y: part.maxY, z: part.minZ },
            { x: part.minX, y: part.minY, z: part.maxZ },
            { x: part.maxX, y: part.minY, z: part.maxZ },
            { x: part.maxX, y: part.maxY, z: part.maxZ },
            { x: part.minX, y: part.maxY, z: part.maxZ }
        ];

        let worldVerts = [];
        for (let lv of localVerts) {
            let pt = part.transform(lv);
            let sx = pt.x * scale;
            let sy = pt.y * scale;
            let sz = pt.z * scale;

            let rx, ry, rz;
            if (e.isCrawling) {
                rx = sx;
                ry = sz - 12 * scale;
                rz = -sy + 2 * scale;
            } else {
                rx = sx;
                ry = sy;
                rz = sz;
            }

            let wx = rx * cosH - ry * sinH;
            let wy = rx * sinH + ry * cosH;
            let wz = rz;

            worldVerts.push({
                x: e.x + wx,
                y: e.y + wy,
                z: e.z + wz
            });
        }

        limbBoxes.push({
            name: part.name,
            verts: worldVerts
        });
    }
    return limbBoxes;
}

// --- Update Physics & Logic ---
function update() {
    if (isPaused || isLoading) return;

    if (player.pistolReloadTimer > 0) {
        player.pistolReloadTimer--;
        if (player.pistolReloadTimer === 0) {
            let activeItem = inventory[hotbarSelection];
            if (activeItem && activeItem.id === 'pistol') {
                if (typeof ensurePistolAmmo === 'function') ensurePistolAmmo(activeItem);
                let needed = 10 - activeItem.bullets;
                let toAdd = Math.min(needed, activeItem.reserve);
                activeItem.bullets += toAdd;
                activeItem.reserve -= toAdd;
            }
        }
        if (typeof updateBulletCounterUI === 'function') updateBulletCounterUI();
    }

    gameTime += (24 / 54000) * timeSpeed; if (gameTime >= 24) gameTime %= 24; 
    if (isDebugOpen && tickCounter % 10 === 0) { dbgTimeEl.value = gameTime; dbgTimeValEl.innerText = gameTime.toFixed(1); }
    if (timeValEl) {
        let hours = Math.floor(gameTime);
        let minutes = Math.floor((gameTime - hours) * 60);
        timeValEl.innerText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    if (!godMode) { tickCounter++; if (tickCounter % 120 === 0) { if (player.food > 0) { player.food -= 1; foodEl.innerText = player.food; } else takeDamage(1); } } 
    else { hpEl.innerText = player.hp; foodEl.innerText = player.food; tickCounter++; }

    // Dynamic interpolation matching FOV slider logic
    currentZoom += ((isZooming ? baseZoom * 2.25 : baseZoom) - currentZoom) * 0.15;
    
    let tickTime = tickCounter * 0.05;
    for (let c of torches) {
        let wave1 = Math.sin(tickTime * 1.7 + c.x) * 0.03;
        let wave2 = Math.sin(tickTime * 2.3 + c.y) * 0.03;
        let wave3 = Math.sin(tickTime * 5.1 - c.x) * 0.02;
        c.flicker = 0.85 + wave1 + wave2 + wave3 + (Math.random() > 0.95 ? (Math.random() * 0.08) : 0);
    }

    player.inWater = gameState === 'overworld' && (getVoxel(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z)) === 2);
    player.isSubmerged = gameState === 'overworld' && (getVoxel(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z + player.baseHeight)) === 2);

    if (player.isSubmerged) {
        if (!godMode) player.oxygen = Math.max(0, player.oxygen - 0.15);
        if (player.oxygen <= 0 && tickCounter % 60 === 0) takeDamage(10);
    } else {
        player.oxygen = Math.min(100, player.oxygen + 1.0);
    }
    oxygenEl.innerText = Math.floor(player.oxygen);

    let isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
    let isSprinting = isMoving && (keys['ShiftLeft'] || keys['ShiftRight']) && !flightMode && player.stamina > 0;
    
    if (isSprinting && !player.inVehicle) { 
        if (!infiniteStamina && !godMode) player.stamina = Math.max(0, player.stamina - 0.5); 
    } else { 
        if (player.stamina < 100) player.stamina = Math.min(100, player.stamina + 0.3); 
    }
    staminaEl.innerText = Math.floor(player.stamina);
    
    if (isMoving && !player.inVehicle) {
        let speed = isSprinting ? 0.23 : 0.15;
        player.animTime = (player.animTime || 0) + speed;
    } else {
        if (player.animTime) {
            player.animTime %= Math.PI * 2;
            if (player.animTime > 0.15) player.animTime -= 0.15;
            else if (player.animTime < -0.15) player.animTime += 0.15;
            else player.animTime = 0;
        }
    }

    if (coordsEl) {
        if (freecam) {
            coordsEl.innerText = `Freecam: ${Math.floor(freecamX)}, ${Math.floor(freecamY)}, ${Math.floor(freecamZ)}`;
        } else {
            coordsEl.innerText = `${Math.floor(player.x)}, ${Math.floor(player.y)}, ${Math.floor(player.z)}`;
        }
    }
    
    let curSpeedMult = speedMult * (isSprinting ? sprintMult : 1.0) * (player.inWater ? 0.5 : 1.0);
    let mv = 0, st = 0;
    if (keys['KeyW']) mv += player.speed * curSpeedMult; if (keys['KeyS']) mv -= player.speed * curSpeedMult;
    if (keys['KeyA']) st -= player.speed * curSpeedMult; if (keys['KeyD']) st += player.speed * curSpeedMult;
    
    player.zOffset = player.zOffset || 0;

    // Movement & Vehicle Physics Handling
    if (freecam) {
        let curSpeed = player.speed * 1.5;
        if (keys['ShiftLeft'] || keys['ShiftRight']) {
            curSpeed *= 3.0;
        }
        
        let pitchAngle = Math.atan2(freecamPitch, canvas.width * baseZoom);
        let fwdX = Math.cos(freecamAngle) * Math.cos(pitchAngle);
        let fwdY = Math.sin(freecamAngle) * Math.cos(pitchAngle);
        let fwdZ = Math.sin(pitchAngle);
        
        if (keys['KeyW']) {
            freecamX += fwdX * curSpeed;
            freecamY += fwdY * curSpeed;
            freecamZ += fwdZ * curSpeed;
        }
        if (keys['KeyS']) {
            freecamX -= fwdX * curSpeed;
            freecamY -= fwdY * curSpeed;
            freecamZ -= fwdZ * curSpeed;
        }
        
        let leftAngle = freecamAngle - Math.PI / 2;
        if (keys['KeyA']) {
            freecamX += Math.cos(leftAngle) * curSpeed;
            freecamY += Math.sin(leftAngle) * curSpeed;
        }
        if (keys['KeyD']) {
            freecamX += Math.cos(freecamAngle + Math.PI / 2) * curSpeed;
            freecamY += Math.sin(freecamAngle + Math.PI / 2) * curSpeed;
        }
        
        if (keys['Space']) {
            freecamZ += curSpeed;
        }
        if (keys['KeyC']) {
            freecamZ -= curSpeed;
        }
        
        player.vz = 0;
    } else {
    if (player.inVehicle) {
        let v = player.inVehicle;
        v.vz = v.vz || 0; v.vPitch = v.vPitch || 0; v.vRoll = v.vRoll || 0;
        v.camX = v.camX || v.x; v.camY = v.camY || v.y; v.camZ = v.camZ || v.z;

        let gas = keys['KeyW'] ? 1 : (keys['KeyS'] ? -1 : 0);
        let steerInput = keys['KeyA'] ? -1 : (keys['KeyD'] ? 1 : 0);
        let power = 0.010; 
        
        let cx = Math.cos(v.angle), sx = Math.sin(v.angle);
        let wL = 2.2, wW = 1.0; 
        let zFL = getSafeFloorZ(v.x + cx*wL - sx*wW, v.y + sx*wL + cx*wW, v.z + 4);
        let zFR = getSafeFloorZ(v.x + cx*wL + sx*wW, v.y + sx*wL - cx*wW, v.z + 4);
        let zBL = getSafeFloorZ(v.x - cx*wL - sx*wW, v.y - sx*wL + cx*wW, v.z + 4);
        let zBR = getSafeFloorZ(v.x - cx*wL + sx*wW, v.y - sx*wL - cx*wW, v.z + 4);

        let targetZ = ((zFL+zFR+zBL+zBR)/4) + 0.6;
        v.isGrounded = (v.z <= targetZ + 0.6); 
        
        let slipping = false;
        
        if (v.isGrounded) {
            let slopeForce = Math.sin(v.pitch) * 0.008; 

            if (gas > 0 && v.pitch > 0.25 && v.speed < 0.2) {
                slipping = true;
                power *= 0.3; 
            }

            if (!getSolid(Math.floor(v.x + Math.cos(v.angle)*3), Math.floor(v.y + Math.sin(v.angle)*3), Math.floor(v.z + 1))) {
                v.speed += gas * power;
            }
            
            v.speed -= slopeForce; 
            v.speed *= 0.985; 
            
            if (gas === 0) {
                v.speed *= 0.985; 
                if (Math.abs(v.speed) < 0.01 && Math.abs(slopeForce) < 0.015) v.speed = 0; 
            }
            
            let turnRate = steerInput * Math.max(0.005, Math.min(Math.abs(v.speed)*0.25, 0.04)); 
            let actualTurn = (v.speed >= 0 ? turnRate : -turnRate);
            v.angle += actualTurn;
            v.speed *= (1.0 - Math.abs(actualTurn) * 0.5);
            
            player.angle += actualTurn; 
            
            let compression = targetZ - v.z;
            v.vz += compression * 0.15; 
            v.vz *= 0.80; 
            
            let targetPitch = Math.atan2((zFL+zFR)/2 - (zBL+zBR)/2, wL * 2);
            let targetRoll = Math.atan2((zFL+zBL)/2 - (zFR+zBR)/2, wW * 2); 
            
            v.vPitch += (targetPitch - v.pitch) * 0.15; v.vPitch *= 0.82; 
            v.vRoll += (targetRoll - v.roll) * 0.15; v.vRoll *= 0.82; 
        } else {
            v.speed *= 0.99; 
            let actualTurn = (v.speed >= 0 ? steerInput * 0.005 : -steerInput * 0.005);
            v.angle += actualTurn;
            player.angle += actualTurn;
            
            v.vz -= 0.02; 
            v.vz *= 0.98; 
            
            v.vPitch -= v.pitch * 0.01; v.vPitch *= 0.95; 
            v.vRoll -= v.roll * 0.05; v.vRoll *= 0.95; 
        }
        
        v.z += v.vz;
        v.pitch += v.vPitch;
        v.roll += v.vRoll;

        let nx = v.x + Math.cos(v.angle) * v.speed;
        let ny = v.y + Math.sin(v.angle) * v.speed;
        if (getSolid(Math.floor(nx + Math.cos(v.angle)*2.5), Math.floor(ny + Math.sin(v.angle)*2.5), Math.floor(v.z + 1.5))) {
            v.speed *= -0.4; 
        } else {
            v.x = nx;
            v.y = ny;
        }
        
        if (v.isGrounded) {
            if (slipping && tickCounter % 2 === 0) {
                spawnDirt(v.x - cx*wL - sx*wW, v.y - sx*wL + cx*wW, zBL, -cx * 0.1, -sx * 0.1, true);
                spawnDirt(v.x - cx*wL + sx*wW, v.y - sx*wL - cx*wW, zBR, -cx * 0.1, -sx * 0.1, true);
            } else if (Math.abs(v.speed) > 0.05 && tickCounter % 3 === 0) {
                spawnDirt(v.x - cx*wL - sx*wW, v.y - sx*wL + cx*wW, zBL, -cx * v.speed * 0.5, -sx * v.speed * 0.5, false);
                spawnDirt(v.x - cx*wL + sx*wW, v.y - sx*wL - cx*wW, zBR, -cx * v.speed * 0.5, -sx * v.speed * 0.5, false);
            }
        }

        v.camX += (v.x - v.camX) * 0.15; 
        v.camY += (v.y - v.camY) * 0.15;
        v.camZ += (v.z - v.camZ) * 0.15;

        if (player.vehicleView === '3rd_back' || player.vehicleView === '3rd_front') {
            let dirSign = player.vehicleView === '3rd_front' ? 1.0 : -1.0;
            player.x = v.camX + Math.cos(player.angle) * dirSign * 9.5; 
            player.y = v.camY + Math.sin(player.angle) * dirSign * 9.5;
            player.z = v.camZ + 1.0; 
            
            let pitchTarget = v.pitch * 300; 
            player.pitch += (pitchTarget - player.pitch) * 0.1;
        } else {
            player.x = v.x + Math.cos(v.angle) * 0.30 + Math.sin(v.angle) * 0.32; 
            player.y = v.y + Math.sin(v.angle) * 0.30 - Math.cos(v.angle) * 0.32;
            player.z = v.z + 0.45; 
        }
        player.vz = 0;

    } else {
        if (gameState === 'overworld') {
            let nx = player.x + Math.cos(player.angle) * mv + Math.cos(player.angle + 1.57) * st;
            let ny = player.y + Math.sin(player.angle) * mv + Math.sin(player.angle + 1.57) * st;
            
            let stepH = 1.1; 
            let steppedZ = 0;

            if (!checkCollision(nx, player.y, player.z)) {
                player.x = nx;
            } else {
                for (let s = 0.2; s <= stepH; s += 0.2) {
                    if (!checkCollision(nx, player.y, player.z + s)) {
                        player.x = nx; player.z += s; steppedZ += s; break;
                    }
                }
            }

            if (!checkCollision(player.x, ny, player.z)) {
                player.y = ny;
            } else {
                for (let s = 0.2; s <= stepH; s += 0.2) {
                    if (!checkCollision(player.x, ny, player.z + s)) {
                        player.y = ny; player.z += s; steppedZ += s; break;
                    }
                }
            }

            if (steppedZ > 0) player.zOffset -= steppedZ;

            if (flightMode) { 
                player.vz = 0; 
                if (keys['Space']) player.z += player.speed * speedMult * 1.5; 
                if (keys['ShiftLeft'] || keys['ControlLeft']) player.z -= player.speed * speedMult * 1.5; 
            } else {
                if (player.inWater) {
                    player.vz -= 0.002; 
                    if (keys['Space']) {
                        if (getVoxel(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z + 1.0)) !== 2) {
                            player.vz = jumpPower * 0.7; 
                            keys['Space'] = false;
                        } else {
                            player.vz += 0.008; 
                        }
                    }
                    player.vz *= 0.9; 
                    
                    if (!checkCollision(player.x, player.y, player.z + player.vz)) {
                        player.z += player.vz;
                    } else {
                        player.vz = 0; 
                    }
                } else {
                    if (!checkCollision(player.x, player.y, player.z - 0.05)) {
                        player.vz -= 0.015; 
                    } else {
                        if (player.vz < 0) { player.vz = 0; player.z = Math.ceil(player.z - 0.05) + 0.01; } 
                        if (keys['Space']) { player.vz = jumpPower; keys['Space'] = false; }
                    }
                    player.z += player.vz;
                    if (player.vz > 0 && checkCollision(player.x, player.y, player.z)) {
                        player.z -= player.vz; 
                        player.vz = 0;
                    }
                }
            }
        } else if (gameState === 'interior') {
            let nx = player.x + Math.cos(player.angle) * mv + Math.cos(player.angle + 1.57) * st;
            let ny = player.y + Math.sin(player.angle) * mv + Math.sin(player.angle + 1.57) * st;
            if (!isSolid(nx, player.y)) player.x = nx;
            if (!isSolid(player.x, ny)) player.y = ny;
        }

        // Footstep sounds trigger logic
        if (isMoving && !flightMode && !player.inWater && !player.isSubmerged) {
            let grounded = false;
            if (gameState === 'interior') {
                grounded = true;
            } else {
                grounded = checkCollision(player.x, player.y, player.z - 0.05);
            }
            if (grounded) {
                let prevAnimTime = player.lastAnimTime || 0;
                let currentAnimTime = player.animTime || 0;
                let prevStepVal = Math.floor((prevAnimTime - Math.PI / 2) / Math.PI);
                let currStepVal = Math.floor((currentAnimTime - Math.PI / 2) / Math.PI);
                if (prevStepVal !== currStepVal) {
                    let stepType = Math.abs(currStepVal) % 2; // alternates: 0 for left (step1), 1 for right (step2)
                    playStepSound(stepType);
                }
            }
        }
        player.lastAnimTime = player.animTime;
    }
    }

    for (let v of vehicles) {
        if (v !== player.inVehicle) {
            v.vz = v.vz || 0; v.vPitch = v.vPitch || 0; v.vRoll = v.vRoll || 0;
            
            let cx = Math.cos(v.angle), sx = Math.sin(v.angle);
            let wL = 2.2, wW = 1.0; 
            let zFL = getSafeFloorZ(v.x + cx*wL - sx*wW, v.y + sx*wL + cx*wW, v.z + 4);
            let zFR = getSafeFloorZ(v.x + cx*wL + sx*wW, v.y + sx*wL - cx*wW, v.z + 4);
            let zBL = getSafeFloorZ(v.x - cx*wL - sx*wW, v.y - sx*wL + cx*wW, v.z + 4);
            let zBR = getSafeFloorZ(v.x - cx*wL + sx*wW, v.y - sx*wL - cx*wW, v.z + 4);
            
            let targetZ = ((zFL+zFR+zBL+zBR)/4) + 0.6;
            
            if (v.z <= targetZ + 0.6) {
                let slopeForce = Math.sin(v.pitch) * 0.008;
                v.speed -= slopeForce;
                v.speed *= 0.985;
                if (Math.abs(v.speed) < 0.02 && Math.abs(slopeForce) < 0.015) v.speed = 0; 
                
                v.x += Math.cos(v.angle) * v.speed;
                v.y += Math.sin(v.angle) * v.speed;
                
                v.vz += (targetZ - v.z) * 0.15; v.vz *= 0.80; 
                
                let targetPitch = Math.atan2((zFL+zFR)/2 - (zBL+zBR)/2, wL * 2);
                let targetRoll = Math.atan2((zFL+zBL)/2 - (zFR+zBR)/2, wW * 2);
                
                v.vPitch += (targetPitch - v.pitch) * 0.15; v.vPitch *= 0.82; 
                v.vRoll += (targetRoll - v.roll) * 0.15; v.vRoll *= 0.82; 
            } else {
                v.x += Math.cos(v.angle) * v.speed;
                v.y += Math.sin(v.angle) * v.speed;
                v.vz -= 0.02; v.vz *= 0.98;
                v.vPitch -= v.pitch * 0.01; v.vPitch *= 0.95; 
                v.vRoll -= v.roll * 0.05; v.vRoll *= 0.95; 
            }
            
            v.z += v.vz;
            v.pitch += v.vPitch;
            v.roll += v.vRoll;
        }
    }

    player.zOffset *= 0.7;
    if (Math.abs(player.zOffset) < 0.01) player.zOffset = 0;

    for(let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].z += 0.02; damageTexts[i].life--; if(damageTexts[i].life <= 0) damageTexts.splice(i, 1); }
    if (player.muzzleFlashTick > 0) player.muzzleFlashTick--;
    if (player.pistolSmokeTimer > 0) player.pistolSmokeTimer--;
    for(let i = bloodParticles.length - 1; i >= 0; i--) { 
        let b = bloodParticles[i];
        if (b.isSmoke) {
            b.x += b.vx; b.y += b.vy; b.z += b.vz;
            b.vx *= 0.90; b.vy *= 0.90; b.vz *= 0.94;
            b.vz += 0.0012; 
            let lifeRatio = b.life / b.maxLife;
            b.size = b.startSize * lifeRatio;
            if (gameState === 'overworld' && getSolid(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))) {
                b.life = 0;
            }
        } else if (!b.onGround) {
            b.x += b.vx; b.y += b.vy; b.z += b.vz; b.vz -= 0.02; 
            if (gameState === 'overworld' && getSolid(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))) { 
                b.z = Math.floor(b.z) + 1.02; 
                b.vx = 0; b.vy = 0; b.vz = 0; 
                b.onGround = true;
                if (!b.isLimb) {
                    b.isPooling = true;
                    b.targetPoolSize = b.size * (3.0 + Math.random() * 2.0);
                    b.life = Math.max(b.life, 300 + Math.floor(Math.random() * 150));
                }
            } 
        }
        
        if (b.isPooling) {
            b.size += (b.targetPoolSize - b.size) * 0.05;
        }
        
        if (b.isLimb) {
            let zBlood = getBloodColor('zombie') || {r: 92, g: 64, b: 51};
            if (b.onGround) {
                // If it is on the ground, spray blood out the side of it occasionally!
                let limit = (b.maxLife || 3000) * 0.4;
                if (b.life > limit) {
                    let progress = (b.life - limit) / ((b.maxLife || 3000) - limit); // 1.0 down to 0.0
                    if (Math.random() < progress * 0.25) {
                        let angle = b.sprayAngle + (Math.random() - 0.5) * 0.8; // wider, more chaotic angle
                        let speed = Math.random() * 0.12 + 0.05; // faster horizontal spread
                        let vz = Math.random() * 0.10 + 0.06; // higher vertical fountaining
                        bloodParticles.push({
                            x: b.x, y: b.y, z: b.z + 0.05,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            vz: vz,
                            color: zBlood,
                            life: 50 + Math.random() * 25,
                            size: (Math.random() * 0.07 + 0.04) * 0.25
                        });
                    }
                }
            } else {
                // While flying in the air, leave blood trail
                if (b.life > 10 && Math.random() < 0.45) {
                    spawnBlood(b.x, b.y, b.z, zBlood, 2);
                }
            }
        }
        
        b.life--; if (b.life <= 0) bloodParticles.splice(i, 1); 
    }

    // Update Dropped Items physics
    for (let i = droppedItems.length - 1; i >= 0; i--) {
        let item = droppedItems[i];
        
        // Gravity
        item.vz -= 0.012;
        
        let nx = item.x + item.vx;
        let ny = item.y + item.vy;
        let nz = item.z + item.vz;
        
        if (gameState === 'overworld') {
            if (!getSolid(Math.floor(nx), Math.floor(item.y), Math.floor(item.z))) {
                item.x = nx;
            } else {
                item.vx = -item.vx * 0.4;
            }
            if (!getSolid(Math.floor(item.x), Math.floor(ny), Math.floor(item.z))) {
                item.y = ny;
            } else {
                item.vy = -item.vy * 0.4;
            }
        } else {
            if (!isSolid(nx, item.y)) {
                item.x = nx;
            } else {
                item.vx = -item.vx * 0.4;
            }
            if (!isSolid(item.x, ny)) {
                item.y = ny;
            } else {
                item.vy = -item.vy * 0.4;
            }
        }
        
        // Floor level check
        let floorZ = (gameState === 'overworld') ? getSafeFloorZ(item.x, item.y, item.z) : 0.0;
        if (nz <= floorZ) {
            item.z = floorZ;
            item.vz = 0;
            // Apply ground friction
            item.vx *= 0.85;
            item.vy *= 0.85;
            if (Math.abs(item.vx) < 0.005) item.vx = 0;
            if (Math.abs(item.vy) < 0.005) item.vy = 0;
        } else {
            item.z = nz;
        }
        
        item.hoverTime++;
        if (item.cooldown > 0) item.cooldown--;
    }

    if (gameState === 'overworld') {
        let pxC = Math.floor(player.x / CHUNK_SIZE), pyC = Math.floor(player.y / CHUNK_SIZE);
        let physRad = 4;
        for(let x = pxC - physRad; x <= pxC + physRad; x++) for(let y = pyC - physRad; y <= pyC + physRad; y++) getMapChunk(x, y);

        let isNight = gameTime < 6 || gameTime >= 18, spawnChance = isNight ? 0.002 : 0.0002;
        if (spawnEnemiesToggle && enemies.length < 20 && Math.random() < spawnChance) { 
            let angle = Math.random() * Math.PI * 2, dist = 20 + Math.random() * 10, ex = player.x + Math.cos(angle) * dist, ey = player.y + Math.sin(angle) * dist;
            let ez = getSafeFloorZ(ex, ey, player.z) + 1;
            if (!getSolid(Math.floor(ex), Math.floor(ey), Math.floor(ez)) && getVoxel(Math.floor(ex), Math.floor(ey), Math.floor(ez - 1)) !== 2) { 
                let biome = getBiome(ex, ey), alienChance = biome >= 0.65 ? 0.05 : 0.01;
                if (Math.random() < alienChance) { enemies.push({ type: 'experimental', x: ex, y: ey, z: ez, hp: 10, cooldown: 60, size: 1.4, flash: 0 }); } 
                else { let clusterSize = biome < 0.35 ? Math.floor(Math.random() * 3) + 3 : (biome < 0.65 ? Math.floor(Math.random() * 3) + 1 : 1); for (let k = 0; k < clusterSize; k++) { let zx = ex + (Math.random() - 0.5) * 4, zy = ey + (Math.random() - 0.5) * 4; let zez = getSafeFloorZ(zx,zy,player.z)+1; if (!getSolid(Math.floor(zx), Math.floor(zy), Math.floor(zez)) && getVoxel(Math.floor(zx), Math.floor(zy), Math.floor(zez - 1)) !== 2 && enemies.length < 20) enemies.push({ type: 'zombie3d', x: zx, y: zy, z: zez, hp: 15, cooldown: 60 + Math.random()*30, size: 1.8, flash: 0 }); } }
            }
        }

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            let e = enemies[ei], d = Math.hypot(player.x-e.x, player.y-e.y); 
            if (e.flash && e.flash > 0) e.flash--; if (d > VIEW_DIST * 1.5) { enemies.splice(ei, 1); continue; }

            // Initialize zombie limbs dynamically if undefined
            if ((e.type === 'zombie' || e.type === 'zombie3d') && e.hasHead === undefined) {
                e.hasHead = true;
                e.hasLeftUpperArm = true;
                e.hasLeftLowerArm = true;
                e.hasRightUpperArm = true;
                e.hasRightLowerArm = true;
                e.hasLeftUpperLeg = true;
                e.hasLeftLowerLeg = true;
                e.hasRightUpperLeg = true;
                e.hasRightLowerLeg = true;
                e.limbsHP = {
                    head: 4,
                    leftUpperArm: 3,
                    leftLowerArm: 2,
                    rightUpperArm: 3,
                    rightLowerArm: 2,
                    leftUpperLeg: 3,
                    leftLowerLeg: 2,
                    rightUpperLeg: 3,
                    rightLowerLeg: 2
                };
                e.isCrawling = false;
                e.angle = Math.atan2(player.y - e.y, player.x - e.x);
                e.animTime = Math.random() * 100;
            }

            // Handle decapitation bleed-out timer
            if ((e.type === 'zombie' || e.type === 'zombie3d') && e.bleedOutTimer !== undefined) {
                e.bleedOutTimer--;
                if (e.bleedOutTimer <= 0) {
                    e.hp = 0;
                    spawnBlood(e.x, e.y, e.z + e.size * 0.5, getBloodColor(e.type) || {r: 92, g: 64, b: 51}, 30);
                    let is3D = e.type === 'zombie3d';
                    if (e.hasHead) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.88, 'head', is3D, e.size);
                    if (e.hasLeftUpperArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.72, 'leftUpperArm', is3D, e.size);
                    if (e.hasLeftLowerArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.5, 'leftLowerArm', is3D, e.size);
                    if (e.hasRightUpperArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.72, 'rightUpperArm', is3D, e.size);
                    if (e.hasRightLowerArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.5, 'rightLowerArm', is3D, e.size);
                    if (e.hasLeftUpperLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.3, 'leftUpperLeg', is3D, e.size);
                    if (e.hasLeftLowerLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.1, 'leftLowerLeg', is3D, e.size);
                    if (e.hasRightUpperLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.3, 'rightUpperLeg', is3D, e.size);
                    if (e.hasRightLowerLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.1, 'rightLowerLeg', is3D, e.size);
                    enemies.splice(ei, 1);
                    score += 150;
                    scoreEl.innerText = score;
                    continue;
                }
            }

            // Handle stump sprays (if alive and has missing limbs)
            if ((e.type === 'zombie' || e.type === 'zombie3d') && e.hasHead !== undefined && e.hp > 0) {
                let zBlood = getBloodColor('zombie') || {r: 92, g: 64, b: 51};
                // Neck spray
                if (!e.hasHead) {
                    let isBleedingOut = e.bleedOutTimer !== undefined;
                    let shouldSpawn = isBleedingOut || (tickCounter % 2 === 0);
                    if (shouldSpawn) {
                        let count = isBleedingOut ? 3 : 1;
                        for (let bIdx = 0; bIdx < count; bIdx++) {
                            let speed = Math.random() * 0.03 + 0.01;
                            let vz = Math.random() * 0.12 + 0.18;
                            let angle = Math.random() * Math.PI * 2;
                            bloodParticles.push({
                                x: e.x + (Math.random() - 0.5) * 0.1,
                                y: e.y + (Math.random() - 0.5) * 0.1,
                                z: e.z + (e.isCrawling ? e.size * 0.44 : e.size * 0.88),
                                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: vz,
                                color: zBlood, life: 40 + Math.random() * 20, size: (Math.random() * 0.08 + 0.04) * 0.25
                            });
                        }
                    }
                }
                
                // Left Arm sprays
                if (!e.hasLeftUpperArm) {
                    // Spray from shoulder
                    if (tickCounter % 3 === 0) {
                        let jx = e.x + Math.sin(player.angle) * 0.15;
                        let jy = e.y - Math.cos(player.angle) * 0.15;
                        let jz = e.z + (e.isCrawling ? e.size * 0.18 : e.size * 0.72);
                        let sprayAngle = player.angle - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                        let speed = Math.random() * 0.03 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.03 + 0.01,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                } else if (!e.hasLeftLowerArm) {
                    // Spray from elbow
                    if (tickCounter % 3 === 0) {
                        let jx = e.x + Math.sin(player.angle) * 0.15;
                        let jy = e.y - Math.cos(player.angle) * 0.15;
                        let jz = e.z + (e.isCrawling ? e.size * 0.05 : e.size * 0.5);
                        let sprayAngle = player.angle - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                        let speed = Math.random() * 0.03 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.03 + 0.01,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                }
                
                // Right Arm sprays
                if (!e.hasRightUpperArm) {
                    // Spray from shoulder
                    if (tickCounter % 3 === 0) {
                        let jx = e.x - Math.sin(player.angle) * 0.15;
                        let jy = e.y + Math.cos(player.angle) * 0.15;
                        let jz = e.z + (e.isCrawling ? e.size * 0.18 : e.size * 0.72);
                        let sprayAngle = player.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                        let speed = Math.random() * 0.03 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.03 + 0.01,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                } else if (!e.hasRightLowerArm) {
                    // Spray from elbow
                    if (tickCounter % 3 === 0) {
                        let jx = e.x - Math.sin(player.angle) * 0.15;
                        let jy = e.y + Math.cos(player.angle) * 0.15;
                        let jz = e.z + (e.isCrawling ? e.size * 0.05 : e.size * 0.5);
                        let sprayAngle = player.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                        let speed = Math.random() * 0.03 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.03 + 0.01,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                }
                
                // Left Leg sprays
                if (!e.hasLeftUpperLeg) {
                    if (tickCounter % 4 === 0) {
                        let jx = e.x + Math.sin(player.angle) * 0.08;
                        let jy = e.y - Math.cos(player.angle) * 0.08;
                        let jz = e.z + (e.isCrawling ? e.size * 0.05 : e.size * 0.44);
                        let sprayAngle = player.angle + Math.PI + (Math.random() - 0.5) * 1.0;
                        let speed = Math.random() * 0.02 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.02,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                } else if (!e.hasLeftLowerLeg) {
                    if (tickCounter % 4 === 0) {
                        let jx = e.x + Math.sin(player.angle) * 0.08;
                        let jy = e.y - Math.cos(player.angle) * 0.08;
                        let jz = e.z + (e.isCrawling ? e.size * 0.05 : e.size * 0.2);
                        let sprayAngle = player.angle + Math.PI + (Math.random() - 0.5) * 1.0;
                        let speed = Math.random() * 0.02 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.02,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                }
                
                // Right Leg sprays
                if (!e.hasRightUpperLeg) {
                    if (tickCounter % 4 === 0) {
                        let jx = e.x - Math.sin(player.angle) * 0.08;
                        let jy = e.y + Math.cos(player.angle) * 0.08;
                        let jz = e.z + (e.isCrawling ? e.size * 0.05 : e.size * 0.44);
                        let sprayAngle = player.angle + Math.PI + (Math.random() - 0.5) * 1.0;
                        let speed = Math.random() * 0.02 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.02,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                } else if (!e.hasRightLowerLeg) {
                    if (tickCounter % 4 === 0) {
                        let jx = e.x - Math.sin(player.angle) * 0.08;
                        let jy = e.y + Math.cos(player.angle) * 0.08;
                        let jz = e.z + (e.isCrawling ? e.size * 0.05 : e.size * 0.2);
                        let sprayAngle = player.angle + Math.PI + (Math.random() - 0.5) * 1.0;
                        let speed = Math.random() * 0.02 + 0.01;
                        bloodParticles.push({
                            x: jx, y: jy, z: jz,
                            vx: Math.cos(sprayAngle) * speed, vy: Math.sin(sprayAngle) * speed, vz: Math.random() * 0.02,
                            color: zBlood, life: 15 + Math.random() * 10, size: (Math.random() * 0.04 + 0.02) * 0.25
                        });
                    }
                }
            }

            if (d < 40) { 
                if (d > 0.8) { 
                    let moveSpeed = ((e.type === 'zombie' || e.type === 'zombie3d') && e.isCrawling) ? 0.006 : 0.02;
                    let nx, ny;
                    if (e.bleedOutTimer !== undefined) {
                        nx = e.x + Math.cos(e.angle) * moveSpeed;
                        ny = e.y + Math.sin(e.angle) * moveSpeed;
                    } else {
                        nx = e.x + (player.x-e.x)/d * moveSpeed;
                        ny = e.y + (player.y-e.y)/d * moveSpeed;
                    }
                    let prevX = e.x, prevY = e.y;
                    if (!getSolid(Math.floor(nx), Math.floor(e.y), Math.floor(e.z))) e.x = nx;
                    else if (!getSolid(Math.floor(nx), Math.floor(e.y), Math.floor(e.z + 1.1))) { e.x = nx; e.z += 1.1; }

                    if (!getSolid(Math.floor(e.x), Math.floor(ny), Math.floor(e.z))) e.y = ny;
                    else if (!getSolid(Math.floor(e.x), Math.floor(ny), Math.floor(e.z + 1.1))) { e.y = ny; e.z += 1.1; }
                    
                    if (e.bleedOutTimer === undefined && (e.type === 'zombie3d' || e.type === 'zombie')) {
                        e.angle = Math.atan2(player.y - e.y, player.x - e.x);
                    }
                    
                    // Trigger footsteps for all moving enemies
                    let actualDist = Math.hypot(e.x - prevX, e.y - prevY);
                    if (actualDist > 0.001) {
                        let stepSpeed = moveSpeed * 8.0;
                        e.animTime = (e.animTime || 0) + stepSpeed;
                        
                        let prevStepVal = Math.floor(((e.lastAnimTime || 0) - Math.PI / 2) / Math.PI);
                        let currStepVal = Math.floor(((e.animTime || 0) - Math.PI / 2) / Math.PI);
                        if (prevStepVal !== currStepVal) {
                            let stepType = Math.abs(currStepVal) % 2;
                            playMobStepSound(e.x, e.y, e.z, stepType);
                        }
                        e.lastAnimTime = e.animTime;
                    }
                } else {
                    if (e.type === 'zombie3d' || e.type === 'zombie') {
                        e.animTime = (e.animTime || 0) + 0.02;
                    }
                }
                if (!getSolid(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z - 0.1))) e.z -= 0.1;
                else if (getSolid(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))) e.z += 0.5; 
                
                if (e.type === 'zombie' || e.type === 'zombie3d') {
                    let attackCooldown = 60;
                    if (!e.hasLeftUpperArm && !e.hasRightUpperArm) attackCooldown = 100;
                    if (e.bleedOutTimer === undefined) {
                        if (d < 1.5) { if (--e.cooldown <= 0) { takeDamage(5); e.cooldown = attackCooldown; } } else e.cooldown = Math.max(0, e.cooldown - 1);
                    }
                } else {
                    if (--e.cooldown <= 0) { let projZ = (e.type === 'experimental' ? e.z + e.size * 0.8 : e.z + 0.6); projectiles.push({ owner:'enemy', x:e.x, y:e.y, z:projZ, vx:(player.x-e.x)/d*0.6, vy:(player.y-e.y)/d*0.6, vz:(player.z-0.6-projZ)/d*0.6, life:100, dmg:10 }); e.cooldown = 120; } 
                }
            }
        }

        for (let i = animals.length - 1; i >= 0; i--) {
            let a = animals[i]; if (Math.hypot(player.x - a.x, player.y - a.y) > VIEW_DIST * 2.0) { animals.splice(i, 1); continue; }
            if (!a.dead) { 
                a.moveTimer--; if (a.moveTimer <= 0) { a.moveAngle = Math.random() * Math.PI * 2; a.moveTimer = 50 + Math.random() * 100; } 
                let anx = a.x + Math.cos(a.moveAngle) * a.speed, any = a.y + Math.sin(a.moveAngle) * a.speed; 

                let prevX = a.x, prevY = a.y;
                if (!getSolid(Math.floor(anx), Math.floor(a.y), Math.floor(a.z))) a.x = anx; 
                else if (!getSolid(Math.floor(anx), Math.floor(a.y), Math.floor(a.z + 1.1))) { a.x = anx; a.z += 1.1; }

                if (!getSolid(Math.floor(a.x), Math.floor(any), Math.floor(a.z))) a.y = any; 
                else if (!getSolid(Math.floor(a.x), Math.floor(any), Math.floor(a.z + 1.1))) { a.y = any; a.z += 1.1; }

                if (!getSolid(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z - 0.1))) a.z -= 0.1; 
                else if (getSolid(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z))) a.z += 0.5; 

                // Animal footsteps sound trigger
                let actualDist = Math.hypot(a.x - prevX, a.y - prevY);
                if (actualDist > 0.001) {
                    let stepSpeed = a.speed * 8.0;
                    a.animTime = (a.animTime || 0) + stepSpeed;
                    
                    let prevStepVal = Math.floor(((a.lastAnimTime || 0) - Math.PI / 2) / Math.PI);
                    let currStepVal = Math.floor(((a.animTime || 0) - Math.PI / 2) / Math.PI);
                    if (prevStepVal !== currStepVal) {
                        let stepType = Math.abs(currStepVal) % 2;
                        playMobStepSound(a.x, a.y, a.z, stepType);
                    }
                    a.lastAnimTime = a.animTime;
                }
            }
        }
    }

    interactTarget = null; let closestDist = 3.0;
    function checkTarget(obj, maxD) {
        let dist = Math.hypot(player.x - obj.x, player.y - obj.y);
        if (dist < maxD) {
            let angleTo = Math.atan2(obj.y - player.y, obj.x - player.x), angleDiff = Math.abs(Math.atan2(Math.sin(player.angle - angleTo), Math.cos(player.angle - angleTo)));
            if (angleDiff < 0.4 && dist < closestDist) { closestDist = dist; interactTarget = obj; }
        }
    }

    if (gameState === 'overworld') { 
        for (let c of containers) checkTarget(c, 3.0); 
        for (let a of animals) if (a.dead) checkTarget(a, 3.0); 
        for (let b of buildings) checkTarget(b, 4.0); 
        for (let v of vehicles) checkTarget(v, 4.0); 
    } 
    else { for (let e of getInteriorEntities()) checkTarget(e, 3.0); }

    // Check dropped items interaction in both states
    for (let item of droppedItems) {
        if (item.cooldown <= 0) checkTarget(item, 3.0);
    }

    if (interactTarget && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen && !isPaused) {
        if (vehicles.includes(interactTarget)) interactTooltip.innerText = "[E] Drive Truck";
        else if (interactTarget.rooms) interactTooltip.innerText = "[E] Enter " + interactTarget.emoji; 
        else if (interactTarget.label) interactTooltip.innerText = "[E] " + interactTarget.label; 
        else if (droppedItems.includes(interactTarget)) {
            let details = resolveItemDetails(interactTarget.item);
            interactTooltip.innerText = `[E] Pick up ${details ? details.name : 'Item'}`;
        }
        else interactTooltip.innerText = "[E] Loot";
        interactTooltip.style.display = 'block';
    } else interactTooltip.style.display = 'none';

    if (fireCooldown > 0) fireCooldown--;
    if (isMouseDown && fireCooldown <= 0 && (!player.inVehicle || player.vehicleView === '1st')) {
        let activeItem = inventory[hotbarSelection];
        let w = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;

        if (w) {
            const pitchAngle = Math.atan2(player.pitch, canvas.width * baseZoom);
            if (w.isMelee) {
                let hitTarget = null;
                if (gameState === 'overworld') {
                    let minT = Infinity;
                    let hitLimb = null;
                    let hitEnemyIndex = -1;
                    let hitAnimalIndex = -1;

                    // Set up melee segment from player eye height in player look direction
                    let pitchAngle = Math.atan2(player.pitch, canvas.width * baseZoom);
                    let waterBob = (gameState === 'overworld' && player.isSubmerged) ? Math.sin(gameTime * 200) * 0.05 : 0;
                    let startX = player.x;
                    let startY = player.y;
                    let startZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;

                    let endX = startX + Math.cos(player.angle) * Math.cos(pitchAngle) * w.range;
                    let endY = startY + Math.sin(player.angle) * Math.cos(pitchAngle) * w.range;
                    let endZ = startZ + Math.sin(pitchAngle) * w.range;

                    for (let ei = enemies.length - 1; ei >= 0; ei--) {
                        let e = enemies[ei];
                        if (e.type === 'zombie3d') {
                            let dist = distPointToSegment(e.x, e.y, e.z + e.size * 0.5, startX, startY, startZ, endX, endY, endZ);
                            if (dist < e.size * 1.5) {
                                let limbBoxes = get3DZombieLimbBoxes(e);
                                for (let box of limbBoxes) {
                                    let t = intersectSegmentBox({x: startX, y: startY, z: startZ}, {x: endX, y: endY, z: endZ}, box.verts);
                                    if (t !== false && t < minT) {
                                        minT = t;
                                        hitLimb = box.name;
                                        hitEnemyIndex = ei;
                                    }
                                }
                            }
                        } else {
                            let isLocational = (e.type === 'experimental' || e.type === 'zombie');
                            let rad = isLocational ? 0.4 : 0.6;
                            let cylHeight = (e.type === 'zombie' && e.isCrawling) ? 0.7 : e.size;
                            let hitZ = checkSegCyl(startX, startY, startZ, endX, endY, endZ, e.x, e.y, e.z, cylHeight, rad);
                            if (hitZ !== false) {
                                let t = 0.5;
                                if (endZ !== startZ) {
                                    t = (hitZ - startZ) / (endZ - startZ);
                                } else {
                                    let segLen = Math.hypot(endX - startX, endY - startY);
                                    if (segLen > 0) {
                                        let dx = endX - startX, dy = endY - startY;
                                        t = ((e.x - startX) * dx + (e.y - startY) * dy) / (segLen * segLen);
                                        t = Math.max(0, Math.min(1, t));
                                    }
                                }
                                if (t < minT) {
                                    minT = t;
                                    hitLimb = null;
                                    hitEnemyIndex = ei;
                                }
                            }
                        }
                    }

                    for (let ai = animals.length - 1; ai >= 0; ai--) {
                        let a = animals[ai];
                        if (!a.dead) {
                            let hitZ = checkSegCyl(startX, startY, startZ, endX, endY, endZ, a.x, a.y, a.z, a.size, 0.6);
                            if (hitZ !== false) {
                                let t = 0.5;
                                if (endZ !== startZ) {
                                    t = (hitZ - startZ) / (endZ - startZ);
                                }
                                if (t < minT) {
                                    minT = t;
                                    hitLimb = null;
                                    hitEnemyIndex = -1;
                                    hitAnimalIndex = ai;
                                }
                            }
                        }
                    }

                    if (minT < Infinity) {
                        let hitX = startX + minT * (endX - startX);
                        let hitY = startY + minT * (endY - startY);
                        let hitZ = startZ + minT * (endZ - startZ);
                        
                        if (hitEnemyIndex !== -1) {
                            let e = enemies[hitEnemyIndex];
                            hitTarget = { obj: e, type: 'enemy', hitZ, hitX, hitY, hitLimb };
                        } else if (hitAnimalIndex !== -1) {
                            let a = animals[hitAnimalIndex];
                            hitTarget = { obj: a, type: 'animal', hitZ, hitX, hitY };
                        }
                    }

                    if (!hitTarget && (w.toolType === 'axe' || w.toolType === 'pickaxe')) {
                        let cDist = w.range;
                        let pCx = Math.floor(player.x / CHUNK_SIZE), pCy = Math.floor(player.y / CHUNK_SIZE);
                        for(let cx = pCx - 1; cx <= pCx + 1; cx++) for(let cy = pCy - 1; cy <= pCy + 1; cy++) {
                            let chunk = getMapChunk(cx, cy);
                            for(let i=0; i<chunk.length; i++) {
                                let cObj = chunk[i];
                                if (cObj.hp !== undefined) {
                                    let d = Math.hypot(player.x - cObj.wx, player.y - cObj.wy);
                                    if (d < cDist) {
                                        let aTo = Math.atan2(cObj.wy - player.y, cObj.wx - player.x);
                                        let ad = Math.abs(Math.atan2(Math.sin(player.angle - aTo), Math.cos(player.angle - aTo)));
                                        if (ad < 0.6) {
                                            cDist = d;
                                            hitTarget = { obj: cObj, type: 'static', chunkArray: chunk, index: i };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (hitTarget) {
                    if (hitTarget.type === 'enemy') {
                        let e = hitTarget.obj;
                        if (e.type === 'zombie' || e.type === 'zombie3d') {
                            let died = damageZombieLimb(e, w.dmg, hitTarget.hitZ, hitTarget.hitX, hitTarget.hitY, Math.cos(player.angle), Math.sin(player.angle), hitTarget.hitLimb);
                            if (died) {
                                enemies.splice(enemies.indexOf(e), 1);
                            }
                        } else {
                            e.hp -= w.dmg; e.flash = 5; addDamageText(e.x, e.y, e.z + e.size, w.dmg);
                            let bCol = getBloodColor(e.type); if (bCol) spawnBlood(e.x, e.y, e.z + e.size * 0.6, bCol, 12);
                            if (e.hp <= 0) { enemies.splice(enemies.indexOf(e), 1); score += (e.type!=='alien'?150:100); scoreEl.innerText = score; }
                        }
                    } else if (hitTarget.type === 'animal') {
                        let a = hitTarget.obj;
                        a.hp -= w.dmg; addDamageText(a.x, a.y, a.z + a.size, w.dmg);
                        let bCol = getBloodColor('animal'); if (bCol) spawnBlood(a.x, a.y, a.z + a.size * 0.6, bCol, 12);
                        if (a.hp <= 0) { a.dead = true; score += 25; scoreEl.innerText = score; a.items = new Array(10).fill(null); for(let k=0; k<Math.floor(Math.random()*3)+1; k++) a.items[k] = { ...a.drop }; }
                    } else if (hitTarget.type === 'static') {
                        let sObj = hitTarget.obj, isTree = TREE_EMOJIS.has(sObj.emoji), isRock = sObj.emoji === '🪨', validHit = false;
                        if (isTree && w.toolType === 'axe') { giveItem({ type: 'resource', emoji: '🪵' }); validHit = true; } else if (isRock && w.toolType === 'pickaxe') { giveItem({ type: 'resource', emoji: '🪨' }); validHit = true; }
                        if (validHit) {
                            sObj.hp -= w.dmg;
                            addDamageText(sObj.wx, sObj.wy, sObj.h + sObj.size, w.dmg);
                            if (sObj.hp <= 0) {
                                destroyedEntities.add(sObj.entKey);
                                hitTarget.chunkArray.splice(hitTarget.index, 1);
                                
                                // Clean up cached Three.js chunk to force static billboard entity rebuild
                                let [ex, ey] = sObj.entKey.split(',').map(Number);
                                let ecx = Math.floor(ex / CHUNK_SIZE);
                                let ecy = Math.floor(ey / CHUNK_SIZE);
                                let chunkKey = `${ecx},${ecy}`;
                                if (typeof threeChunks !== 'undefined' && threeChunks.has(chunkKey)) {
                                    let cached = threeChunks.get(chunkKey);
                                    if (cached.entities) {
                                        for (let sprite of cached.entities) {
                                            scene.remove(sprite);
                                        }
                                    }
                                    threeChunks.delete(chunkKey);
                                }
                            }
                        }
                    }
                } else if ((w.toolType === 'shovel' || w.type === 'block' || w.toolType === 'pickaxe') && gameState === 'overworld') {
                    let aim = getAimVoxel(w.range);
                    if (aim) {
                        let isPlace = (w.type === 'block');
                        let targetX = isPlace ? aim.placeX : aim.hitX;
                        let targetY = isPlace ? aim.placeY : aim.hitY;
                        let targetZ = isPlace ? aim.placeZ : aim.hitZ;

                        let amt = (w.toolType === 'shovel' || w.toolType === 'pickaxe') ? -1 : w.blockId; 
                        let isFine = (w.type === 'block' && isVoxelCube(w.blockId)) || w.toolType === 'pickaxe';
                        let rad = isFine ? 0.1 : 1.4;
                        
                        let mx = isFine ? Math.floor(targetX) : targetX;
                        let my = isFine ? Math.floor(targetY) : targetY;
                        let mz = isFine ? Math.floor(targetZ) : targetZ;

                        modifyTerrain(mx, my, mz, rad, amt);
                        
                        let pCol = getVoxelColor(Math.floor(targetX), Math.floor(targetY), Math.floor(targetZ));
                        spawnBlood(targetX, targetY, targetZ, pCol, 8); 

                        if (isPlace) {
                            activeItem.count--;
                            if (activeItem.count <= 0) {
                                inventory[hotbarSelection] = null;
                            }
                            updateInventories();
                        }
                    }
                }
                fireCooldown = w.fireRate;
            } else {
                if (activeItem.id === 'pistol') {
                    if (typeof ensurePistolAmmo === 'function') ensurePistolAmmo(activeItem);
                    if (player.pistolReloadTimer > 0) return;
                    if (activeItem.bullets <= 0) {
                        startPistolReload();
                        return;
                    }
                    activeItem.bullets--;
                    if (typeof updateBulletCounterUI === 'function') updateBulletCounterUI();
                }

                let waterBob = (gameState === 'overworld' && player.isSubmerged) ? Math.sin(gameTime * 200) * 0.05 : 0;
                let camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
                for(let i=0; i<w.count; i++) projectiles.push({ owner: 'player', x: player.x, y: player.y, z: camZ, vx: Math.cos(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vy: Math.sin(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vz: Math.sin(pitchAngle) * w.speed, life: 100, dmg: w.dmg });
                
                // Gunshot sound trigger
                if (activeItem.id === 'pistol') {
                    playPistolShot();
                    player.muzzleFlashTick = 4;
                    if (!player.pistolLastShotTimer) player.pistolLastShotTimer = 0;
                    if (!player.pistolConsecutiveShots) player.pistolConsecutiveShots = 0;
                    if (tickCounter - player.pistolLastShotTimer < 45) {
                        player.pistolConsecutiveShots++;
                    } else {
                        player.pistolConsecutiveShots = 1;
                    }
                    player.pistolLastShotTimer = tickCounter;
                    if (player.pistolConsecutiveShots >= 5) {
                        player.pistolSmokeTimer = 120;
                    }
                }
                
                fireCooldown = w.fireRate;
            }
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i], prevX = p.x, prevY = p.y, prevZ = p.z;
        p.x += p.vx; p.y += p.vy; p.z += p.vz; p.life--; let hit = gameState === 'overworld' ? getSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) : false;
        if (p.owner === 'player' && gameState === 'overworld') {
            let minT = Infinity;
            let hitLimb = null;
            let hitEnemyIndex = -1;
            let hitAnimalIndex = -1;

            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                let e = enemies[ei];
                if (e.type === 'zombie3d') {
                    let dist = distPointToSegment(e.x, e.y, e.z + e.size * 0.5, prevX, prevY, prevZ, p.x, p.y, p.z);
                    if (dist < e.size * 1.5) {
                        let limbBoxes = get3DZombieLimbBoxes(e);
                        for (let box of limbBoxes) {
                            let t = intersectSegmentBox({x: prevX, y: prevY, z: prevZ}, {x: p.x, y: p.y, z: p.z}, box.verts);
                            if (t !== false && t < minT) {
                                minT = t;
                                hitLimb = box.name;
                                hitEnemyIndex = ei;
                            }
                        }
                    }
                } else {
                    let isLocational = (e.type === 'experimental' || e.type === 'zombie');
                    let rad = isLocational ? 0.4 : 0.6;
                    let cylHeight = (e.type === 'zombie' && e.isCrawling) ? 0.7 : e.size;
                    let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, e.x, e.y, e.z, cylHeight, rad);
                    if (hitZ !== false) {
                        let t = 0.5;
                        if (p.z !== prevZ) {
                            t = (hitZ - prevZ) / (p.z - prevZ);
                        } else {
                            let segLen = Math.hypot(p.x - prevX, p.y - prevY);
                            if (segLen > 0) {
                                let dx = p.x - prevX, dy = p.y - prevY;
                                t = ((e.x - prevX) * dx + (e.y - prevY) * dy) / (segLen * segLen);
                                t = Math.max(0, Math.min(1, t));
                            }
                        }
                        if (t < minT) {
                            minT = t;
                            hitLimb = null;
                            hitEnemyIndex = ei;
                        }
                    }
                }
            }

            for (let ai = animals.length - 1; ai >= 0; ai--) {
                let a = animals[ai];
                if (!a.dead) {
                    let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, a.x, a.y, a.z, a.size, 0.6);
                    if (hitZ !== false) {
                        let t = 0.5;
                        if (p.z !== prevZ) {
                            t = (hitZ - prevZ) / (p.z - prevZ);
                        }
                        if (t < minT) {
                            minT = t;
                            hitLimb = null;
                            hitEnemyIndex = -1;
                            hitAnimalIndex = ai;
                        }
                    }
                }
            }

            if (minT < Infinity) {
                let hitX = prevX + minT * (p.x - prevX);
                let hitY = prevY + minT * (p.y - prevY);
                let hitZ = prevZ + minT * (p.z - prevZ);
                
                hit = true;

                if (hitEnemyIndex !== -1) {
                    let e = enemies[hitEnemyIndex];
                    if (e.type === 'zombie' || e.type === 'zombie3d') {
                        let died = damageZombieLimb(e, p.dmg, hitZ, hitX, hitY, p.vx, p.vy, hitLimb);
                        if (died) {
                            enemies.splice(hitEnemyIndex, 1);
                        }
                    } else {
                        let relZ = hitZ - e.z;
                        let mult = (relZ > e.size * 0.88) ? 2.0 : ((relZ > e.size * 0.72) ? 1.2 : ((relZ > e.size * 0.44) ? 1.0 : 0.5));
                        let totalDmg = p.dmg * mult;
                        e.hp -= totalDmg;
                        e.flash = 5;
                        addDamageText(e.x, e.y, hitZ, totalDmg);
                        let bCol = getBloodColor(e.type);
                        if (bCol) spawnBlood(hitX, hitY, hitZ, bCol, mult === 2.0 ? 25 : 8);
                        if (e.hp <= 0) {
                            enemies.splice(hitEnemyIndex, 1);
                            score += 150;
                            scoreEl.innerText = score;
                        }
                    }
                } else if (hitAnimalIndex !== -1) {
                    let a = animals[hitAnimalIndex];
                    a.hp -= p.dmg;
                    addDamageText(a.x, a.y, hitZ, p.dmg);
                    let bCol = getBloodColor('animal');
                    if (bCol) spawnBlood(hitX, hitY, hitZ, bCol, 10);
                    if (a.hp <= 0) {
                        a.dead = true;
                        score += 25;
                        scoreEl.innerText = score;
                        a.items = new Array(10).fill(null);
                        for(let k=0; k<Math.floor(Math.random()*3)+1; k++) {
                            a.items[k] = { ...a.drop };
                        }
                    }
                }
            }
        } else if (p.owner === 'enemy') { let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, player.x, player.y, player.z, 1.6, 0.4); if (hitZ !== false) { takeDamage(p.dmg); hit = true; } }
        if (hit || p.life <= 0) projectiles.splice(i, 1);
    }
}

function spawnFlyingLimb(x, y, z, type, is3D = false, zSize = 1.4) {
    let angle = Math.random() * Math.PI * 2;
    let speed = Math.random() * 0.05 + 0.03;
    let vz = Math.random() * 0.05 + 0.08;
    bloodParticles.push({
        x: x, y: y, z: z,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: vz,
        color: {r: 30, g: 86, b: 34}, // Zombie skin green
        life: is3D ? 900 : (3000 + Math.random() * 600), // 30 seconds (900 frames) for 3D
        maxLife: is3D ? 900 : 3000,
        size: (type === 'head') ? 0.20 : ((type.endsWith('UpperArm') || type.endsWith('UpperLeg') || type === 'upperArm' || type === 'upperLeg') ? 0.16 : 0.12),
        scale: zSize / 32.0,
        isLimb: true,
        limbType: type,
        is3D: is3D,
        sprayAngle: Math.random() * Math.PI * 2,
        landedAngle: (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2) + (Math.random() - 0.5) * 0.3,
        spinX: Math.random() * Math.PI * 2,
        spinY: Math.random() * Math.PI * 2,
        spinZ: Math.random() * Math.PI * 2,
        spinSpeed: Math.random() * 0.2 + 0.1
    });
}

function damageZombieLimb(e, dmg, hitZ, px, py, dx, dy, specificLimb = null) {
    if (e.hasHead === undefined) {
        e.hasHead = true;
        e.hasLeftUpperArm = true;
        e.hasLeftLowerArm = true;
        e.hasRightUpperArm = true;
        e.hasRightLowerArm = true;
        e.hasLeftUpperLeg = true;
        e.hasLeftLowerLeg = true;
        e.hasRightUpperLeg = true;
        e.hasRightLowerLeg = true;
        e.limbsHP = {
            head: 4,
            leftUpperArm: 3,
            leftLowerArm: 2,
            rightUpperArm: 3,
            rightLowerArm: 2,
            leftUpperLeg: 3,
            leftLowerLeg: 2,
            rightUpperLeg: 3,
            rightLowerLeg: 2
        };
        e.isCrawling = false;
    }

    let hitLimb = null;
    let mult = 1.0;

    if (specificLimb) {
        hitLimb = specificLimb;
        if (hitLimb === 'head') {
            mult = 2.0;
        } else if (hitLimb === 'torso') {
            mult = 1.1;
        } else if (hitLimb.endsWith('Arm') || hitLimb.endsWith('arm')) {
            mult = 1.0;
        } else if (hitLimb.endsWith('Leg') || hitLimb.endsWith('leg')) {
            mult = 0.5;
        }
    } else {
        let relZ = hitZ - e.z;
        let len = Math.hypot(dx, dy);
        let hOffset = 0;
        if (len > 0) {
            let sdx = dx / len;
            let sdy = dy / len;
            let vx = px - e.x;
            let vy = py - e.y;
            hOffset = vy * sdx - vx * sdy;
            if (vx === 0 && vy === 0) {
                hOffset = (Math.random() - 0.5) * 0.4; // randomize melee
            }
        }

        // Check hit segment based on height (relZ)
        if (e.type === 'zombie3d') {
            if (relZ > e.size * 0.75) {
                // Head
                if (e.hasHead) {
                    hitLimb = 'head';
                    mult = 2.0;
                } else {
                    mult = 1.0; // Neck stump
                }
            } else if (relZ > e.size * 0.375) {
                // Torso / Arms height
                if (Math.abs(hOffset) > 0.225) {
                    // Arm!
                    if (hOffset > 0) {
                        // Right Arm
                        if (relZ <= e.size * 0.5625) {
                            if (e.hasRightLowerArm) hitLimb = 'rightLowerArm';
                            else if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        } else {
                            if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        }
                    } else {
                        // Left Arm
                        if (relZ <= e.size * 0.5625) {
                            if (e.hasLeftLowerArm) hitLimb = 'leftLowerArm';
                            else if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        } else {
                            if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        }
                    }
                }
                if (!hitLimb) {
                    mult = (relZ > e.size * 0.5625) ? 1.2 : 1.0;
                }
            } else {
                // Legs / Crawling torso height
                if (e.isCrawling) {
                    mult = 0.5; // Torso/stumps hit while crawling
                } else {
                    // Legs
                    if (hOffset > 0) {
                        // Right Leg
                        if (relZ <= e.size * 0.1875) {
                            if (e.hasRightLowerLeg) hitLimb = 'rightLowerLeg';
                            else if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        } else {
                            if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        }
                    } else {
                        // Left Leg
                        if (relZ <= e.size * 0.1875) {
                            // Left Leg
                            if (e.hasLeftLowerLeg) hitLimb = 'leftLowerLeg';
                            else if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        } else {
                            if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        }
                    }
                    mult = 0.5;
                }
            }
        } else {
            // Original billboard zombie logic
            if (relZ > e.size * 0.88) {
                // Head
                if (e.hasHead) {
                    hitLimb = 'head';
                    mult = 2.0;
                } else {
                    mult = 1.0; // Neck stump hit
                }
            } else if (relZ > e.size * 0.44) {
                // Torso height (chest/abdomen)
                if (Math.abs(hOffset) > 0.12) {
                    // Arm! hOffset > 0 is player's right (screen-right, i.e. zombie's right arm in visual/billboard space)
                    if (hOffset > 0) {
                        // Right Arm
                        if (relZ <= e.size * 0.62) {
                            if (e.hasRightLowerArm) hitLimb = 'rightLowerArm';
                            else if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        } else {
                            if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        }
                    } else {
                        // Left Arm
                        if (relZ <= e.size * 0.62) {
                            if (e.hasLeftLowerArm) hitLimb = 'leftLowerArm';
                            else if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        } else {
                            if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        }
                    }
                }
                if (!hitLimb) {
                    mult = (relZ > e.size * 0.72) ? 1.2 : 1.0;
                }
            } else {
                // Leg height
                if (e.isCrawling) {
                    mult = 0.5; // Torso/stumps hit while crawling
                } else {
                    // Legs
                    if (hOffset > 0) {
                        // Right Leg
                        if (relZ <= e.size * 0.22) {
                            if (e.hasRightLowerLeg) hitLimb = 'rightLowerLeg';
                            else if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        } else {
                            if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        }
                    } else {
                        // Left Leg
                        if (relZ <= e.size * 0.22) {
                            if (e.hasLeftLowerLeg) hitLimb = 'leftLowerLeg';
                            else if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        } else {
                            if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        }
                    }
                    mult = 0.5;
                }
            }
        }
    }

    let totalDmg = dmg * mult;
    e.hp -= totalDmg;
    e.flash = 5;
    addDamageText(e.x, e.y, hitZ, totalDmg);

    let bCol = getBloodColor('zombie') || {r: 92, g: 64, b: 51};
    spawnBlood(px, py, hitZ, bCol, mult === 2.0 ? 25 : 8);

    if (hitLimb) {
        e.limbsHP[hitLimb] -= totalDmg;
        if (e.limbsHP[hitLimb] <= 0) {
            let is3D = e.type === 'zombie3d';
            if (hitLimb === 'head') {
                e.hasHead = false;
                spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.88, 'head', is3D, e.size);
                if (e.bleedOutTimer === undefined) {
                    e.bleedOutTimer = 120 + Math.random() * 60; // 2 to 3 seconds of movement
                }
            } else if (hitLimb === 'leftLowerArm') {
                e.hasLeftLowerArm = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.15, e.y - Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'leftLowerArm', is3D, e.size);
            } else if (hitLimb === 'leftUpperArm') {
                e.hasLeftUpperArm = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.15, e.y - Math.cos(player.angle)*0.15, e.z + e.size * 0.72, 'leftUpperArm', is3D, e.size);
                if (e.hasLeftLowerArm) {
                    e.hasLeftLowerArm = false;
                    spawnFlyingLimb(e.x + Math.sin(player.angle)*0.15, e.y - Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'leftLowerArm', is3D, e.size);
                }
            } else if (hitLimb === 'rightLowerArm') {
                e.hasRightLowerArm = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.15, e.y + Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'rightLowerArm', is3D, e.size);
            } else if (hitLimb === 'rightUpperArm') {
                e.hasRightUpperArm = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.15, e.y + Math.cos(player.angle)*0.15, e.z + e.size * 0.72, 'rightUpperArm', is3D, e.size);
                if (e.hasRightLowerArm) {
                    e.hasRightLowerArm = false;
                    spawnFlyingLimb(e.x - Math.sin(player.angle)*0.15, e.y + Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'rightLowerArm', is3D, e.size);
                }
            } else if (hitLimb === 'leftLowerLeg') {
                e.hasLeftLowerLeg = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.08, e.y - Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'leftLowerLeg', is3D, e.size);
                e.isCrawling = true;
            } else if (hitLimb === 'leftUpperLeg') {
                e.hasLeftUpperLeg = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.08, e.y - Math.cos(player.angle)*0.08, e.z + e.size * 0.3, 'leftUpperLeg', is3D, e.size);
                if (e.hasLeftLowerLeg) {
                    e.hasLeftLowerLeg = false;
                    spawnFlyingLimb(e.x + Math.sin(player.angle)*0.08, e.y - Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'leftLowerLeg', is3D, e.size);
                }
                e.isCrawling = true;
            } else if (hitLimb === 'rightLowerLeg') {
                e.hasRightLowerLeg = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.08, e.y + Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'rightLowerLeg', is3D, e.size);
                e.isCrawling = true;
            } else if (hitLimb === 'rightUpperLeg') {
                e.hasRightUpperLeg = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.08, e.y + Math.cos(player.angle)*0.08, e.z + e.size * 0.3, 'rightUpperLeg', is3D, e.size);
                if (e.hasRightLowerLeg) {
                    e.hasRightLowerLeg = false;
                    spawnFlyingLimb(e.x - Math.sin(player.angle)*0.08, e.y + Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'rightLowerLeg', is3D, e.size);
                }
                e.isCrawling = true;
            }
        }
    }

    if (e.hp <= 0) {
        let is3D = e.type === 'zombie3d';
        spawnBlood(e.x, e.y, e.z + e.size * 0.5, getBloodColor(e.type) || {r: 92, g: 64, b: 51}, 30);
        if (e.hasHead) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.88, 'head', is3D, e.size);
        if (e.hasLeftUpperArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.72, 'leftUpperArm', is3D, e.size);
        if (e.hasLeftLowerArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.5, 'leftLowerArm', is3D, e.size);
        if (e.hasRightUpperArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.72, 'rightUpperArm', is3D, e.size);
        if (e.hasRightLowerArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.5, 'rightLowerArm', is3D, e.size);
        if (e.hasLeftUpperLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.3, 'leftUpperLeg', is3D, e.size);
        if (e.hasLeftLowerLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.1, 'leftLowerLeg', is3D, e.size);
        if (e.hasRightUpperLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.3, 'rightUpperLeg', is3D, e.size);
        if (e.hasRightLowerLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.1, 'rightLowerLeg', is3D, e.size);
        return true;
    }
    return false;
}

