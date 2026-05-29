//THIS IS physics.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// --- Update Physics & Logic ---
function update() {
    if (isPaused || isLoading) return;

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
    
    if (coordsEl) {
        coordsEl.innerText = `${Math.floor(player.x)}, ${Math.floor(player.y)}, ${Math.floor(player.z)}`;
    }
    
    let curSpeedMult = speedMult * (isSprinting ? sprintMult : 1.0) * (player.inWater ? 0.5 : 1.0);
    let mv = 0, st = 0;
    if (keys['KeyW']) mv += player.speed * curSpeedMult; if (keys['KeyS']) mv -= player.speed * curSpeedMult;
    if (keys['KeyA']) st -= player.speed * curSpeedMult; if (keys['KeyD']) st += player.speed * curSpeedMult;
    
    player.zOffset = player.zOffset || 0;

    // Movement & Vehicle Physics Handling
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

        if (player.vehicleView === '3rd') {
            player.x = v.camX - Math.cos(player.angle) * 9.5; 
            player.y = v.camY - Math.sin(player.angle) * 9.5;
            player.z = v.camZ + 1.0; 
            
            let pitchTarget = v.pitch * 300; 
            player.pitch += (pitchTarget - player.pitch) * 0.1;
        } else {
            player.x = v.x + Math.cos(v.angle) * 0.5 - Math.sin(v.angle) * 0.8; 
            player.y = v.y + Math.sin(v.angle) * 0.5 + Math.cos(v.angle) * 0.8;
            player.z = v.z + 2.2; 
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
    for(let i = bloodParticles.length - 1; i >= 0; i--) { 
        let b = bloodParticles[i];
        if (!b.onGround) {
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
                    if (!getSolid(Math.floor(nx), Math.floor(e.y), Math.floor(e.z))) e.x = nx;
                    else if (!getSolid(Math.floor(nx), Math.floor(e.y), Math.floor(e.z + 1.1))) { e.x = nx; e.z += 1.1; }

                    if (!getSolid(Math.floor(e.x), Math.floor(ny), Math.floor(e.z))) e.y = ny;
                    else if (!getSolid(Math.floor(e.x), Math.floor(ny), Math.floor(e.z + 1.1))) { e.y = ny; e.z += 1.1; }
                    
                    if (e.type === 'zombie3d' || e.type === 'zombie') {
                        if (e.bleedOutTimer === undefined) {
                            e.angle = Math.atan2(player.y - e.y, player.x - e.x);
                        }
                        e.animTime = (e.animTime || 0) + moveSpeed * 8.0;
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

                if (!getSolid(Math.floor(anx), Math.floor(a.y), Math.floor(a.z))) a.x = anx; 
                else if (!getSolid(Math.floor(anx), Math.floor(a.y), Math.floor(a.z + 1.1))) { a.x = anx; a.z += 1.1; }

                if (!getSolid(Math.floor(a.x), Math.floor(any), Math.floor(a.z))) a.y = any; 
                else if (!getSolid(Math.floor(a.x), Math.floor(any), Math.floor(a.z + 1.1))) { a.y = any; a.z += 1.1; }

                if (!getSolid(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z - 0.1))) a.z -= 0.1; 
                else if (getSolid(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z))) a.z += 0.5; 
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
            const pitchAngle = Math.atan2(player.pitch, canvas.width * currentZoom);
            if (w.isMelee) {
                let hitTarget = null; let cDist = w.range;
                if (gameState === 'overworld') {
                    for (let e of enemies) { let d = Math.hypot(player.x - e.x, player.y - e.y); if (d < cDist) { let a = Math.atan2(e.y - player.y, e.x - player.x), ad = Math.abs(Math.atan2(Math.sin(player.angle - a), Math.cos(player.angle - a))); if (ad < 0.6) { cDist = d; hitTarget = { obj: e, type: 'enemy' }; } } }
                    for (let a of animals) { if(a.dead) continue; let d = Math.hypot(player.x - a.x, player.y - a.y); if (d < cDist) { let aTo = Math.atan2(a.y - player.y, a.x - player.x), ad = Math.abs(Math.atan2(Math.sin(player.angle - aTo), Math.cos(player.angle - aTo))); if (ad < 0.6) { cDist = d; hitTarget = { obj: a, type: 'animal' }; } } }
                    
                    if (!hitTarget && (w.toolType === 'axe' || w.toolType === 'pickaxe')) {
                        let pCx = Math.floor(player.x / CHUNK_SIZE), pCy = Math.floor(player.y / CHUNK_SIZE);
                        for(let cx = pCx - 1; cx <= pCx + 1; cx++) for(let cy = pCy - 1; cy <= pCy + 1; cy++) {
                            let chunk = getMapChunk(cx, cy);
                            for(let i=0; i<chunk.length; i++) {
                                let cObj = chunk[i]; if (cObj.hp !== undefined) { let d = Math.hypot(player.x - cObj.wx, player.y - cObj.wy); if (d < cDist) { let aTo = Math.atan2(cObj.wy - player.y, cObj.wx - player.x), ad = Math.abs(Math.atan2(Math.sin(player.angle - aTo), Math.cos(player.angle - aTo))); if (ad < 0.6) { cDist = d; hitTarget = { obj: cObj, type: 'static', chunkArray: chunk, index: i }; } } }
                            }
                        }
                    }
                }

                if (hitTarget) {
                    if (hitTarget.type === 'enemy') {
                        if (hitTarget.obj.type === 'zombie' || hitTarget.obj.type === 'zombie3d') {
                            let died = damageZombieLimb(hitTarget.obj, w.dmg, hitTarget.obj.z + hitTarget.obj.size * 0.6, hitTarget.obj.x, hitTarget.obj.y, Math.cos(player.angle), Math.sin(player.angle));
                            if (died) {
                                enemies.splice(enemies.indexOf(hitTarget.obj), 1);
                            }
                        } else {
                            hitTarget.obj.hp -= w.dmg; hitTarget.obj.flash = 5; addDamageText(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size, w.dmg);
                            let bCol = getBloodColor(hitTarget.obj.type); if (bCol) spawnBlood(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size * 0.6, bCol, 12);
                            if (hitTarget.obj.hp <= 0) { enemies.splice(enemies.indexOf(hitTarget.obj), 1); score += (hitTarget.obj.type!=='alien'?150:100); scoreEl.innerText = score; }
                        }
                    } else if (hitTarget.type === 'animal') {
                        hitTarget.obj.hp -= w.dmg; addDamageText(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size, w.dmg);
                        let bCol = getBloodColor('animal'); if (bCol) spawnBlood(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size * 0.6, bCol, 12);
                        if (hitTarget.obj.hp <= 0) { hitTarget.obj.dead = true; score += 25; scoreEl.innerText = score; hitTarget.obj.items = new Array(10).fill(null); for(let k=0; k<Math.floor(Math.random()*3)+1; k++) hitTarget.obj.items[k] = { ...hitTarget.obj.drop }; }
                    } else if (hitTarget.type === 'static') {
                        let sObj = hitTarget.obj, isTree = TREE_EMOJIS.has(sObj.emoji), isRock = sObj.emoji === '🪨', validHit = false;
                        if (isTree && w.toolType === 'axe') { giveItem({ type: 'resource', emoji: '🪵' }); validHit = true; } else if (isRock && w.toolType === 'pickaxe') { giveItem({ type: 'resource', emoji: '🪨' }); validHit = true; }
                        if (validHit) { sObj.hp -= w.dmg; addDamageText(sObj.wx, sObj.wy, sObj.h + sObj.size, w.dmg); if (sObj.hp <= 0) { destroyedEntities.add(sObj.entKey); hitTarget.chunkArray.splice(hitTarget.index, 1); } }
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
                for(let i=0; i<w.count; i++) projectiles.push({ owner: 'player', x: player.x, y: player.y, z: player.z + 1.2, vx: Math.cos(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vy: Math.sin(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vz: Math.sin(pitchAngle) * w.speed, life: 100, dmg: w.dmg });
                fireCooldown = w.fireRate;
            }
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i], prevX = p.x, prevY = p.y, prevZ = p.z;
        p.x += p.vx; p.y += p.vy; p.z += p.vz; p.life--; let hit = gameState === 'overworld' ? getSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) : false;
        if (p.owner === 'player' && gameState === 'overworld') {
            for (let ei = enemies.length - 1; ei >= 0; ei--) { 
                let e = enemies[ei], isLocational = (e.type === 'experimental' || e.type === 'zombie' || e.type === 'zombie3d'), rad = isLocational ? 0.4 : 0.6;
                let cylHeight = ((e.type === 'zombie' || e.type === 'zombie3d') && e.isCrawling) ? 0.7 : e.size;
                let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, e.x, e.y, e.z, cylHeight, rad);
                if (hitZ !== false) {
                    if (isLocational) {
                        if (e.type === 'zombie' || e.type === 'zombie3d') {
                            let died = damageZombieLimb(e, p.dmg, hitZ, p.x, p.y, p.vx, p.vy);
                            hit = true;
                            if (died) {
                                enemies.splice(ei, 1);
                            }
                        } else {
                            let relZ = hitZ - e.z, mult = (relZ > e.size * 0.88) ? 2.0 : ((relZ > e.size * 0.72) ? 1.2 : ((relZ > e.size * 0.44) ? 1.0 : 0.5)), totalDmg = p.dmg * mult;
                            e.hp -= totalDmg; hit = true; e.flash = 5; addDamageText(e.x, e.y, hitZ, totalDmg);
                            let bCol = getBloodColor(e.type); if (bCol) spawnBlood(p.x, p.y, hitZ, bCol, mult === 2.0 ? 25 : 8);
                            if (e.hp <= 0) { enemies.splice(ei, 1); score += 150; scoreEl.innerText = score; }
                        }
                        break;
                    } else {
                        e.hp -= p.dmg; hit = true; e.flash = 5; addDamageText(e.x, e.y, hitZ, p.dmg); let bCol = getBloodColor(e.type || 'alien'); if(bCol) spawnBlood(p.x, p.y, hitZ, bCol, 10);
                        if (e.hp <= 0) { enemies.splice(ei, 1); score += 100; scoreEl.innerText = score; } break; 
                    }
                }
            }
            if (!hit) {
                for (let ai = animals.length - 1; ai >= 0; ai--) { 
                    let a = animals[ai]; 
                    if (!a.dead) {
                        let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, a.x, a.y, a.z, a.size, 0.6);
                        if (hitZ !== false) { 
                            a.hp -= p.dmg; hit = true; addDamageText(a.x, a.y, hitZ, p.dmg); let bCol = getBloodColor('animal'); if(bCol) spawnBlood(p.x, p.y, hitZ, bCol, 10);
                            if (a.hp <= 0) { a.dead = true; score += 25; scoreEl.innerText = score; a.items = new Array(10).fill(null); for(let k=0; k<Math.floor(Math.random()*3)+1; k++) a.items[k] = { ...a.drop }; } break; 
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

function damageZombieLimb(e, dmg, hitZ, px, py, dx, dy) {
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

    let hitLimb = null;
    let mult = 1.0;

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

