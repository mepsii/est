//THIS IS entities.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

function isSolidAt(x, y, z_val) {
    let sz = Math.floor(z_val);
    let v = getVoxel(x, y, sz);
    if (v === 7 || v === 8) {
        let tTerrain = getTerrainFast(x, y);
        let targetH = (tTerrain.roadH > tTerrain.baseH + 3.0) ? tTerrain.roadH : tTerrain.baseH;
        return z_val < targetH;
    }
    if (v === 6) {
        return (z_val - sz) < 0.5;
    }
    return v === 1 || v >= 3;
}

function updateEntities() {
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

            // Water splash transition check
            if (e.wetTimer > 0) {
                e.wetTimer--;
            }
            if (e.inWater === undefined) {
                e.inWater = (getVoxel(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)) === 2);
            } else {
                let currInWater = (getVoxel(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)) === 2);
                if (currInWater !== e.inWater) {
                    if (e.inWater && !currInWater) {
                        e.wetTimer = 60;
                    }
                    e.inWater = currInWater;
                    let t = getTerrainFast(e.x, e.y);
                    let waterSurfaceZ = t.isLake ? t.lakeSurface : t.oceanSurface;
                    spawnWaterSplash(e.x, e.y, waterSurfaceZ + 0.55, 12);
                }
            }

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
                    if (!isSolidAt(Math.floor(nx), Math.floor(e.y), e.z)) {
                        e.x = nx;
                    } else {
                        for (let s = 0.1; s <= 1.1; s += 0.1) {
                            if (!isSolidAt(Math.floor(nx), Math.floor(e.y), e.z + s)) {
                                e.x = nx;
                                e.z += s;
                                break;
                            }
                        }
                    }

                    if (!isSolidAt(Math.floor(e.x), Math.floor(ny), e.z)) {
                        e.y = ny;
                    } else {
                        for (let s = 0.1; s <= 1.1; s += 0.1) {
                            if (!isSolidAt(Math.floor(e.x), Math.floor(ny), e.z + s)) {
                                e.y = ny;
                                e.z += s;
                                break;
                            }
                        }
                    }
                    
                    if (e.bleedOutTimer === undefined && (e.type === 'zombie3d' || e.type === 'zombie')) {
                        e.angle = Math.atan2(player.y - e.y, player.x - e.x);
                    }
                    
                    // Trigger footsteps for all moving enemies
                    let actualDist = Math.hypot(e.x - prevX, e.y - prevY);
                    if (actualDist > 0.001) {
                        if (e.wetTimer > 0 && tickCounter % 4 === 0) {
                            spawnWaterDrip(e.x, e.y, e.z, 1);
                        }
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
                let ex_int = Math.floor(e.x);
                let ey_int = Math.floor(e.y);
                if (!isSolidAt(ex_int, ey_int, e.z - 0.1)) {
                    e.z -= 0.1;
                } else if (isSolidAt(ex_int, ey_int, e.z)) {
                    e.z += 0.5;
                } 
                
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
                // Water splash transition check
                if (a.wetTimer > 0) {
                    a.wetTimer--;
                }
                if (a.inWater === undefined) {
                    a.inWater = (getVoxel(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)) === 2);
                } else {
                    let currInWater = (getVoxel(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)) === 2);
                    if (currInWater !== a.inWater) {
                        if (a.inWater && !currInWater) {
                            a.wetTimer = 60;
                        }
                        a.inWater = currInWater;
                        let t = getTerrainFast(a.x, a.y);
                        let waterSurfaceZ = t.isLake ? t.lakeSurface : t.oceanSurface;
                        spawnWaterSplash(a.x, a.y, waterSurfaceZ + 0.55, 12);
                    }
                }
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
                    if (a.wetTimer > 0 && tickCounter % 5 === 0) {
                        spawnWaterDrip(a.x, a.y, a.z, 1);
                    }
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

    if (player.inVehicle) {
        let v = player.inVehicle;
        let isFlipped = Math.abs(v.roll) > Math.PI / 3 || Math.abs(v.pitch) > Math.PI / 3;
        if (isFlipped) {
            interactTooltip.innerText = "[SPACE] Flip Vehicle";
            interactTooltip.style.display = 'block';
        } else {
            interactTooltip.style.display = 'none';
        }
    } else if (interactTarget && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen && !isPaused) {
        if (vehicles.includes(interactTarget)) {
            let isFlipped = Math.abs(interactTarget.roll) > Math.PI / 3 || Math.abs(interactTarget.pitch) > Math.PI / 3;
            interactTooltip.innerText = isFlipped ? "[E] Flip & Drive Truck" : "[E] Drive Truck";
        }
        else if (interactTarget.rooms) interactTooltip.innerText = "[E] Enter " + interactTarget.emoji; 
        else if (interactTarget.label) interactTooltip.innerText = "[E] " + interactTarget.label; 
        else if (droppedItems.includes(interactTarget)) {
            let details = resolveItemDetails(interactTarget.item);
            interactTooltip.innerText = `[E] Pick up ${details ? details.name : 'Item'}`;
        }
        else interactTooltip.innerText = "[E] Loot";
        interactTooltip.style.display = 'block';
    } else interactTooltip.style.display = 'none';

}
