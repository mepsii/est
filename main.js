// --- Game Helper Functions ---
function getSkyColor(t) {
    const stops = [ [0, 5, 5, 20], [5, 5, 5, 30], [6.5, 255, 120, 80], [8, 135, 206, 235], [18, 135, 206, 235], [19.5, 255, 100, 50], [21, 5, 5, 20], [24, 5, 5, 20] ];
    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i+1][0]) {
            let s1 = stops[i], s2 = stops[i+1];
            let ratio = (t - s1[0]) / (s2[0] - s1[0]);
            return { r: s1[1] + (s2[1] - s1[1]) * ratio, g: s1[2] + (s2[2] - s1[2]) * ratio, b: s1[3] + (s2[3] - s1[3]) * ratio };
        }
    }
    return {r: 135, g: 206, b: 235};
}

function getAmbientLight(t) {
    if (t < 5 || t > 21) return 0.2;
    if (t >= 8 && t <= 18) return 1.0;
    if (t >= 5 && t < 8) return 0.2 + 0.8 * ((t - 5) / 3);
    if (t > 18 && t <= 21) return 1.0 - 0.8 * ((t - 18) / 3);
    return 1.0;
}

function addDamageText(x, y, z, amt) { if(showDebugInfo) damageTexts.push({ x: x + (Math.random()-0.5)*0.5, y: y + (Math.random()-0.5)*0.5, z: z, amt: amt, life: 60 }); }

function getBloodColor(type) { 
    if (type === 'alien' || type === 'experimental') return {r: 51, g: 255, b: 51}; 
    if (type === 'zombie') return {r: 92, g: 64, b: 51};
    if (type === 'animal') return {r: 255, g: 51, b: 51};
    return null; 
}
function spawnBlood(x, y, z, colorObj, count) {
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2, speed = Math.random() * 0.15 + 0.05, vz = Math.random() * 0.15 + 0.05;
        bloodParticles.push({ x: x, y: y, z: z, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: vz, color: colorObj, life: 60 + Math.random() * 30, size: Math.random() * 0.08 + 0.04 });
    }
}

function switchWeapon(id) { currentWeapon = id; weaponEl.innerText = WEAPONS[id].name; fireCooldown = 5; }
function takeDamage(amt) { if (godMode) return; player.hp -= amt; hpEl.innerText = player.hp; damageFlash.style.opacity = '0.5'; setTimeout(() => damageFlash.style.opacity = '0', 100); if (player.hp <= 0) location.reload(); }

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

// --- Update Physics & Logic ---
function update() {
    if (isPaused) return;

    gameTime += (24 / 54000) * timeSpeed; if (gameTime >= 24) gameTime %= 24; 
    if (isDebugOpen && tickCounter % 10 === 0) { dbgTimeEl.value = gameTime; dbgTimeValEl.innerText = gameTime.toFixed(1); }

    if (!godMode) { tickCounter++; if (tickCounter % 120 === 0) { if (player.food > 0) { player.food -= 1; foodEl.innerText = player.food; } else takeDamage(1); } } 
    else { hpEl.innerText = player.hp; foodEl.innerText = player.food; tickCounter++; }

    currentZoom += ((isZooming ? 1.8 : 0.8) - currentZoom) * 0.15;
    
    let tickTime = tickCounter * 0.05;
    for (let c of campfires) {
        let wave1 = Math.sin(tickTime * 1.7 + c.x) * 0.03;
        let wave2 = Math.sin(tickTime * 2.3 + c.y) * 0.03;
        let wave3 = Math.sin(tickTime * 5.1 - c.x) * 0.02;
        c.flicker = 0.85 + wave1 + wave2 + wave3 + (Math.random() > 0.95 ? (Math.random() * 0.08) : 0);
    }

    // Water Swim States
    player.inWater = gameState === 'overworld' && (player.z <= WATER_HEIGHT);
    player.isSubmerged = gameState === 'overworld' && (player.z + player.baseHeight <= WATER_HEIGHT);

    let isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'], isSprinting = isMoving && (keys['ShiftLeft'] || keys['ShiftRight']) && !flightMode && player.stamina > 0;
    if (isSprinting) { if (!infiniteStamina && !godMode) player.stamina = Math.max(0, player.stamina - 0.5); } else { if (player.stamina < 100) player.stamina = Math.min(100, player.stamina + 0.3); }
    staminaEl.innerText = Math.floor(player.stamina);

    let curSpeedMult = speedMult * (isSprinting ? sprintMult : 1.0) * (player.inWater ? 0.5 : 1.0);
    let mv = 0, st = 0;
    if (keys['KeyW']) mv += player.speed * curSpeedMult; if (keys['KeyS']) mv -= player.speed * curSpeedMult;
    if (keys['KeyA']) st -= player.speed * curSpeedMult; if (keys['KeyD']) st += player.speed * curSpeedMult;
    
    // Smooth Camera Stepping Initialization
    player.zOffset = player.zOffset || 0;

    // True 3D Collision Movement with Smooth Auto-Stepping
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

        // Apply smooth visual transition to negate the physical POP
        if (steppedZ > 0) player.zOffset -= steppedZ;

        if (flightMode) { 
            player.vz = 0; 
            if (keys['Space']) player.z += player.speed * speedMult * 1.5; 
            if (keys['ShiftLeft'] || keys['ControlLeft']) player.z -= player.speed * speedMult * 1.5; 
        } else {
            if (player.inWater) {
                player.vz -= 0.002; // Buoyant gravity (sink slowly)
                if (keys['Space']) {
                    if (player.z > WATER_HEIGHT - 1.0) {
                        player.vz = jumpPower * 0.7; // Dolphin Leap out of water
                        keys['Space'] = false;
                    } else {
                        player.vz += 0.008; // Swim upwards
                    }
                }
                player.vz *= 0.9; // Viscous water friction
                
                if (!checkCollision(player.x, player.y, player.z + player.vz)) {
                    player.z += player.vz;
                } else {
                    player.vz = 0; // Hit floor/ceiling while swimming
                }
            } else {
                if (!checkCollision(player.x, player.y, player.z - 0.05)) {
                    player.vz -= 0.015; // fall
                } else {
                    if (player.vz < 0) { player.vz = 0; player.z = Math.ceil(player.z - 0.05) + 0.01; } 
                    if (keys['Space']) { player.vz = jumpPower; keys['Space'] = false; }
                }
                player.z += player.vz;
                if (player.vz > 0 && checkCollision(player.x, player.y, player.z)) {
                    player.z -= player.vz; // Hit roof
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

    // Decay the visual smoothing offset
    player.zOffset *= 0.7;
    if (Math.abs(player.zOffset) < 0.01) player.zOffset = 0;

    for(let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].z += 0.02; damageTexts[i].life--; if(damageTexts[i].life <= 0) damageTexts.splice(i, 1); }
    for(let i = bloodParticles.length - 1; i >= 0; i--) { 
        let b = bloodParticles[i]; b.x += b.vx; b.y += b.vy; b.z += b.vz; b.vz -= 0.02; 
        if (gameState === 'overworld' && getSolid(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))) { b.z = Math.floor(b.z) + 1.02; b.vx = 0; b.vy = 0; b.vz = 0; } 
        b.life--; if (b.life <= 0) bloodParticles.splice(i, 1); 
    }

    if (gameState === 'overworld') {
        let pxC = Math.floor(player.x / CHUNK_SIZE), pyC = Math.floor(player.y / CHUNK_SIZE);
        let updateRad = Math.ceil(VIEW_DIST / CHUNK_SIZE);
        for(let x = pxC - updateRad; x <= pxC + updateRad; x++) for(let y = pyC - updateRad; y <= pyC + updateRad; y++) getMapChunk(x, y);

        let isNight = gameTime < 6 || gameTime >= 19, spawnChance = isNight ? 0.001 : 0.0002;
        if (spawnEnemiesToggle && enemies.length < 20 && Math.random() < spawnChance) { 
            let angle = Math.random() * Math.PI * 2, dist = 20 + Math.random() * 10, ex = player.x + Math.cos(angle) * dist, ey = player.y + Math.sin(angle) * dist;
            let ez = getGridBaseHeight(Math.floor(ex), Math.floor(ey)) + 1;
            if (!getSolid(Math.floor(ex), Math.floor(ey), Math.floor(ez)) && ez > WATER_HEIGHT + 0.5) { // Prevent Underwater Spawns
                let biome = getBiome(ex, ey), alienChance = biome >= 0.65 ? 0.05 : 0.01;
                if (Math.random() < alienChance) { enemies.push({ type: 'experimental', x: ex, y: ey, z: ez, hp: 10, cooldown: 60, size: 1.4, flash: 0 }); } 
                else { let clusterSize = biome < 0.35 ? Math.floor(Math.random() * 3) + 3 : (biome < 0.65 ? Math.floor(Math.random() * 3) + 1 : 1); for (let k = 0; k < clusterSize; k++) { let zx = ex + (Math.random() - 0.5) * 4, zy = ey + (Math.random() - 0.5) * 4; let zez = getGridBaseHeight(Math.floor(zx),Math.floor(zy))+1; if (!getSolid(Math.floor(zx), Math.floor(zy), Math.floor(zez)) && zez > WATER_HEIGHT + 0.5 && enemies.length < 20) enemies.push({ type: 'zombie', x: zx, y: zy, z: zez, hp: 15, cooldown: 60 + Math.random()*30, size: 1.4, flash: 0 }); } }
            }
        }

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            let e = enemies[ei], d = Math.hypot(player.x-e.x, player.y-e.y); 
            if (e.flash && e.flash > 0) e.flash--; if (d > VIEW_DIST * 1.5) { enemies.splice(ei, 1); continue; }
            if (d < 40) { 
                if (d > 0.8) { 
                    let nx = e.x + (player.x-e.x)/d * 0.02, ny = e.y + (player.y-e.y)/d * 0.02;
                    if (!getSolid(Math.floor(nx), Math.floor(e.y), Math.floor(e.z))) e.x = nx;
                    else if (!getSolid(Math.floor(nx), Math.floor(e.y), Math.floor(e.z + 1.1))) { e.x = nx; e.z += 1.1; }

                    if (!getSolid(Math.floor(e.x), Math.floor(ny), Math.floor(e.z))) e.y = ny;
                    else if (!getSolid(Math.floor(e.x), Math.floor(ny), Math.floor(e.z + 1.1))) { e.y = ny; e.z += 1.1; }
                } 
                if (!getSolid(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z - 0.1))) e.z -= 0.1;
                else if (getSolid(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))) e.z += 0.5; 
                
                if (e.type === 'zombie') {
                    if (d < 1.5) { if (--e.cooldown <= 0) { takeDamage(5); e.cooldown = 60; } } else e.cooldown = Math.max(0, e.cooldown - 1);
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

    if (gameState === 'overworld') { for (let c of containers) checkTarget(c, 3.0); for (let a of animals) if (a.dead) checkTarget(a, 3.0); for (let b of buildings) checkTarget(b, 4.0); } 
    else { for (let e of getInteriorEntities()) checkTarget(e, 3.0); }

    if (interactTarget && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen && !isPaused) {
        if (interactTarget.rooms) interactTooltip.innerText = "[E] Enter " + interactTarget.emoji; else if (interactTarget.label) interactTooltip.innerText = "[E] " + interactTarget.label; else interactTooltip.innerText = "[E] Loot";
        interactTooltip.style.display = 'block';
    } else interactTooltip.style.display = 'none';

    if (fireCooldown > 0) fireCooldown--;
    if (isMouseDown && fireCooldown <= 0) {
        const pitchAngle = Math.atan2(player.pitch, canvas.width * currentZoom), w = WEAPONS[currentWeapon];
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
                    hitTarget.obj.hp -= w.dmg; hitTarget.obj.flash = 5; addDamageText(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size, w.dmg);
                    let bCol = getBloodColor(hitTarget.obj.type); if (bCol) spawnBlood(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size * 0.6, bCol, 12);
                    if (hitTarget.obj.hp <= 0) { enemies.splice(enemies.indexOf(hitTarget.obj), 1); score += (hitTarget.obj.type!=='alien'?150:100); scoreEl.innerText = score; }
                } else if (hitTarget.type === 'animal') {
                    hitTarget.obj.hp -= w.dmg; addDamageText(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size, w.dmg);
                    let bCol = getBloodColor('animal'); if (bCol) spawnBlood(hitTarget.obj.x, hitTarget.obj.y, hitTarget.obj.z + hitTarget.obj.size * 0.6, bCol, 12);
                    if (hitTarget.obj.hp <= 0) { hitTarget.obj.dead = true; score += 25; scoreEl.innerText = score; hitTarget.obj.items = new Array(10).fill(null); for(let k=0; k<Math.floor(Math.random()*3)+1; k++) hitTarget.obj.items[k] = { ...hitTarget.obj.drop }; }
                } else if (hitTarget.type === 'static') {
                    let sObj = hitTarget.obj, isTree = TREE_EMOJIS.has(sObj.emoji), isRock = sObj.emoji === '🪨', validHit = false;
                    if (isTree && w.toolType === 'axe') { giveItem({ type: 'resource', emoji: '🪵' }); validHit = true; } else if (isRock && w.toolType === 'pickaxe') { giveItem({ type: 'resource', emoji: '🪨' }); validHit = true; }
                    if (validHit) { sObj.hp -= w.dmg; addDamageText(sObj.wx, sObj.wy, sObj.h + sObj.size, w.dmg); if (sObj.hp <= 0) { destroyedEntities.add(sObj.entKey); hitTarget.chunkArray.splice(hitTarget.index, 1); } }
                }
            } else if ((w.toolType === 'shovel' || w.toolType === 'place') && gameState === 'overworld') {
                let step = 0.2;
                for (let i = 0; i <= w.range / step; i++) {
                    let rx = player.x + Math.cos(player.angle) * Math.cos(pitchAngle) * (i * step);
                    let ry = player.y + Math.sin(player.angle) * Math.cos(pitchAngle) * (i * step);
                    let rz = (player.z + player.baseHeight) + Math.sin(pitchAngle) * (i * step); 
                    
                    if (getSolid(Math.floor(rx), Math.floor(ry), Math.floor(rz))) {
                        let targetX = w.toolType === 'place' ? rx - Math.cos(player.angle)*Math.cos(pitchAngle)*step : rx;
                        let targetY = w.toolType === 'place' ? ry - Math.sin(player.angle)*Math.cos(pitchAngle)*step : ry;
                        let targetZ = w.toolType === 'place' ? rz - Math.sin(pitchAngle)*step : rz;

                        let amt = w.toolType === 'shovel' ? -1 : 1; 
                        modifyTerrain(targetX, targetY, targetZ, 1.4, amt);
                        
                        let pCol = getVoxelColor(Math.floor(targetX), Math.floor(targetY), Math.floor(targetZ));
                        spawnBlood(targetX, targetY, targetZ, pCol, 8); 
                        break;
                    }
                }
            }
            fireCooldown = w.fireRate;
        } else {
            for(let i=0; i<w.count; i++) projectiles.push({ owner: 'player', x: player.x, y: player.y, z: player.z + 1.2, vx: Math.cos(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vy: Math.sin(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vz: Math.sin(pitchAngle) * w.speed, life: 100, dmg: w.dmg });
            fireCooldown = w.fireRate;
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i], prevX = p.x, prevY = p.y, prevZ = p.z;
        p.x += p.vx; p.y += p.vy; p.z += p.vz; p.life--; let hit = gameState === 'overworld' ? getSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) : false;
        if (p.owner === 'player' && gameState === 'overworld') {
            for (let ei = enemies.length - 1; ei >= 0; ei--) { 
                let e = enemies[ei], isLocational = (e.type === 'experimental' || e.type === 'zombie'), rad = isLocational ? 0.4 : 0.6;
                let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, e.x, e.y, e.z, e.size, rad);
                if (hitZ !== false) {
                    if (isLocational) {
                        let relZ = hitZ - e.z, mult = (relZ > e.size * 0.88) ? 2.0 : ((relZ > e.size * 0.72) ? 1.2 : ((relZ > e.size * 0.44) ? 1.0 : 0.5)), totalDmg = p.dmg * mult;
                        e.hp -= totalDmg; hit = true; e.flash = 5; addDamageText(e.x, e.y, hitZ, totalDmg);
                        let bCol = getBloodColor(e.type); if (bCol) spawnBlood(p.x, p.y, hitZ, bCol, mult === 2.0 ? 25 : 8);
                        if (e.hp <= 0) { enemies.splice(ei, 1); score += 150; scoreEl.innerText = score; } break;
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

function render() {
    if (isPaused && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) return;

    // Apply the smoothed camera Z immediately (and bob if submerged)
    let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
    let camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;

    const fov = canvas.width * currentZoom, hY = canvas.height/2 + player.pitch;
    const cosA = Math.cos(player.angle), sinA = Math.sin(player.angle);
    const pitchAngle = Math.atan2(player.pitch, fov);
    const aimX = cosA * Math.cos(pitchAngle), aimY = sinA * Math.cos(pitchAngle), aimZ = Math.sin(pitchAngle);

    renderCount = 0; 
    let sky = getSkyColor(gameTime);
    let ambient = getAmbientLight(gameTime);
    let visibleCampfires = campfires.filter(c => Math.hypot(c.x - player.x, c.y - player.y) < VIEW_DIST);

    ctx.fillStyle = `rgb(${sky.r|0}, ${sky.g|0}, ${sky.b|0})`; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    function project3D(px, py, pz) {
        let dx = px - player.x, dy = py - player.y, dz = pz - camZ;
        let rotX = dx * cosA + dy * sinA;
        if (rotX < 0.1) return null; 
        let rotY = dx * -sinA + dy * cosA;
        let sx = canvas.width/2 + (rotY / rotX) * fov;
        let sy = hY - (dz / rotX) * fov;
        return { sx, sy, depth: rotX };
    }

    if (gameState === 'overworld') {
        let pCx = Math.floor(player.x / CHUNK_SIZE), pCy = Math.floor(player.y / CHUNK_SIZE);
        let chunkRadius = Math.ceil(VIEW_DIST / CHUNK_SIZE);
        
        for (let cx = pCx - chunkRadius; cx <= pCx + chunkRadius; cx++) {
            for (let cy = pCy - chunkRadius; cy <= pCy + chunkRadius; cy++) {
                let dx = cx * CHUNK_SIZE + CHUNK_SIZE/2 - player.x, dy = cy * CHUNK_SIZE + CHUNK_SIZE/2 - player.y;
                if (dx * cosA + dy * sinA < -CHUNK_SIZE*1.5) continue; 
                
                let faces = getChunkMesh(cx, cy);
                for (let i = 0; i < faces.length; i++) {
                    let f = faces[i];

                    // Determine TRUE smoothed centroid instead of flat grid block centers
                    let cX = (f.pts[0].x + f.pts[1].x + f.pts[2].x + f.pts[3].x) / 4;
                    let cY = (f.pts[0].y + f.pts[1].y + f.pts[2].y + f.pts[3].y) / 4;
                    let cZ = (f.pts[0].z + f.pts[1].z + f.pts[2].z + f.pts[3].z) / 4;

                    let dX = cX - player.x, dY = cY - player.y, dZ = cZ - camZ;
                    let rotX = dX * cosA + dY * sinA;
                    
                    if (rotX > -2 && rotX < VIEW_DIST) { 
                        // Compute exact polygon face normal via Cross-Product to prevent warped culling
                        let ux = f.pts[1].x - f.pts[0].x, uy = f.pts[1].y - f.pts[0].y, uz = f.pts[1].z - f.pts[0].z;
                        let wx = f.pts[2].x - f.pts[0].x, wy = f.pts[2].y - f.pts[0].y, wz = f.pts[2].z - f.pts[0].z;
                        let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;

                        // Precise Backface Culling (unless it is water surface from below)
                        if (dX * nx + dY * ny + dZ * nz > 0 && !f.isWater) continue;
                        
                        let distSq = dX*dX + dY*dY + dZ*dZ; // Exact distance sorting fixes Z-fighting
                        if (distSq < VIEW_DIST*VIEW_DIST) {
                            let o = getRenderItem(); o.type = 'face'; o.face = f; o.depthSq = distSq;
                            o.wX = cX; o.wY = cY; o.h = cZ; // Save exact point for lighting
                        }
                    }
                }
                
                let chunk = getMapChunk(cx, cy);
                for (let i = 0; i < chunk.length; i++) {
                    let obj = chunk[i], dX = obj.wx - player.x, dY = obj.wy - player.y, rotX = dX * cosA + dY * sinA;
                    if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dX * -sinA + dY * cosA) < (rotX * 2.0) / currentZoom) {
                        let o = getRenderItem(); o.type = obj.type; o.emoji = obj.emoji; o.size = obj.size; o.hp = obj.hp; o.depthSq = rotX*rotX; o.h = obj.h; o.wX = obj.wx; o.wY = obj.wy;
                    }
                }
            }
        }
        
        for (let e of enemies) { let rotX = (e.x-player.x)*cosA + (e.y-player.y)*sinA; if (rotX > 0.2 && rotX < VIEW_DIST) { let o = getRenderItem(); o.hp = e.hp; o.flash = e.flash; o.depthSq = rotX*rotX; o.size = e.size; o.h = e.z; o.wX = e.x; o.wY = e.y; if (e.type === 'experimental' || e.type === 'zombie') { o.type = 'locationalEnemy'; o.obj = e; } else { o.type = 'emoji'; o.emoji = e.emoji || '👽'; } } }
        for (let c of campfires) { let rotX = (c.x-player.x)*cosA + (c.y-player.y)*sinA; if (rotX > 0.2 && rotX < VIEW_DIST) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = c.emoji; o.size = c.size; o.depthSq = rotX*rotX; o.h = c.z; o.wX = c.x; o.wY = c.y; if (ambient < 1.0) { let g = getRenderItem(); g.type = 'campfireBloom'; g.depthSq = rotX*rotX - 0.1; g.h = c.z; g.flicker = c.flicker; g.size = c.size; g.wX = c.x; g.wY = c.y;} } }
        for (let e of containers) { let rotX = (e.x-player.x)*cosA + (e.y-player.y)*sinA; if (rotX > 0.2 && rotX < VIEW_DIST) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y; } }
        for (let e of animals) { let rotX = (e.x-player.x)*cosA + (e.y-player.y)*sinA; if (rotX > 0.2 && rotX < VIEW_DIST) { let o = getRenderItem(); o.type = 'animal'; o.emoji = e.emoji; o.size = e.size; o.hp = (!e.dead ? e.hp : undefined); o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.dead = e.dead; o.wX = e.x; o.wY = e.y; } }
        for (let b of buildings) { let rotX = (b.x-player.x)*cosA + (b.y-player.y)*sinA; if (rotX > 0.2 && rotX < VIEW_DIST) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = b.emoji; o.size = 4.5; o.depthSq = rotX*rotX; o.h = b.z; o.targeted = b === interactTarget; o.wX = b.x; o.wY = b.y; } }
        for (let d of damageTexts) { let rotX = (d.x-player.x)*cosA + (d.y-player.y)*sinA; if (rotX > 0.2 && rotX < VIEW_DIST) { let o = getRenderItem(); o.type = 'dmgText'; o.text = Math.round(d.amt*10)/10; o.depthSq = rotX*rotX; o.h = d.z; o.life = d.life; o.wX = d.x; o.wY = d.y;} }
        for (let b of bloodParticles) { let rotX = (b.x-player.x)*cosA + (b.y-player.y)*sinA; if (rotX > 0.1 && rotX < VIEW_DIST) { let o = getRenderItem(); o.type = 'blood'; o.color = b.color; o.size = b.size; o.depthSq = rotX*rotX; o.h = b.z; o.life = b.life; o.wX = b.x; o.wY = b.y;} }
    } else {
        ctx.fillStyle = '#0a0d04'; ctx.fillRect(0, 0, canvas.width, hY); ctx.fillStyle = patternArmyGreenFloor; ctx.fillRect(0, Math.max(0, hY), canvas.width, canvas.height - Math.max(0, hY));
        let interiorEnts = getInteriorEntities();
        for (let e of interiorEnts) { let rotX = (e.x-player.x)*cosA + (e.y-player.y)*sinA; if (rotX > 0.2) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y; } }
        let walls = getInteriorWalls();
        for (let w of walls) {
            if (w.pts) {
                let rotX = (w.pts[0].x-player.x)*cosA + (w.pts[0].y-player.y)*sinA; if (rotX > 0.1) { let o = getRenderItem(); o.type = 'wallPoly'; o.pts = w.pts; o.color = w.color; o.depthSq = rotX*rotX; }
            } else {
                let r1 = (w.p1.x-player.x)*cosA + (w.p1.y-player.y)*sinA, r2 = (w.p2.x-player.x)*cosA + (w.p2.y-player.y)*sinA;
                if (r1 > 0.1 || r2 > 0.1) { let o = getRenderItem(); o.type = 'wall'; o.p1 = w.p1; o.p2 = w.p2; o.color = w.color; o.depthSq = Math.min(r1, r2)**2; }
            }
        }
    }

    for (let p of projectiles) { let rotX = (p.x-player.x)*cosA + (p.y-player.y)*sinA; if (rotX > 0.1 && rotX < VIEW_DIST) { let o = getRenderItem(); o.type = 'bullet'; o.owner = p.owner; o.depthSq = rotX*rotX; o.h = p.z; o.wX = p.x; o.wY = p.y;} }

    activeRenderList.length = renderCount;
    for(let i=0; i < renderCount; i++) activeRenderList[i] = renderPool[i];
    activeRenderList.sort((a,b) => b.depthSq - a.depthSq); 

    if (_lastAlign !== 'center') { ctx.textAlign = 'center'; _lastAlign = 'center'; }
    ctx.lineJoin = 'round'; 

    for (let i = 0; i < activeRenderList.length; i++) {
        let o = activeRenderList[i];
        
        let objLight = gameState === 'overworld' ? ambient : 1.0;
        let depth = Math.sqrt(o.depthSq);
        
        // Use true exact height calculated for caves shading
        let isUnderground = o.type === 'face' ? (o.h < getGridBaseHeight(Math.floor(o.wX), Math.floor(o.wY)) - 2) : false;
        if (isUnderground && !o.face.isWater) objLight = 0.05; 

        if (objLight < 1.0 && o.type !== 'campfireBloom') {
            let lightIntensity = 0;
            let cx = o.wX;
            let cy = o.wY;
            let cz = o.type === 'face' ? o.h : o.h + (o.size?o.size/2:0);
            
            if (isFlashlightOn) {
                let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ; 
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (dist > 0.1 && dist < 45) {
                    let dot = (dx/dist)*aimX + (dy/dist)*aimY + (dz/dist)*aimZ; 
                    if (dot > 0.90) { 
                        let att = (Math.max(0, (dot - 0.98) / 0.02) * 0.6 + Math.pow(Math.max(0, (dot - 0.90) / 0.08), 2.0) * 0.4) * Math.pow(1 - dist/45, 2);
                        lightIntensity += att * 1.5;
                    }
                }
            }
            for (let c of visibleCampfires) {
                let dist = Math.hypot(cx - c.x, cy - c.y, cz - c.z); 
                if (dist < 22) { lightIntensity += Math.pow(1 - dist/22, 2.5) * c.flicker * 1.5; }
            }
            objLight = Math.min(1.0, objLight + lightIntensity);
        }

        if (o.type === 'face' || o.type === 'wallPoly') {
            let f = o.type === 'face' ? o.face : o;
            
            let camPts =[];
            for (let k = 0; k < 4; k++) {
                let dx = f.pts[k].x - player.x, dy = f.pts[k].y - player.y, dz = f.pts[k].z - camZ;
                camPts.push({
                    cx: dx * -sinA + dy * cosA,
                    cy: dz,
                    cz: dx * cosA + dy * sinA 
                });
            }

            let clipped =[];
            let zNear = 0.1;
            for(let j=0; j<camPts.length; j++) {
                let p1 = camPts[j], p2 = camPts[(j+1)%camPts.length];
                if(p1.cz >= zNear) clipped.push(p1);
                if((p1.cz >= zNear) !== (p2.cz >= zNear)) {
                    let t = (zNear - p1.cz) / (p2.cz - p1.cz);
                    clipped.push({
                        cx: p1.cx + t * (p2.cx - p1.cx),
                        cy: p1.cy + t * (p2.cy - p1.cy),
                        cz: zNear
                    });
                }
            }
            
            if (clipped.length < 3) continue; 

            if (o.type === 'face') {
                let shade = f.shade * objLight;
                let fr = f.col.r * shade | 0, fg = f.col.g * shade | 0, fb = f.col.b * shade | 0;

                // Underwater Dense Blue Fog Filter
                if (player.isSubmerged) {
                    let wFog = Math.min(1, depth / (VIEW_DIST * 0.6));
                    fr = fr * (1 - wFog) + 15 * wFog | 0; 
                    fg = fg * (1 - wFog) + 50 * wFog | 0; 
                    fb = fb * (1 - wFog) + 120 * wFog | 0;
                } else {
                    let fog = Math.min(1, depth / VIEW_DIST);
                    fr = fr * (1 - fog) + sky.r * fog | 0; 
                    fg = fg * (1 - fog) + sky.g * fog | 0; 
                    fb = fb * (1 - fog) + sky.b * fog | 0;
                }

                // Transparent faces support
                if (f.col.a !== undefined) {
                    ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${f.col.a})`;
                    ctx.strokeStyle = ctx.fillStyle; // Prevent edge gaps on water
                } else {
                    ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`;
                    ctx.strokeStyle = ctx.fillStyle; 
                }
            } else {
                ctx.fillStyle = f.color; ctx.strokeStyle = '#000';
            }
            
            // Eliminates sky-blue lines tearing between faces entirely!
            ctx.lineWidth = 2.0; 
            ctx.beginPath();
            for (let j = 0; j < clipped.length; j++) {
                let sx = canvas.width/2 + (clipped[j].cx / clipped[j].cz) * fov;
                let sy = hY - (clipped[j].cy / clipped[j].cz) * fov;
                if (j===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
            
        } else if (o.type === 'wall') {
            let p1 = project3D(o.p1.x, o.p1.y, 0), p2 = project3D(o.p2.x, o.p2.y, 0), p3 = project3D(o.p2.x, o.p2.y, activeBuilding.wallH), p4 = project3D(o.p1.x, o.p1.y, activeBuilding.wallH);
            if (p1 && p2 && p3 && p4) { ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        } else {
            let p = project3D(o.wX, o.wY, o.h);
            if (!p) continue;
            let sx = p.sx, sy = p.sy, sz = (fov/depth)*o.size; 
            
            if (o.type === 'campfireBloom') {
                let f = o.flicker, flameCenterY = sy - (0.4 * o.size / depth) * fov; 
                let distFade = Math.min(1, 40 / depth); 
                ctx.globalCompositeOperation = 'lighter';
                let airRad = (15.0 * o.size / depth) * fov;
                ctx.save(); ctx.translate(sx, flameCenterY); 
                let aGrad = ctx.createRadialGradient(0,0,0, 0,0, airRad);
                let aAlpha = 0.15 * f * (1 - objLight) * distFade; 
                aGrad.addColorStop(0, `rgba(255, 140, 50, ${aAlpha})`); aGrad.addColorStop(0.3, `rgba(255, 80, 20, ${aAlpha * 0.5})`); aGrad.addColorStop(1, `rgba(150, 10, 0, 0)`);
                ctx.fillStyle = aGrad; ctx.fillRect(-airRad, -airRad, airRad*2, airRad*2); ctx.restore();
                ctx.globalCompositeOperation = 'source-over';
            } else if (o.type === 'locationalEnemy') {
                let e = o.obj, isFlash = e.flash > 0, isZombie = e.type === 'zombie';
                let legH = sz * 0.44, abdH = sz * 0.28, chestH = sz * 0.16, headR = sz * 0.12;
                let topLegs = sy - legH, topAbd = topLegs - abdH, topChest = topAbd - chestH;
                
                let color1 = isFlash ? 'white' : (isZombie ? `rgb(${30*objLight|0},${86*objLight|0},${34*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                let color2 = isFlash ? 'white' : (isZombie ? `rgb(${46*objLight|0},${125*objLight|0},${50*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                
                ctx.fillStyle = color1; ctx.fillRect(sx - (sz * 0.20)/2, topLegs, sz * 0.20, legH);
                ctx.fillStyle = color2; ctx.fillRect(sx - (sz * 0.18)/2, topAbd, sz * 0.18, abdH + chestH);
                const headSprite = SpriteCache.get(isZombie ? '🧟' : '👽', isFlash, false, objLight);
                let headScale = (headR * 2) / 128;
                ctx.drawImage(headSprite, sx - (headSprite.width*headScale)/2, (topChest - headR/2) - (headSprite.height - 20) * headScale, headSprite.width * headScale, headSprite.height * headScale);
            } else if (o.type === 'dmgText') {
                ctx.fillStyle = `rgba(255, 50, 50, ${o.life/60})`; let df = 'bold ' + Math.max(12, 24/depth) + 'px sans-serif';
                if (_lastFont !== df) { ctx.font = df; _lastFont = df; } if (_lastBaseline !== 'middle') { ctx.textBaseline = 'middle'; _lastBaseline = 'middle'; }
                ctx.fillText(o.text, sx, sy);
            } else if (o.type === 'blood') {
                let bsz = Math.max(2, (fov/depth) * o.size);
                ctx.fillStyle = `rgba(${o.color.r * objLight | 0}, ${o.color.g * objLight | 0}, ${o.color.b * objLight | 0}, ${Math.min(1.0, o.life / 20.0)})`;
                ctx.fillRect(sx - bsz/2, sy - bsz/2, bsz, bsz);
            } else if (o.type === 'emoji' || o.type === 'animal') {
                const sprite = SpriteCache.get(o.emoji, o.targeted || (o.flash > 0), o.dead, objLight);
                let scale = sz / 128;
                ctx.drawImage(sprite, sx - (sprite.width/2)*scale, sy - (sprite.height - 20)*scale, sprite.width * scale, sprite.height * scale);
            } else {
                ctx.fillStyle = o.owner==='player'?'#ff0':'#f33'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, 15/depth), 0, 7); ctx.fill();
            }
        }
    }

    ctx.strokeStyle = fireCooldown > 0 ? 'red' : 'white'; ctx.lineWidth = isZooming?1:2; ctx.beginPath(); let cs = isZooming?4:8;
    ctx.moveTo(canvas.width/2-cs, hY-player.pitch); ctx.lineTo(canvas.width/2+cs, hY-player.pitch);
    ctx.moveTo(canvas.width/2, hY-player.pitch-cs); ctx.lineTo(canvas.width/2, hY-player.pitch+cs); ctx.stroke();

    // The Submerged Screen Tint
    if (player.isSubmerged) {
        ctx.fillStyle = 'rgba(10, 50, 130, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// Add the mouse move event hook here at the bottom of main for the new aiming constraints
document.addEventListener('mousemove', (e) => { 
    if (!isPaused) { 
        player.angle += e.movementX * (isZooming ? 0.001 : 0.003); 
        
        // Extended pitch bounds allows almost completely straight down aiming
        let maxPitch = canvas.height * 2.5; 
        player.pitch -= e.movementY * (isZooming ? 0.5 : 1.5); 
        player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch)); 
    } 
});

function loop() { update(); render(); requestAnimationFrame(loop); }
loop();