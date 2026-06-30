//THIS IS player.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

function getGroundHeight(px, py, pz) {
    let r = 0.25;
    let maxSurfaceZ = -1;
    for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++) {
        for (let y = Math.floor(py - r); y <= Math.floor(py + r); y++) {
            for (let z = Math.floor(pz - 1.5); z <= Math.floor(pz + 1.0); z++) {
                let v = getVoxel(x, y, z);
                if (isVoxelSolid(v)) {
                    let top = z + 1.0;
                    if (v === 6) {
                        top = z + 0.5;
                    } else if (v === 7 || v === 8) {
                        let tTerrain = getTerrainFast(x, y);
                        top = (tTerrain.roadH > tTerrain.baseH + 3.0) ? tTerrain.roadH : tTerrain.baseH;
                    }
                    if (top <= pz + 0.8 && top > maxSurfaceZ) {
                        maxSurfaceZ = top;
                    }
                }
            }
        }
    }
    return maxSurfaceZ;
}

function updatePlayer() {
    if (player.pistolReloadTimer > 0) {
        player.pistolReloadTimer--;
        if (player.pistolReloadTimer === 0) {
            let activeItem = inventory[hotbarSelection];
            if (activeItem && activeItem.id === 'pistol') {
                if (typeof ensurePistolAmmo === 'function') ensurePistolAmmo(activeItem);
                let needed = 10 - activeItem.bullets;
                if (needed > 0) {
                    let toAdd = (typeof consumePlayerAmmo === 'function') ? consumePlayerAmmo('.45acp', needed) : 0;
                    activeItem.bullets += toAdd;
                }
            }
        }
        if (typeof updateBulletCounterUI === 'function') updateBulletCounterUI();
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

    if (player.inWater === undefined) {
        player.inWater = gameState === 'overworld' && (getVoxel(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z)) === 2);
    } else {
        let currInWater = gameState === 'overworld' && (getVoxel(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z)) === 2);
        if (currInWater !== player.inWater) {
            if (player.inWater && !currInWater) {
                player.wetTimer = 60; // 1 second of wet trail
            }
            player.inWater = currInWater;
            let t = getTerrainFast(player.x, player.y);
            let waterSurfaceZ = t.isLake ? t.lakeSurface : t.oceanSurface;
            spawnWaterSplash(player.x, player.y, waterSurfaceZ + 0.55, 15);
        }
    }
    player.isSubmerged = gameState === 'overworld' && (getVoxel(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z + player.baseHeight)) === 2);

    if (player.isSubmerged) {
        if (!godMode) player.oxygen = Math.max(0, player.oxygen - 0.15);
        if (player.oxygen <= 0 && tickCounter % 60 === 0) takeDamage(10);
    } else {
        player.oxygen = Math.min(100, player.oxygen + 1.0);
    }
    oxygenEl.innerText = Math.floor(player.oxygen);
    const oxygenItemEl = document.getElementById('oxygen-item');
    if (oxygenItemEl) {
        oxygenItemEl.style.display = (player.isSubmerged || player.oxygen < 100) ? 'block' : 'none';
    }

    let isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
    if (player.wetTimer > 0) {
        player.wetTimer--;
        if (tickCounter % 3 === 0 && isMoving && !player.inVehicle) {
            spawnWaterDrip(player.x, player.y, player.z, 1);
        }
    }
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
        let deg = (player.angle * 180 / Math.PI) % 360;
        if (deg < 0) deg += 360;
        const index = Math.round(deg / 45) % 8;
        const directions = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
        const comp = directions[index];
        
        if (freecam) {
            coordsEl.innerText = `Freecam: ${Math.floor(freecamX)}, ${Math.floor(freecamY)}, ${Math.floor(freecamZ)} (${comp})`;
        } else {
            coordsEl.innerText = `${Math.floor(player.x)}, ${Math.floor(player.y)}, ${Math.floor(player.z)} (${comp})`;
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
        
        let pitchAngle = freecamPitch;
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
        v.camX = v.camX || v.x; v.camY = v.camY || v.y; v.camZ = v.camZ || v.z;

        v.camX += (v.x - v.camX) * 0.15; 
        v.camY += (v.y - v.camY) * 0.15;
        v.camZ += (v.z - v.camZ) * 0.15;

        // Player physical coordinates are always set to the physical seat coordinates in the vehicle
        player.x = v.x + Math.cos(v.angle) * 0.30 + Math.sin(v.angle) * 0.32; 
        player.y = v.y + Math.sin(v.angle) * 0.30 - Math.cos(v.angle) * 0.32;
        player.z = v.z + 0.45; 
        player.vz = 0;
        
        if (typeof speedometerItemEl !== 'undefined' && speedometerItemEl && speedometerEl) {
            speedometerItemEl.style.display = 'block';
            let speedMph = Math.abs(v.currentVehicleSpeedKmHour || 0) * 0.621371;
            speedometerEl.innerText = `${Math.round(speedMph)} mph`;
        }
        if (typeof gearItemEl !== 'undefined' && gearItemEl && gearStatusEl) {
            gearItemEl.style.display = 'block';
            gearStatusEl.innerText = v.gear || 'D';
        }

    } else {
        if (typeof speedometerItemEl !== 'undefined' && speedometerItemEl) {
            speedometerItemEl.style.display = 'none';
        }
        if (typeof gearItemEl !== 'undefined' && gearItemEl) {
            gearItemEl.style.display = 'none';
        }
        if (gameState === 'overworld') {
            let nx = player.x + Math.cos(player.angle) * mv + Math.cos(player.angle + 1.57) * st;
            let ny = player.y + Math.sin(player.angle) * mv + Math.sin(player.angle + 1.57) * st;
            
            let stepH = 1.1; 
            let steppedZ = 0;

            // X movement
            let testZ_x = player.z;
            if (player.vz <= 0 && !flightMode) {
                let groundH_x = getGroundHeight(nx, player.y, player.z);
                if (groundH_x !== -1) {
                    let diff = groundH_x - player.z;
                    if (diff > 0 && diff <= 0.6) {
                        testZ_x = groundH_x;
                    } else if (diff < 0 && diff >= -0.5) {
                        testZ_x = groundH_x;
                    }
                }
            }

            if (!checkCollision(nx, player.y, testZ_x)) {
                player.x = nx;
                if (testZ_x !== player.z) {
                    let stepped = testZ_x - player.z;
                    player.z = testZ_x;
                    player.vz = 0;
                    if (Math.abs(stepped) <= 0.5) {
                        player.zOffset -= stepped;
                    }
                }
            } else {
                for (let s = 0.2; s <= stepH; s += 0.2) {
                    if (!checkCollision(nx, player.y, player.z + s)) {
                        player.x = nx; player.z += s; steppedZ += s; break;
                    }
                }
            }

            // Y movement
            let testZ_y = player.z;
            if (player.vz <= 0 && !flightMode) {
                let groundH_y = getGroundHeight(player.x, ny, player.z);
                if (groundH_y !== -1) {
                    let diff = groundH_y - player.z;
                    if (diff > 0 && diff <= 0.6) {
                        testZ_y = groundH_y;
                    } else if (diff < 0 && diff >= -0.5) {
                        testZ_y = groundH_y;
                    }
                }
            }

            if (!checkCollision(player.x, ny, testZ_y)) {
                player.y = ny;
                if (testZ_y !== player.z) {
                    let stepped = testZ_y - player.z;
                    player.z = testZ_y;
                    player.vz = 0;
                    if (Math.abs(stepped) <= 0.5) {
                        player.zOffset -= stepped;
                    }
                }
            } else {
                for (let s = 0.2; s <= stepH; s += 0.2) {
                    if (!checkCollision(player.x, ny, player.z + s)) {
                        player.y = ny; player.z += s; steppedZ += s; break;
                    }
                }
            }

            if (steppedZ > 0 && steppedZ <= 0.5) player.zOffset -= steppedZ;

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
                        if (player.vz < 0) {
                            player.vz = 0;
                            let groundH = getGroundHeight(player.x, player.y, player.z);
                            player.z = (groundH !== -1) ? (groundH + 0.01) : player.z;
                        }
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



    player.zOffset *= 0.7;
    if (Math.abs(player.zOffset) < 0.01) player.zOffset = 0;

}
