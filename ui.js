// --- Inventory & UI Init ---
for(let i = 0; i < 20; i++) { let slot = document.createElement('div'); slot.className = 'inv-slot'; slot.dataset.index = i; slot.dataset.type = 'player'; playerInvGrid.appendChild(slot); }
for(let i = 0; i < 10; i++) { let slot = document.createElement('div'); slot.className = 'inv-slot'; slot.dataset.index = i; slot.dataset.type = 'container'; containerInvGrid.appendChild(slot); }

function updateInventories() {
    const pSlots = playerInvGrid.children;
    for(let i = 0; i < 20; i++) { 
        let item = inventory[i];
        pSlots[i].innerHTML = item ? `${item.emoji}${item.count > 1 ? '<span style="position:absolute;bottom:2px;right:4px;font-size:14px;color:#fff;text-shadow:1px 1px 2px #000;">'+item.count+'</span>' : ''}` : ''; 
    }
    if (activeContainer) { 
        const cSlots = containerInvGrid.children; 
        for(let i = 0; i < 10; i++) { 
            let item = activeContainer.items[i];
            cSlots[i].innerHTML = item ? `${item.emoji}${item.count > 1 ? '<span style="position:absolute;bottom:2px;right:4px;font-size:14px;color:#fff;text-shadow:1px 1px 2px #000;">'+item.count+'</span>' : ''}` : ''; 
        } 
    }
    updateCraftingUI();
}

function updateCraftingUI() {
    craftingList.innerHTML = '';
    let resourceCounts = {};
    for (let item of inventory) {
        if (item && (item.type === 'resource' || item.type === 'building' || item.type === 'campfire')) {
            resourceCounts[item.emoji] = (resourceCounts[item.emoji] || 0) + (item.count || 1);
        }
    }
    RECIPES.forEach((recipe, index) => {
        let canMake = true; let reqTextHtml = [];
        for (let reqEmoji in recipe.req) {
            let reqAmt = recipe.req[reqEmoji], hasAmt = resourceCounts[reqEmoji] || 0;
            let color = hasAmt >= reqAmt ? '#8f8' : '#f88';
            reqTextHtml.push(`<span style="color:${color};">${hasAmt}/${reqAmt} ${reqEmoji}</span>`);
            if (hasAmt < reqAmt) canMake = false;
        }
        let btn = document.createElement('button');
        btn.className = 'craft-btn';
        let hasSpace = inventory.some(i => i === null) || inventory.some(i => i && i.emoji === recipe.result.emoji);
        if (!hasSpace) canMake = false;
        btn.disabled = !canMake;
        btn.innerHTML = `<div class="craft-title">${recipe.result.emoji} ${recipe.name}</div><div class="craft-reqs">${reqTextHtml.join(' &nbsp;|&nbsp; ')}</div>`;
        if (canMake) btn.onclick = () => craftRecipe(index);
        craftingList.appendChild(btn);
    });
}

function craftRecipe(index) {
    let recipe = RECIPES[index];
    for (let reqEmoji in recipe.req) {
        let needed = recipe.req[reqEmoji];
        for (let i = 0; i < inventory.length; i++) {
            let item = inventory[i];
            if (item && item.emoji === reqEmoji) {
                if (item.count > needed) { item.count -= needed; needed = 0; break; }
                else { needed -= item.count; inventory[i] = null; }
            }
        }
    }
    giveItem({ ...recipe.result });
}

function giveItem(itemData) {
    if (itemData.type === 'resource' || itemData.type === 'building' || itemData.type === 'campfire') {
        let existing = inventory.find(i => i && i.emoji === itemData.emoji);
        if (existing) { existing.count = (existing.count || 1) + (itemData.count || 1); updateInventories(); return; }
    }
    let emptyIndex = inventory.findIndex(x => x === null);
    if (emptyIndex !== -1) { itemData.count = itemData.count || 1; inventory[emptyIndex] = { ...itemData }; updateInventories(); }
}

invScreen.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.inv-slot')) return;
    let slotEl = e.target.closest('.inv-slot'), index = parseInt(slotEl.dataset.index), type = slotEl.dataset.type, isRightClick = e.button === 2;
    if (type === 'player') {
        let item = inventory[index]; if (!item) return;
        if (isRightClick) { 
            if (item.type === 'heal' && (player.hp < 100 || godMode)) { 
                player.hp = godMode ? player.hp : Math.min(100, player.hp + item.amount); hpEl.innerText = player.hp; 
                inventory[index] = null; healFlash.style.background = 'lime'; healFlash.style.opacity = '0.5'; setTimeout(() => healFlash.style.opacity = '0', 100); updateInventories(); 
            } 
            else if (item.type === 'food' && (player.food < 100 || godMode)) { 
                player.food = godMode ? player.food : Math.min(100, player.food + item.amount); foodEl.innerText = player.food; 
                inventory[index] = null; healFlash.style.background = 'orange'; healFlash.style.opacity = '0.5'; setTimeout(() => healFlash.style.opacity = '0', 100); updateInventories(); 
            }
            else if (item.type === 'building' || item.type === 'campfire') {
                // FIXED: True 3D Raycast to drop items perfectly into caves or hills
                const pitchAngle = Math.atan2(player.pitch, canvas.width * currentZoom);
                let hitX = player.x + Math.cos(player.angle) * 4.0;
                let hitY = player.y + Math.sin(player.angle) * 4.0;
                let hitZ = player.z; 

                let foundSolid = false;
                let step = 0.2;
                for (let i = 0; i <= 6.0 / step; i++) {
                    let rx = player.x + Math.cos(player.angle) * Math.cos(pitchAngle) * (i * step);
                    let ry = player.y + Math.sin(player.angle) * Math.cos(pitchAngle) * (i * step);
                    let rz = (player.z + player.baseHeight) + Math.sin(pitchAngle) * (i * step);
                    
                    if (getSolid(Math.floor(rx), Math.floor(ry), Math.floor(rz))) {
                        hitX = rx; hitY = ry; 
                        // Target hit! Drop exactly down to find the floor block
                        for(let z = Math.floor(rz); z >= 0; z--) {
                            if (getSolid(Math.floor(rx), Math.floor(ry), z)) {
                                hitZ = z + 1.0; 
                                foundSolid = true; break;
                            }
                        }
                        break;
                    }
                }
                
                if (!foundSolid) {
                    // Fallback: Drop straight down from where the player was looking 4 units ahead
                    for(let z = Math.floor(player.z + player.baseHeight + 2); z >= 0; z--) {
                        if (getSolid(Math.floor(hitX), Math.floor(hitY), z)) { hitZ = z + 1.0; break; }
                    }
                }

                if (item.type === 'campfire') {
                    campfires.push({ x: hitX, y: hitY, z: hitZ, emoji: '🔥', size: 1.2, flicker: 1.0 });
                } else {
                    let isTent = item.emoji === '⛺';
                    buildings.push({ x: hitX, y: hitY, z: hitZ, emoji: item.emoji, rooms: item.rooms, floors: item.floors, roomW: isTent ? 6 : 10, roomH: isTent ? 6 : 10, wallH: isTent ? 3.0 : 3.5 });
                }
                item.count--; if (item.count <= 0) inventory[index] = null; updateInventories();
            }
        } else if (activeContainer) { 
            let emptyIndex = activeContainer.items.findIndex(x => x === null);
            if (emptyIndex !== -1) { activeContainer.items[emptyIndex] = item; inventory[index] = null; updateInventories(); }
        }
    } else if (type === 'container' && !isRightClick) {
        let item = activeContainer.items[index]; if (!item) return;
        if (item.type === 'resource' || item.type === 'building' || item.type === 'campfire') {
            let existing = inventory.find(i => i && i.emoji === item.emoji);
            if (existing) { existing.count = (existing.count || 1) + (item.count || 1); activeContainer.items[index] = null; updateInventories(); return; }
        }
        let emptyIndex = inventory.findIndex(x => x === null);
        if (emptyIndex !== -1) { inventory[emptyIndex] = item; activeContainer.items[index] = null; updateInventories(); }
    }
});
window.addEventListener('contextmenu', e => e.preventDefault());

// --- Input Bindings ---
overlay.addEventListener('click', () => { if(!isInventoryOpen && !isDebugOpen && !isStairMenuOpen) canvas.requestPointerLock(); });

document.addEventListener('pointerlockchange', () => {
    isPaused = document.pointerLockElement !== canvas; 
    if (isPaused) { 
        overlay.style.display = (isInventoryOpen || isDebugOpen || isStairMenuOpen) ? 'none' : 'flex'; 
        invScreen.style.display = isInventoryOpen ? 'flex' : 'none'; 
        containerUI.style.display = (isInventoryOpen && activeContainer) ? 'flex' : 'none'; 
        debugMenu.style.display = isDebugOpen ? 'block' : 'none'; stairMenu.style.display = isStairMenuOpen ? 'block' : 'none';
        interactTooltip.style.display = 'none'; keys = {}; 
    } else { isInventoryOpen = isDebugOpen = isStairMenuOpen = false; activeContainer = null; overlay.style.display = invScreen.style.display = debugMenu.style.display = stairMenu.style.display = 'none'; }
});

window.addEventListener('mousedown', e => { if (isPaused) return; if (e.button === 0) isMouseDown = true; if (e.button === 2) { isZooming = true; adsEl.innerText = "ON"; } });
window.addEventListener('mouseup', e => { if (e.button === 0) isMouseDown = false; if (e.button === 2) { isZooming = false; adsEl.innerText = "OFF"; } });

window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return; keys[e.code] = true;
    if (e.key >= '1' && e.key <= '7') switchWeapon(parseInt(e.key));
    if (e.key.toLowerCase() === 'f') isFlashlightOn = !isFlashlightOn; 
    if (e.key.toLowerCase() === 'e' && interactTarget && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) { 
        if (interactTarget.rooms) enterBuilding(interactTarget); else if (interactTarget.action === 'exit') exitBuilding();
        else if (interactTarget.action === 'stairs') { if (activeBuilding.floors > 1) { if (activeFloor === 0) changeFloor(1); else if (activeFloor === activeBuilding.floors - 1) changeFloor(-1); else { isStairMenuOpen = true; stairMenuTitle.innerText = `Stairwell (Floor ${activeFloor + 1})`; document.exitPointerLock(); } } }
        else { isInventoryOpen = true; activeContainer = interactTarget; updateInventories(); document.exitPointerLock(); }
    }
    if (e.key.toLowerCase() === 'i') { if(!isInventoryOpen) { isInventoryOpen = true; isDebugOpen = isStairMenuOpen = false; activeContainer = null; updateInventories(); document.exitPointerLock(); } else canvas.requestPointerLock(); }
    if (e.key === '`' || e.key === '~') { if(!isDebugOpen) { isDebugOpen = true; isInventoryOpen = isStairMenuOpen = false; activeContainer = null; document.exitPointerLock(); } else canvas.requestPointerLock(); }
});
window.addEventListener('keyup', e => { if (e.target.tagName !== 'INPUT') keys[e.code] = false; });

// --- Debug Menu Hooks ---
dbgTimeEl.oninput = e => { gameTime = parseFloat(e.target.value); dbgTimeValEl.innerText = gameTime.toFixed(1); };
dbgTimeSpeedEl.oninput = e => { timeSpeed = parseFloat(e.target.value) || 1.0; };
document.getElementById('btn-hp').onclick = () => { player.hp = parseInt(document.getElementById('dbg-hp').value); hpEl.innerText = player.hp; };
document.getElementById('btn-stam').onclick = () => { player.stamina = parseInt(document.getElementById('dbg-stam').value); staminaEl.innerText = Math.floor(player.stamina); };
document.getElementById('btn-food').onclick = () => { player.food = parseInt(document.getElementById('dbg-food').value); foodEl.innerText = player.food; };
document.getElementById('dbg-god').onchange = e => godMode = e.target.checked;
document.getElementById('dbg-noclip').onchange = e => noclip = e.target.checked;
document.getElementById('dbg-infstam').onchange = e => infiniteStamina = e.target.checked;
document.getElementById('dbg-speed').onchange = e => speedMult = (parseInt(e.target.value) || 100) / 100;
document.getElementById('dbg-sprint').onchange = e => sprintMult = parseFloat(e.target.value) || 1.5;
document.getElementById('dbg-jump').onchange = e => jumpPower = parseFloat(e.target.value) || 0.28;
document.getElementById('dbg-flight').onchange = e => flightMode = e.target.checked;
document.getElementById('dbg-spawnenemies').onchange = e => spawnEnemiesToggle = e.target.checked;
document.getElementById('dbg-info').onchange = e => showDebugInfo = e.target.checked;

function closeStairMenu() { isStairMenuOpen = false; canvas.requestPointerLock(); }
document.getElementById('btn-stair-up').onclick = () => { changeFloor(1); closeStairMenu(); };
document.getElementById('btn-stair-down').onclick = () => { changeFloor(-1); closeStairMenu(); };
document.getElementById('btn-stair-cancel').onclick = closeStairMenu;

// Cave-Safe Floor Finder for Spawners
function getSafeFloorZ(x, y, startZ) {
    for(let z = Math.floor(startZ + 2); z >= 0; z--) {
        if (getSolid(Math.floor(x), Math.floor(y), z)) return z + 1.0;
    }
    return player.z;
}

window.killAll = () => enemies.length = 0;
window.spawnBuilding = () => { 
    let rooms = parseInt(document.getElementById('dbg-b-rooms').value) || 1, floors = parseInt(document.getElementById('dbg-b-floors').value) || 1; 
    let cx = player.x + Math.cos(player.angle) * 8, cy = player.y + Math.sin(player.angle) * 8; 
    buildings.push({ x: cx, y: cy, z: getSafeFloorZ(cx, cy, player.z), emoji: '🏚️', rooms: rooms, floors: floors, roomW: 10, roomH: 10, wallH: 3.5 }); 
};
window.spawnEnemy = (type) => {
    let ex = player.x + Math.cos(player.angle) * 5, ey = player.y + Math.sin(player.angle) * 5, ez = getSafeFloorZ(ex, ey, player.z);
    if (!getSolid(Math.floor(ex), Math.floor(ey), Math.floor(ez))) {
        if (type === 'alien') enemies.push({ type: 'alien', x: ex, y: ey, z: ez, hp: 4, cooldown: 60, size: 1.2, emoji: '👽', flash: 0 });
        else if (type === 'zombie') enemies.push({ type: 'zombie', x: ex, y: ey, z: ez, hp: 15, cooldown: 60, size: 1.4, flash: 0 });
        else enemies.push({ type: 'experimental', x: ex, y: ey, z: ez, hp: 10, cooldown: 60, size: 1.4, flash: 0 });
    }
};
window.spawnDebug = (em) => { 
    let cx = player.x + Math.cos(player.angle) * 4, cy = player.y + Math.sin(player.angle) * 4, z = getSafeFloorZ(cx, cy, player.z); 
    if (em === '📦') containers.push({ x: cx, y: cy, z: z, emoji: em, size: 0.9, items: new Array(10).fill(null) }); 
    else if (em === '🔥') campfires.push({ x: cx, y: cy, z: z, emoji: '🔥', size: 1.2, flicker: 1.0 }); 
    else animals.push({ x: cx, y: cy, z: z, emoji: em, size: 1.2, hp: 4, speed: 0.02, dead: false, drop: { type: 'food', emoji: '🍖', amount: 10 }, moveAngle: Math.random() * Math.PI * 2, moveTimer: 0 }); 
};