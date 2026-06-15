//THIS IS projectiles.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

function updateProjectiles() {
    if (fireCooldown > 0) fireCooldown--;

    if (miningProgress > 0) {
        miningResetTimer--;
        if (miningResetTimer <= 0) {
            miningProgress = 0;
            miningTarget = null;
            if (typeof updateMiningProgressUI === 'function') updateMiningProgressUI();
        }
    }

    if (isMouseDown && fireCooldown <= 0 && (!player.inVehicle || player.vehicleView === '1st')) {
        let activeItem = inventory[hotbarSelection];
        let w = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;

        if (w) {
            const pitchAngle = player.pitch;
            if (w.isMelee) {
                let hitTarget = null;
                if (gameState === 'overworld') {
                    let minT = Infinity;
                    let hitLimb = null;
                    let hitEnemyIndex = -1;
                    let hitAnimalIndex = -1;

                    // Set up melee segment from player eye height in player look direction
                    let pitchAngle = player.pitch;
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
                        if (isTree && w.toolType === 'axe') {
                            validHit = true;
                        } else if (isRock && w.toolType === 'pickaxe') {
                            validHit = true;
                        }

                        if (validHit) {
                            if (instantBreak) {
                                sObj.hp = 0; // Break instantly!
                                addDamageText(sObj.wx, sObj.wy, sObj.h + sObj.size, w.dmg);
                                let pCol = isTree ? { r: 120, g: 80, b: 40 } : { r: 140, g: 140, b: 140 };
                                spawnBlockParticles(sObj.wx, sObj.wy, sObj.h + sObj.size * 0.5, pCol, 8);
                                
                                if (isTree) {
                                    spawnDroppedItemAt({ type: 'resource', emoji: '🪵', count: 1 }, sObj.wx, sObj.wy, sObj.h + sObj.size * 0.5);
                                } else {
                                    spawnDroppedItemAt({ type: 'resource', emoji: '🪨', count: 1 }, sObj.wx, sObj.wy, sObj.h + sObj.size * 0.5);
                                }

                                if (sObj.hp <= 0) {
                                    destroyedEntities.add(sObj.entKey);
                                    hitTarget.chunkArray.splice(hitTarget.index, 1);
                                    
                                    let [ex, ey] = sObj.entKey.split(',').map(Number);
                                    let ecx = Math.floor(ex / CHUNK_SIZE);
                                    let ecy = Math.floor(ey / CHUNK_SIZE);
                                    let chunkKey = `${ecx},${ecy}`;
                                    if (typeof threeChunks !== 'undefined' && threeChunks.has(chunkKey)) {
                                        let cached = threeChunks.get(chunkKey);
                                        if (cached.entities) {
                                            for (let sprite of cached.entities) {
                                                if (sprite instanceof THREE.Object3D) {
                                                    scene.remove(sprite);
                                                }
                                            }
                                        }
                                        threeChunks.delete(chunkKey);
                                    }
                                }
                            } else {
                                if (!sObj.maxHp) {
                                    let randomHits = Math.floor(Math.random() * 3) + 2; // 2, 3, or 4 hits
                                    sObj.maxHp = randomHits * w.dmg;
                                    sObj.hp = sObj.maxHp;
                                }
                                
                                let isSame = false;
                                if (miningTarget && miningTarget.isStatic && miningTarget.sObj === sObj) {
                                    isSame = true;
                                }
                                
                                if (isSame) {
                                    sObj.hp -= w.dmg;
                                } else {
                                    sObj.hp -= w.dmg;
                                    miningTarget = {
                                        isStatic: true,
                                        sObj: sObj,
                                        pos: { x: sObj.wx, y: sObj.wy, z: sObj.h },
                                        w: w
                                    };
                                }
                                
                                miningResetTimer = 90;
                                
                                addDamageText(sObj.wx, sObj.wy, sObj.h + sObj.size, w.dmg);
                                let pCol = isTree ? { r: 120, g: 80, b: 40 } : { r: 140, g: 140, b: 140 };
                                spawnBlockParticles(sObj.wx, sObj.wy, sObj.h + sObj.size * 0.5, pCol, 3);
                                
                                if (isTree) {
                                    spawnDroppedItemAt({ type: 'resource', emoji: '🪵', count: 1 }, sObj.wx, sObj.wy, sObj.h + sObj.size * 0.5);
                                } else {
                                    spawnDroppedItemAt({ type: 'resource', emoji: '🪨', count: 1 }, sObj.wx, sObj.wy, sObj.h + sObj.size * 0.5);
                                }
                                
                                let dmgPct = Math.max(0, Math.min(1.0, (sObj.maxHp - sObj.hp) / sObj.maxHp));
                                miningProgress = Math.round(dmgPct * maxMiningClicks);
                                if (miningProgress <= 0 && sObj.hp > 0) miningProgress = 1;
                                
                                if (sObj.hp <= 0) {
                                    destroyedEntities.add(sObj.entKey);
                                    hitTarget.chunkArray.splice(hitTarget.index, 1);
                                    
                                    let [ex, ey] = sObj.entKey.split(',').map(Number);
                                    let ecx = Math.floor(ex / CHUNK_SIZE);
                                    let ecy = Math.floor(ey / CHUNK_SIZE);
                                    let chunkKey = `${ecx},${ecy}`;
                                    if (typeof threeChunks !== 'undefined' && threeChunks.has(chunkKey)) {
                                        let cached = threeChunks.get(chunkKey);
                                        if (cached.entities) {
                                            for (let sprite of cached.entities) {
                                                if (sprite instanceof THREE.Object3D) {
                                                    scene.remove(sprite);
                                                }
                                            }
                                        }
                                        threeChunks.delete(chunkKey);
                                    }
                                    miningProgress = 0;
                                    miningTarget = null;
                                }
                                
                                if (typeof updateMiningProgressUI === 'function') {
                                    updateMiningProgressUI();
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

                        if (isPlace || instantBreak) {
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
                        } else {
                            // Progressive mining block breaking
                            let clickPos = { x: targetX, y: targetY, z: targetZ };
                            let isSame = false;
                            
                            if (miningTarget) {
                                let dist = Math.hypot(clickPos.x - miningTarget.pos.x, clickPos.y - miningTarget.pos.y, clickPos.z - miningTarget.pos.z);
                                if (dist <= 1.8) {
                                    isSame = true;
                                }
                            }
                            
                            if (isSame) {
                                miningProgress++;
                            } else {
                                miningProgress = 1;
                                miningTarget = {
                                    pos: clickPos,
                                    mx: mx,
                                    my: my,
                                    mz: mz,
                                    rad: rad,
                                    amt: amt,
                                    w: w
                                };
                            }
                            
                            miningResetTimer = 90;
                            
                            let pCol = getVoxelColor(Math.floor(targetX), Math.floor(targetY), Math.floor(targetZ));
                            // Spawn fewer particles on partial hits
                            spawnBlood(targetX, targetY, targetZ, pCol, 2);
                            
                            if (miningProgress >= maxMiningClicks) {
                                // Break the block!
                                modifyTerrain(miningTarget.mx, miningTarget.my, miningTarget.mz, miningTarget.rad, miningTarget.amt);
                                spawnBlood(miningTarget.pos.x, miningTarget.pos.y, miningTarget.pos.z, pCol, 8);
                                miningProgress = 0;
                                miningTarget = null;
                            }
                            
                            if (typeof updateMiningProgressUI === 'function') {
                                updateMiningProgressUI();
                            }
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
                for(let i=0; i<w.count; i++) projectiles.push({ owner: 'player', x: player.x, y: player.y, z: camZ, vx: Math.cos(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vy: Math.sin(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vz: Math.sin(pitchAngle) * w.speed, life: 100, dmg: w.dmg, weaponId: activeItem ? activeItem.id : null });
                
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
        p.x += p.vx; p.y += p.vy; p.z += p.vz; p.life--; 
        let hit = gameState === 'overworld' ? getSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) : false;
        if (hit) {
            let vCurr = getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
            if (vCurr !== 2) {
                let col = getVoxelColor(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
                spawnBlockParticles(p.x, p.y, p.z, col, 8);
            }
        }
        
        // Water impact check
        if (gameState === 'overworld' && !hit) {
            let vPrev = getVoxel(Math.floor(prevX), Math.floor(prevY), Math.floor(prevZ));
            let vCurr = getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
            if (vPrev !== 2 && vCurr === 2) {
                let t = getTerrainFast(p.x, p.y);
                let waterSurfaceZ = t.isLake ? t.lakeSurface : t.oceanSurface;
                let visualWaterZ = waterSurfaceZ + 0.45;
                
                // Precise intersection point interpolation
                let dz = p.z - prevZ;
                let lerpRatio = 0.5;
                if (Math.abs(dz) > 0.0001) {
                    lerpRatio = Math.max(0, Math.min(1, (visualWaterZ - prevZ) / dz));
                }
                let hitX = prevX + (p.x - prevX) * lerpRatio;
                let hitY = prevY + (p.y - prevY) * lerpRatio;
                
                spawnWaterSplash(hitX, hitY, visualWaterZ + 0.10, 8, true);
                hit = true;
            }
        }
        if (p.owner === 'player' && gameState === 'overworld') {
            let minT = Infinity;
            let hitLimb = null;
            let hitEnemyIndex = -1;
            let hitAnimalIndex = -1;
            let hitStaticObj = null;
            let hitStaticIndex = -1;
            let hitStaticChunk = null;

            let pCx = Math.floor(p.x / CHUNK_SIZE), pCy = Math.floor(p.y / CHUNK_SIZE);
            for(let cx = pCx - 1; cx <= pCx + 1; cx++) {
                for(let cy = pCy - 1; cy <= pCy + 1; cy++) {
                    let chunk = getMapChunk(cx, cy);
                    for(let i=0; i<chunk.length; i++) {
                        let cObj = chunk[i];
                        if (cObj.hp !== undefined) {
                            let isTree = TREE_EMOJIS.has(cObj.emoji);
                            let isRock = cObj.emoji === '🪨';
                            let isCactus = cObj.emoji === '🌵';
                            if (isTree || isRock || isCactus) {
                                let rad = isTree ? cObj.size * 0.25 : (isRock ? cObj.size * 0.45 : cObj.size * 0.3);
                                let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, cObj.wx, cObj.wy, cObj.h, cObj.size, rad);
                                if (hitZ !== false) {
                                    let t = 0.5;
                                    if (p.z !== prevZ) {
                                        t = (hitZ - prevZ) / (p.z - prevZ);
                                    }
                                    if (t < minT) {
                                        minT = t;
                                        hitLimb = null;
                                        hitEnemyIndex = -1;
                                        hitAnimalIndex = -1;
                                        hitStaticObj = cObj;
                                        hitStaticIndex = i;
                                        hitStaticChunk = chunk;
                                    }
                                }
                            }
                        }
                    }
                }
            }

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
                } else if (hitStaticObj) {
                    let sObj = hitStaticObj;
                    let isTree = TREE_EMOJIS.has(sObj.emoji);
                    let isRock = sObj.emoji === '🪨';
                    let isCactus = sObj.emoji === '🌵';
                    let pCol = isTree ? { r: 120, g: 80, b: 40 } : (isRock ? { r: 140, g: 140, b: 140 } : { r: 50, g: 130, b: 50 });
                    spawnBlockParticles(hitX, hitY, hitZ, pCol, 8);
                    
                    let canDamage = (isRock && sObj.size < 0.5) || (isCactus && p.weaponId === 'shotgun');
                    if (canDamage) {
                        sObj.hp -= p.dmg;
                        addDamageText(sObj.wx, sObj.wy, sObj.h + sObj.size, p.dmg);
                        
                        if (sObj.hp <= 0) {
                            destroyedEntities.add(sObj.entKey);
                            hitStaticChunk.splice(hitStaticIndex, 1);
                            
                            let [ex, ey] = sObj.entKey.split(',').map(Number);
                            let ecx = Math.floor(ex / CHUNK_SIZE);
                            let ecy = Math.floor(ey / CHUNK_SIZE);
                            let chunkKey = `${ecx},${ecy}`;
                            if (typeof threeChunks !== 'undefined' && threeChunks.has(chunkKey)) {
                                let cached = threeChunks.get(chunkKey);
                                if (cached.entities) {
                                    for (let sprite of cached.entities) {
                                        if (sprite instanceof THREE.Object3D) {
                                            scene.remove(sprite);
                                        }
                                    }
                                }
                                threeChunks.delete(chunkKey);
                            }
                        }
                    }
                }
            }
        } else if (p.owner === 'enemy') { let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, player.x, player.y, player.z, 1.6, 0.4); if (hitZ !== false) { takeDamage(p.dmg); hit = true; } }
        if (hit || p.life <= 0) projectiles.splice(i, 1);
    }
}
