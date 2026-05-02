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

// Initialize player Z height
player.z = getElevation(0, 0) + player.baseHeight;

// --- Update Physics & Logic ---
function update() {
    if (isPaused) return;

    gameTime += (24 / 54000) * timeSpeed; if (gameTime >= 24) gameTime %= 24; 
    if (isDebugOpen && tickCounter % 10 === 0) { dbgTimeEl.value = gameTime; dbgTimeValEl.innerText = gameTime.toFixed(1); }

    if (!godMode) { tickCounter++; if (tickCounter % 120 === 0) { if (player.food > 0) { player.food -= 1; foodEl.innerText = player.food; } else takeDamage(1); } } 
    else { hpEl.innerText = player.hp; foodEl.innerText = player.food; tickCounter++; }

    currentZoom += ((isZooming ? 1.8 : 0.8) - currentZoom) * 0.15;
    
    // Snappy Natural Campfire Flicker
    let tickTime = tickCounter * 0.05;
    for (let c of campfires) {
        let wave1 = Math.sin(tickTime * 1.7 + c.x) * 0.03;
        let wave2 = Math.sin(tickTime * 2.3 + c.y) * 0.03;
        let wave3 = Math.sin(tickTime * 5.1 - c.x) * 0.02;
        let pop = Math.random() > 0.95 ? (Math.random() * 0.08) : 0; 
        c.flicker = 0.85 + wave1 + wave2 + wave3 + pop;
    }

    let isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'], isSprinting = isMoving && (keys['ShiftLeft'] || keys['ShiftRight']) && !flightMode && player.stamina > 0;
    if (isSprinting) { if (!infiniteStamina && !godMode) player.stamina = Math.max(0, player.stamina - 0.5); } else { if (player.stamina < 100) player.stamina = Math.min(100, player.stamina + 0.3); }
    staminaEl.innerText = Math.floor(player.stamina);

    let curSpeedMult = speedMult * (isSprinting ? sprintMult : 1.0), mv = 0, st = 0;
    if (keys['KeyW']) mv += player.speed * curSpeedMult; if (keys['KeyS']) mv -= player.speed * curSpeedMult;
    if (keys['KeyA']) st -= player.speed * curSpeedMult; if (keys['KeyD']) st += player.speed * curSpeedMult;
    
    let nx = player.x + Math.cos(player.angle) * mv + Math.cos(player.angle + 1.57) * st, ny = player.y + Math.sin(player.angle) * mv + Math.sin(player.angle + 1.57) * st;
    if (noclip || !isSolid(nx, ny)) { player.x = nx; player.y = ny; }

    let floorZ = (gameState === 'overworld') ? getElevation(player.x, player.y) : 0, groundZ = floorZ + player.baseHeight;

    if (flightMode) { player.vz = 0; if (keys['Space']) player.z += player.speed * speedMult * 1.5; if (keys['ShiftLeft'] || keys['ControlLeft']) player.z -= player.speed * speedMult * 1.5; } 
    else { player.vz -= 0.02; player.z += player.vz; if (player.z <= groundZ) { player.vz = 0; player.z += (groundZ - player.z) * 0.3; if (Math.abs(player.z - groundZ) < 0.01) player.z = groundZ; if (keys['Space']) { player.vz = jumpPower; keys['Space'] = false; } } }
    
    for(let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].z += 0.02; damageTexts[i].life--; if(damageTexts[i].life <= 0) damageTexts.splice(i, 1); }
    for(let i = bloodParticles.length - 1; i >= 0; i--) { let b = bloodParticles[i]; b.x += b.vx; b.y += b.vy; b.z += b.vz; b.vz -= 0.02; let gZ = gameState === 'overworld' ? getElevation(b.x, b.y) : 0; if (b.z <= gZ) { b.z = gZ + 0.02; b.vx = 0; b.vy = 0; b.vz = 0; } b.life--; if (b.life <= 0) bloodParticles.splice(i, 1); }

    if (gameState === 'overworld') {
        let pxC = Math.floor(player.x / MAP_CHUNK_SIZE), pyC = Math.floor(player.y / MAP_CHUNK_SIZE);
        for(let x=pxC-2; x<=pxC+2; x++) for(let y=pyC-2; y<=pyC+2; y++) getMapChunk(x,y);

        let isNight = gameTime < 6 || gameTime >= 19, spawnChance = isNight ? 0.001 : 0.0002;
        if (spawnEnemiesToggle && enemies.length < 20 && Math.random() < spawnChance) { 
            let angle = Math.random() * Math.PI * 2, dist = 25 + Math.random() * 15, ex = player.x + Math.cos(angle) * dist, ey = player.y + Math.sin(angle) * dist;
            if (!isSolid(ex, ey)) {
                let biome = getBiome(ex, ey), alienChance = biome >= 0.65 ? 0.05 : 0.01;
                if (Math.random() < alienChance) { enemies.push({ type: 'experimental', x: ex, y: ey, z: getElevation(ex, ey), hp: 10, cooldown: 60, size: 1.4, flash: 0 }); } 
                else { let clusterSize = biome < 0.35 ? Math.floor(Math.random() * 3) + 3 : (biome < 0.65 ? Math.floor(Math.random() * 3) + 1 : 1); for (let k = 0; k < clusterSize; k++) { let zx = ex + (Math.random() - 0.5) * 4, zy = ey + (Math.random() - 0.5) * 4; if (!isSolid(zx, zy) && enemies.length < 20) enemies.push({ type: 'zombie', x: zx, y: zy, z: getElevation(zx, zy), hp: 15, cooldown: 60 + Math.random()*30, size: 1.4, flash: 0 }); } }
            }
        }

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            let e = enemies[ei], d = Math.hypot(player.x-e.x, player.y-e.y); 
            if (e.flash && e.flash > 0) e.flash--; if (d > VIEW_DIST * 1.5) { enemies.splice(ei, 1); continue; }
            if (d < 40) { 
                if (e.type === 'zombie') {
                    if (d > 0.8) { e.x += (player.x-e.x)/d * 0.02; e.y += (player.y-e.y)/d * 0.02; } e.z = getElevation(e.x, e.y); 
                    if (d < 1.5) { if (--e.cooldown <= 0) { takeDamage(5); e.cooldown = 60; } } else e.cooldown = Math.max(0, e.cooldown - 1);
                } else {
                    if (d > 8) { e.x += (player.x-e.x)/d * 0.02; e.y += (player.y-e.y)/d * 0.02; } e.z = getElevation(e.x, e.y); 
                    if (--e.cooldown <= 0) { let projZ = (e.type === 'experimental' ? e.z + e.size * 0.8 : e.z + 0.6); projectiles.push({ owner:'enemy', x:e.x, y:e.y, z:projZ, vx:(player.x-e.x)/d*0.6, vy:(player.y-e.y)/d*0.6, vz:(player.z-0.6-projZ)/d*0.6, life:100, dmg:10 }); e.cooldown = 120; } 
                }
            }
        }

        for (let i = animals.length - 1; i >= 0; i--) {
            let a = animals[i]; if (Math.hypot(player.x - a.x, player.y - a.y) > VIEW_DIST * 2.0) { animals.splice(i, 1); continue; }
            if (!a.dead) { a.moveTimer--; if (a.moveTimer <= 0) { a.moveAngle = Math.random() * Math.PI * 2; a.moveTimer = 50 + Math.random() * 100; } let anx = a.x + Math.cos(a.moveAngle) * a.speed, any = a.y + Math.sin(a.moveAngle) * a.speed; if (!isSolid(anx, any)) { a.x = anx; a.y = any; } a.z = getElevation(a.x, a.y); }
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
            for (let e of enemies) { let d = Math.hypot(player.x - e.x, player.y - e.y); if (d < cDist) { let a = Math.atan2(e.y - player.y, e.x - player.x), ad = Math.abs(Math.atan2(Math.sin(player.angle - a), Math.cos(player.angle - a))); if (ad < 0.6) { cDist = d; hitTarget = { obj: e, type: 'enemy' }; } } }
            for (let a of animals) { if(a.dead) continue; let d = Math.hypot(player.x - a.x, player.y - a.y); if (d < cDist) { let aTo = Math.atan2(a.y - player.y, a.x - player.x), ad = Math.abs(Math.atan2(Math.sin(player.angle - aTo), Math.cos(player.angle - aTo))); if (ad < 0.6) { cDist = d; hitTarget = { obj: a, type: 'animal' }; } } }
            let pCx = Math.floor(player.x / MAP_CHUNK_SIZE), pCy = Math.floor(player.y / MAP_CHUNK_SIZE);
            for(let cx = pCx - 1; cx <= pCx + 1; cx++) for(let cy = pCy - 1; cy <= pCy + 1; cy++) {
                let chunk = getMapChunk(cx, cy);
                for(let i=0; i<chunk.length; i++) {
                    let cObj = chunk[i]; if (cObj.hp !== undefined) { let d = Math.hypot(player.x - cObj.wx, player.y - cObj.wy); if (d < cDist) { let aTo = Math.atan2(cObj.wy - player.y, cObj.wx - player.x), ad = Math.abs(Math.atan2(Math.sin(player.angle - aTo), Math.cos(player.angle - aTo))); if (ad < 0.6) { cDist = d; hitTarget = { obj: cObj, type: 'static', chunkArray: chunk, index: i }; } } }
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
            }
            fireCooldown = w.fireRate;
        } else {
            for(let i=0; i<w.count; i++) projectiles.push({ owner: 'player', x: player.x, y: player.y, z: player.z - 0.2, vx: Math.cos(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vy: Math.sin(player.angle + (Math.random()-0.5)*w.spread) * Math.cos(pitchAngle) * w.speed, vz: Math.sin(pitchAngle) * w.speed, life: 100, dmg: w.dmg });
            fireCooldown = w.fireRate;
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i], prevX = p.x, prevY = p.y, prevZ = p.z;
        p.x += p.vx; p.y += p.vy; p.z += p.vz; p.life--; let hit = (p.z < (gameState==='overworld'?getElevation(p.x, p.y):0) || isSolid(p.x, p.y));
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
        } else if (p.owner === 'enemy') { let hitZ = checkSegCyl(prevX, prevY, prevZ, p.x, p.y, p.z, player.x, player.y, player.z - 1.2, 1.2, 0.4); if (hitZ !== false) { takeDamage(p.dmg); hit = true; } }
        if (hit || p.life <= 0) projectiles.splice(i, 1);
    }
}

// --- Render Graphics ---
const activeRenderList = [];
let _lastFont = '', _lastBaseline = '', _lastAlign = '';

function render() {
    if (isPaused && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) return;

    const fov = canvas.width * currentZoom, hY = canvas.height/2 + player.pitch;
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const pX = -dirY * 0.8, pY = dirX * 0.8;
    
    // Exact true 3D aim vector for the flashlight cone
    const pitchAngle = Math.atan2(player.pitch, fov);
    const aimX = dirX * Math.cos(pitchAngle);
    const aimY = dirY * Math.cos(pitchAngle);
    const aimZ = Math.sin(pitchAngle);

    renderCount = 0; 

    let sky = getSkyColor(gameTime);
    let ambient = getAmbientLight(gameTime);

    let visibleCampfires = campfires.filter(c => Math.hypot(c.x - player.x, c.y - player.y) < VIEW_DIST + 25);

    if (gameState === 'overworld') {
        ctx.fillStyle = `rgb(${sky.r|0}, ${sky.g|0}, ${sky.b|0})`; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        let pCx = Math.floor(player.x / MAP_CHUNK_SIZE), pCy = Math.floor(player.y / MAP_CHUNK_SIZE), chunkRadius = Math.ceil(VIEW_DIST / MAP_CHUNK_SIZE);
        for (let cx = pCx - chunkRadius; cx <= pCx + chunkRadius; cx++) {
            for (let cy = pCy - chunkRadius; cy <= pCy + chunkRadius; cy++) {
                if ((cx * MAP_CHUNK_SIZE + MAP_CHUNK_SIZE/2 - player.x)*dirX + (cy * MAP_CHUNK_SIZE + MAP_CHUNK_SIZE/2 - player.y)*dirY < -MAP_CHUNK_SIZE*1.5) continue;
                let chunk = getMapChunk(cx, cy);
                for (let i = 0; i < chunk.length; i++) {
                    let obj = chunk[i], dx = obj.wx - player.x, dy = obj.wy - player.y, rZ = dx * dirX + dy * dirY;
                    if (rZ > 0.2 && rZ < VIEW_DIST && Math.abs(dx * -dirY + dy * dirX) < (rZ * 2.0) / currentZoom) {
                        let o = getRenderItem(); o.type = obj.type; o.emoji = obj.emoji; o.size = obj.size; o.hp = obj.hp; o.rX = dx * -dirY + dy * dirX; o.rZ = rZ; o.h = obj.h; o.wX = obj.wx; o.wY = obj.wy;
                    }
                }
            }
        }
        for (let e of enemies) { 
            let dx = e.x - player.x, dy = e.y - player.y, rZ = dx * dirX + dy * dirY; 
            if (rZ > 0.2 && rZ < VIEW_DIST) {
                let o = getRenderItem(); o.hp = e.hp; o.flash = e.flash; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.size = e.size; o.h = e.z; o.wX = e.x; o.wY = e.y;
                if (e.type === 'experimental' || e.type === 'zombie') { o.type = 'locationalEnemy'; o.obj = e; }
                else { o.type = 'emoji'; o.emoji = e.emoji || '👽'; o.h -= 0.1; }
            }
        }
        for (let c of campfires) { 
            let dx = c.x - player.x, dy = c.y - player.y, rZ = dx * dirX + dy * dirY; 
            if (rZ > 0.2 && rZ < VIEW_DIST) { 
                let o = getRenderItem(); o.type = 'emoji'; o.emoji = c.emoji; o.size = c.size; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = c.z - 0.1; o.wX = c.x; o.wY = c.y; 
                if (ambient < 1.0) {
                    let g = getRenderItem(); g.type = 'campfireBloom'; g.rX = dx*-dirY+dy*dirX; g.rZ = rZ + 0.01; g.h = c.z; g.flicker = c.flicker; g.size = c.size;
                }
            } 
        }
        for (let e of containers) { let dx = e.x - player.x, dy = e.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.2 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = e.z - 0.1; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y; } }
        for (let e of animals) { let dx = e.x - player.x, dy = e.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.2 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'animal'; o.emoji = e.emoji; o.size = e.size; o.hp = (!e.dead ? e.hp : undefined); o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = e.z - 0.1; o.targeted = e === interactTarget; o.dead = e.dead; o.wX = e.x; o.wY = e.y; } }
        for (let b of buildings) { let dx = b.x - player.x, dy = b.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.2 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = b.emoji; o.size = 4.5; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = b.z - 0.2; o.targeted = b === interactTarget; o.wX = b.x; o.wY = b.y; } }
        for (let d of damageTexts) { let dx = d.x - player.x, dy = d.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.2 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'dmgText'; o.text = Math.round(d.amt*10)/10; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = d.z; o.life = d.life; } }
        for (let b of bloodParticles) { let dx = b.x - player.x, dy = b.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.1 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'blood'; o.color = b.color; o.size = b.size; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = b.z; o.life = b.life; } }
    } else {
        if (activeBuilding.emoji === '⛺') { ctx.fillStyle = '#0a0d04'; ctx.fillRect(0, 0, canvas.width, hY); ctx.fillStyle = patternArmyGreenFloor; ctx.fillRect(0, Math.max(0, hY), canvas.width, canvas.height - Math.max(0, hY)); } 
        else { ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, 0, canvas.width, hY); ctx.fillStyle = '#5c4033'; ctx.fillRect(0, Math.max(0, hY), canvas.width, canvas.height - Math.max(0, hY)); }
        for (let e of getInteriorEntities()) { let dx = e.x - player.x, dy = e.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.2 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = e.z; o.targeted = e.action === interactTarget?.action; } }
        for (let w of getInteriorWalls()) { let cx = w.pts ? w.pts.reduce((sum, p) => sum + p.x, 0) / w.pts.length : (w.p1.x + w.p2.x)/2, cy = w.pts ? w.pts.reduce((sum, p) => sum + p.y, 0) / w.pts.length : (w.p1.y + w.p2.y)/2, dx = cx - player.x, dy = cy - player.y, rZ = dx * dirX + dy * dirY; if (rZ > -2 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'wall'; o.wallObj = w; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; } }
        for (let b of bloodParticles) { let dx = b.x - player.x, dy = b.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.1 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'blood'; o.color = b.color; o.size = b.size; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = b.z; o.life = b.life; } }
    }

    for (let p of projectiles) { let dx = p.x - player.x, dy = p.y - player.y, rZ = dx * dirX + dy * dirY; if (rZ > 0.1 && rZ < VIEW_DIST) { let o = getRenderItem(); o.type = 'bullet'; o.owner = p.owner; o.rX = dx*-dirY+dy*dirX; o.rZ = rZ; o.h = p.z; } }

    activeRenderList.length = renderCount;
    for(let i=0; i < renderCount; i++) activeRenderList[i] = renderPool[i];
    activeRenderList.sort((a,b) => b.rZ - a.rZ);

    let cur = 0; if (_lastAlign !== 'center') { ctx.textAlign = 'center'; _lastAlign = 'center'; }

    // --- DRAW TERRAIN AND 2.5D OBJECTS BACK-TO-FRONT ---
    for (let z = VIEW_DIST; z > 0.1; ) {
        let zStep = z > 40 ? 1.5 : (z > 20 ? 0.8 : (z > 8 ? 0.4 : 0.2));

        while(cur < activeRenderList.length && activeRenderList[cur].rZ >= z) {
            let o = activeRenderList[cur++];
            let sx = canvas.width/2 + (o.rX/o.rZ)*fov, sy = hY + ((player.z-o.h)/o.rZ)*fov;
            
            // True 3D Object Point-Lighting Calculation
            let objLight = gameState === 'overworld' ? ambient : 1.0;
            if (objLight < 1.0 && o.type !== 'campfireBloom' && o.type !== 'wall') {
                let lightIntensity = 0;
                if (isFlashlightOn && o.wX !== undefined && o.wY !== undefined) {
                    let dx = o.wX - player.x, dy = o.wY - player.y;
                    let objCenterZ = (o.h + (o.size ? o.size/2 : 0));
                    let dz = objCenterZ - (player.z - 0.2); 
                    let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (dist > 0.1 && dist < 45) {
                        let dot = (dx/dist)*aimX + (dy/dist)*aimY + (dz/dist)*aimZ; 
                        if (dot > 0.90) { 
                            let core = Math.max(0, (dot - 0.98) / 0.02);
                            let flood = Math.max(0, (dot - 0.90) / 0.08);
                            let att = (core * 0.6 + Math.pow(flood, 2.0) * 0.4) * Math.pow(1 - dist/45, 2);
                            lightIntensity += att * 1.5;
                        }
                    }
                }
                if (o.wX !== undefined && o.wY !== undefined) {
                    for (let c of visibleCampfires) {
                        let dx = o.wX - c.x, dy = o.wY - c.y, dz = (o.h || 0) - c.z;
                        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz); 
                        if (dist < 22) { lightIntensity += Math.pow(1 - dist/22, 2.5) * c.flicker * 1.5; }
                    }
                }
                objLight = Math.min(1.0, objLight + lightIntensity);
            }

            if (o.type === 'campfireBloom') {
                let curAmbient = gameState === 'overworld' ? ambient : 1.0;
                let f = o.flicker;
                let flameCenterY = sy - (0.4 * o.size / o.rZ) * fov; 
                let distFade = Math.min(1, 40 / o.rZ); 
                ctx.globalCompositeOperation = 'lighter';
                
                let airRad = (15.0 * o.size / o.rZ) * fov;
                ctx.save(); ctx.translate(sx, flameCenterY); 
                let aGrad = ctx.createRadialGradient(0,0,0, 0,0, airRad);
                let aAlpha = 0.15 * f * (1 - curAmbient) * distFade; 
                
                aGrad.addColorStop(0, `rgba(255, 140, 50, ${aAlpha})`);
                aGrad.addColorStop(0.3, `rgba(255, 80, 20, ${aAlpha * 0.5})`);
                aGrad.addColorStop(0.6, `rgba(200, 40, 5, ${aAlpha * 0.15})`);
                aGrad.addColorStop(1, `rgba(150, 10, 0, 0)`);
                
                ctx.fillStyle = aGrad; ctx.fillRect(-airRad, -airRad, airRad*2, airRad*2); ctx.restore();
                ctx.globalCompositeOperation = 'source-over';
            } else if (o.type === 'wall') {
                let w = o.wallObj;
                let pts = w.pts ? w.pts : [ {x: w.p1.x, y: w.p1.y, z: activeBuilding.wallH}, {x: w.p2.x, y: w.p2.y, z: activeBuilding.wallH}, {x: w.p2.x, y: w.p2.y, z: 0}, {x: w.p1.x, y: w.p1.y, z: 0} ];
                let camPts = []; for (let i=0; i<pts.length; i++) { let dx = pts[i].x - player.x, dy = pts[i].y - player.y; camPts.push({ rX: dx * -dirY + dy * dirX, rZ: dx * dirX + dy * dirY, z: pts[i].z }); }
                let clipped = [];
                for (let i=0; i<pts.length; i++) {
                    let p1 = camPts[i], p2 = camPts[(i+1)%pts.length];
                    if (p1.rZ >= 0.1) clipped.push(p1);
                    if ((p1.rZ >= 0.1) !== (p2.rZ >= 0.1)) { let t = (0.1 - p1.rZ) / (p2.rZ - p1.rZ); clipped.push({ rX: p1.rX + t * (p2.rX - p1.rX), rZ: 0.1, z: p1.z + t * (p2.z - p1.z) }); }
                }
                if (clipped.length >= 3) {
                    ctx.fillStyle = w.color; ctx.strokeStyle = w.pts ? '#1a2410' : '#220000'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let i=0; i<clipped.length; i++) { let wsx = canvas.width/2 + (clipped[i].rX/clipped[i].rZ)*fov, wsy = hY + ((player.z - clipped[i].z)/clipped[i].rZ)*fov; if (i===0) ctx.moveTo(wsx, wsy); else ctx.lineTo(wsx, wsy); }
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                }
            } else if (o.type === 'locationalEnemy') {
                let e = o.obj, sz = (fov/o.rZ)*o.size; 
                let isFlash = e.flash > 0, isZombie = e.type === 'zombie';
                let legH = sz * 0.44, abdH = sz * 0.28, chestH = sz * 0.16, headR = sz * 0.12;
                let topLegs = sy - legH, topAbd = topLegs - abdH, topChest = topAbd - chestH;
                
                let color1 = isFlash ? 'white' : (isZombie ? `rgb(${30*objLight|0},${86*objLight|0},${34*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                let color2 = isFlash ? 'white' : (isZombie ? `rgb(${46*objLight|0},${125*objLight|0},${50*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                let color3 = isFlash ? 'white' : (isZombie ? `rgb(${56*objLight|0},${142*objLight|0},${60*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);

                ctx.fillStyle = color1; ctx.fillRect(sx - (sz * 0.20)/2, topLegs, sz * 0.20, legH);
                ctx.fillStyle = color2; ctx.fillRect(sx - (sz * 0.18)/2, topAbd, sz * 0.18, abdH);
                ctx.fillStyle = color3; ctx.fillRect(sx - (sz * 0.26)/2, topChest, sz * 0.26, chestH);

                const headSprite = SpriteCache.get(isZombie ? '🧟' : '👽', isFlash, false, objLight);
                let headScale = (headR * 2) / 128;
                let hw = headSprite.width * headScale, hh = headSprite.height * headScale;
                ctx.drawImage(headSprite, sx - hw/2, (topChest - headR/2) - (headSprite.height - 20) * headScale, hw, hh);

                if (showDebugInfo && o.hp !== undefined) {
                    ctx.fillStyle = 'lime'; let hf = Math.max(10, 15/o.rZ) + 'px Courier';
                    if (_lastFont !== hf) { ctx.font = hf; _lastFont = hf; } if (_lastBaseline !== 'bottom') { ctx.textBaseline = 'bottom'; _lastBaseline = 'bottom'; }
                    ctx.fillText('HP:'+o.hp.toFixed(1), sx, sy - sz - 15);
                }
            } else if (o.type === 'dmgText') {
                ctx.fillStyle = `rgba(255, 50, 50, ${o.life/60})`; let df = 'bold ' + Math.max(12, 24/o.rZ) + 'px sans-serif';
                if (_lastFont !== df) { ctx.font = df; _lastFont = df; } if (_lastBaseline !== 'middle') { ctx.textBaseline = 'middle'; _lastBaseline = 'middle'; }
                ctx.fillText(o.text, sx, sy);
            } else if (o.type === 'blood') {
                let sz = Math.max(2, (fov/o.rZ) * o.size);
                let br = o.color.r * objLight | 0; let bg = o.color.g * objLight | 0; let bb = o.color.b * objLight | 0;
                let alpha = Math.min(1.0, o.life / 20.0);
                
                ctx.fillStyle = `rgba(${br}, ${bg}, ${bb}, ${alpha})`;
                ctx.fillRect(sx - sz/2, sy - sz/2, sz, sz);
            } else {
                let sz = o.size ? (fov/o.rZ)*o.size : 0; 
                if (o.type === 'emoji' || o.type === 'animal') {
                    const isFlashed = o.targeted || (o.flash && o.flash > 0);
                    const isDead = o.type === 'animal' && o.dead;
                    
                    const sprite = SpriteCache.get(o.emoji, isFlashed, isDead, objLight);
                    let scale = sz / 128;
                    let anchorY = (sprite.height - 20); 
                    ctx.drawImage(sprite, sx - (sprite.width/2)*scale, sy - anchorY*scale, sprite.width * scale, sprite.height * scale);

                    if (showDebugInfo && o.hp !== undefined) {
                        ctx.fillStyle = 'lime'; let hf = Math.max(10, 15/o.rZ) + 'px Courier';
                        if (_lastFont !== hf) { ctx.font = hf; _lastFont = hf; } if (_lastBaseline !== 'bottom') { ctx.textBaseline = 'bottom'; _lastBaseline = 'bottom'; }
                        ctx.fillText('HP:'+o.hp.toFixed(1), sx, sy - sz - 5);
                    }
                } else { ctx.fillStyle = o.owner==='player'?'#ff0':'#f33'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, 15/o.rZ), 0, 7); ctx.fill(); }
            }
        }

        // --- TRUE 3D DYNAMIC MESH TERRAIN RENDERING ---
        if (gameState === 'overworld') {
            let sxStep = z > 30 ? 30 : (z > 15 ? 20 : 10); 
            const sxMult = 2 / canvas.width;
            const bPx = player.x + z*dirX, bPy = player.y + z*dirY;
            const zPx = z*pX, zPy = z*pY;

            let fog = Math.min(1, z/VIEW_DIST);
            let nightFactor = 1.0 - ambient;

            let prevCX = -sxStep * sxMult - 1;
            let prevWX = bPx + zPx * prevCX;
            let prevWY = bPy + zPy * prevCX;
            let prevH = getElevation(prevWX, prevWY);
            let prevSY = hY + ((player.z - prevH)/z)*fov;

            for (let sx = 0; sx <= canvas.width + sxStep; sx += sxStep) {
                let cX = sx * sxMult - 1;
                let wX = bPx + zPx * cX;
                let wY = bPy + zPy * cX;
                let h = getElevation(wX, wY);
                let sy = hY + ((player.z - h)/z)*fov;

                let midWX = (prevWX + wX) / 2, midWY = (prevWY + wY) / 2, midH = (prevH + h) / 2;
                let biomeBlend = getBiome(midWX, midWY);
                let baseR = 30 * (1 - biomeBlend) + Math.min(255, Math.max(150, 200 + midH * 12)) * biomeBlend;
                let baseG = Math.min(220, Math.max(30, 90 + midH * 14)) * (1 - biomeBlend) + Math.min(255, Math.max(120, 170 + midH * 12)) * biomeBlend;
                let baseB = 30 * (1 - biomeBlend) + Math.min(255, Math.max(80, 110 + midH * 12)) * biomeBlend;
                if (Math.floor(z * 2.5) % 2 === 0) { baseR*=0.92; baseG*=0.92; baseB*=0.92; } 

                let r = baseR * ambient + baseR * nightFactor * 0.05;
                let g = baseG * ambient + baseG * nightFactor * 0.12;
                let b = baseB * ambient + baseB * nightFactor * 0.28;

                if (ambient < 1.0) {
                    for (let c of visibleCampfires) {
                        let dx = midWX - c.x, dy = midWY - c.y, dz = midH - c.z;
                        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz); 
                        if (dist < 22) { let att = Math.pow(1 - dist/22, 2.5) * c.flicker; r += 255 * att * 1.5; g += 140 * att * 1.5; b += 50 * att * 1.5; }
                    }
                    if (isFlashlightOn) {
                        let dx = midWX - player.x, dy = midWY - player.y, dz = midH - (player.z - 0.2); 
                        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                        if (dist > 0.1 && dist < 45) {
                            let dot = (dx/dist)*aimX + (dy/dist)*aimY + (dz/dist)*aimZ;
                            if (dot > 0.90) { let core = Math.max(0, (dot - 0.98) / 0.02); let flood = Math.max(0, (dot - 0.90) / 0.08); let att = (core * 0.6 + Math.pow(flood, 2.0) * 0.4) * Math.pow(1 - dist/45, 2); r += 245 * att * 1.5; g += 210 * att * 1.5; b += 130 * att * 1.5; }
                        }
                    }
                }

                r = r * (1 - fog) + sky.r * fog; g = g * (1 - fog) + sky.g * fog; b = b * (1 - fog) + sky.b * fog;
                ctx.fillStyle = `rgb(${Math.min(255, r)|0}, ${Math.min(255, g)|0}, ${Math.min(255, b)|0})`;
                
                ctx.beginPath();
                ctx.moveTo(sx - sxStep - 1, Math.floor(prevSY)); 
                ctx.lineTo(sx, Math.floor(sy));
                ctx.lineTo(sx, canvas.height + 10);
                ctx.lineTo(sx - sxStep - 1, canvas.height + 10);
                ctx.fill();

                prevWX = wX; prevWY = wY; prevH = h; prevSY = sy;
            }
        }
        z -= zStep;
    }

    if (gameState === 'overworld' && ambient < 1.0 && isFlashlightOn) {
        ctx.globalCompositeOperation = 'lighter';
        let cx = canvas.width / 2, cy = hY - player.pitch, radOuter = Math.min(canvas.width, canvas.height) * 0.45, radInner = radOuter * 0.05; 
        let grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radOuter), alpha = 0.10 * (1 - ambient); 
        
        grad.addColorStop(0, `rgba(255, 240, 200, ${alpha * 2.0})`); grad.addColorStop(radInner/radOuter, `rgba(240, 210, 130, ${alpha})`); grad.addColorStop(0.4, `rgba(150, 110, 40, ${alpha * 0.2})`); grad.addColorStop(1, `rgba(50, 30, 10, 0)`);
        
        ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'source-over';
    }

    ctx.strokeStyle = fireCooldown > 0 ? 'red' : 'white'; ctx.lineWidth = isZooming?1:2; ctx.beginPath(); let cs = isZooming?4:8;
    ctx.moveTo(canvas.width/2-cs, hY-player.pitch); ctx.lineTo(canvas.width/2+cs, hY-player.pitch);
    ctx.moveTo(canvas.width/2, hY-player.pitch-cs); ctx.lineTo(canvas.width/2, hY-player.pitch+cs); ctx.stroke();
}

// --- Start the game loop ---
function loop() { update(); render(); requestAnimationFrame(loop); }
loop();