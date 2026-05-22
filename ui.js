//THIS IS ui.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// Drag & Drop State Variables
let dragItemData = null;
let dragSourceType = null;
let dragSourceIndex = -1;
let dragEl = null;

// --- Inventory & UI Init ---
for(let i = 0; i < 24; i++) { 
    let slot = document.createElement('div'); 
    slot.className = 'inv-slot'; 
    slot.dataset.index = i; 
    slot.dataset.type = 'player'; 
    playerInvGrid.appendChild(slot); 
}

const hotbarGrid = document.getElementById('hotbar-grid');
for(let i = 0; i < 8; i++) {
    let slot = document.createElement('div');
    slot.className = 'hotbar-slot';
    slot.id = 'hotbar-slot-' + i;
    hotbarGrid.appendChild(slot);
}

for(let i = 0; i < 10; i++) { 
    let slot = document.createElement('div'); 
    slot.className = 'inv-slot'; 
    slot.dataset.index = i; 
    slot.dataset.type = 'container'; 
    containerInvGrid.appendChild(slot); 
}

document.getElementById('inv-hints').innerText = "Drag & Drop to Move | Right-Click to Use";

function updateHotbarUI() {
    for(let i = 0; i < 8; i++) {
        let slot = document.getElementById('hotbar-slot-' + i);
        if (slot) {
            if (i === hotbarSelection) slot.classList.add('active');
            else slot.classList.remove('active');
        }
    }
}

function updateInventories() {
    const pSlots = playerInvGrid.children;
    for(let i = 0; i < 24; i++) { 
        let item = inventory[i];
        if (pSlots[i]) {
            pSlots[i].innerHTML = item ? `${item.emoji}${item.count > 1 ? '<span style="position:absolute;bottom:2px;right:4px;font-size:14px;color:#fff;text-shadow:1px 1px 2px #000;">'+item.count+'</span>' : ''}` : ''; 
        }
    }
    
    if (activeContainer) { 
        const cSlots = containerInvGrid.children; 
        for(let i = 0; i < 10; i++) { 
            let item = activeContainer.items[i];
            if (cSlots[i]) {
                cSlots[i].innerHTML = item ? `${item.emoji}${item.count > 1 ? '<span style="position:absolute;bottom:2px;right:4px;font-size:14px;color:#fff;text-shadow:1px 1px 2px #000;">'+item.count+'</span>' : ''}` : ''; 
            }
        } 
    }

    // Reflect inventory 0-7 directly onto Hotbar
    for(let i = 0; i < 8; i++) {
        let item = inventory[i];
        let slot = document.getElementById('hotbar-slot-' + i);
        if (slot) {
            let numLabel = `<span style="position:absolute; top:2px; left:4px; color: rgba(255,255,255,0.5); font-size: 10px; font-weight: bold;">${i+1}</span>`;
            slot.innerHTML = item ? `${item.emoji}${item.count > 1 ? '<span style="position:absolute;bottom:2px;right:4px;font-size:14px;color:#fff;text-shadow:1px 1px 2px #000;">'+item.count+'</span>' : ''}${numLabel}` : numLabel;
        }
    }

    updateHotbarUI();
    updateCraftingUI();

    if (inventory[hotbarSelection]) {
        let item = inventory[hotbarSelection];
        weaponEl.innerText = (item.id && ITEMS[item.id]) ? ITEMS[item.id].name : item.emoji + " Item";
    } else {
        weaponEl.innerText = "Empty Hands";
    }
}

function updateCraftingUI() {
    craftingList.innerHTML = '';
    let resourceCounts = {};
    for (let item of inventory) {
        if (item && (item.type === 'resource' || item.type === 'building' || item.type === 'torch' || item.type === 'block')) {
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
    if (itemData.type === 'resource' || itemData.type === 'building' || itemData.type === 'torch' || itemData.type === 'block') {
        let existing = inventory.find(i => i && i.emoji === itemData.emoji);
        if (existing) { existing.count = (existing.count || 1) + (itemData.count || 1); updateInventories(); return; }
    }
    let emptyIndex = inventory.findIndex(x => x === null);
    if (emptyIndex !== -1) { itemData.count = itemData.count || 1; inventory[emptyIndex] = { ...itemData }; updateInventories(); }
}

function getPlacementTarget() {
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
        for(let z = Math.floor(player.z + player.baseHeight + 2); z >= 0; z--) {
            if (getSolid(Math.floor(hitX), Math.floor(hitY), z)) { hitZ = z + 1.0; break; }
        }
    }
    return { x: hitX, y: hitY, z: hitZ };
}

// Drag Start and Right-Click Logic
invScreen.addEventListener('mousedown', (e) => {
    let slotEl = e.target.closest('.inv-slot');
    if (!slotEl) return;
    
    let index = parseInt(slotEl.dataset.index);
    let type = slotEl.dataset.type;
    let targetInv = type === 'player' ? inventory : activeContainer.items;
    let isRightClick = e.button === 2;

    if (isRightClick) {
        if (dragItemData) return; // Ignore right-clicks while dragging
        
        let item = targetInv[index]; 
        if (!item) return;

        if (type === 'player') { 
            if (item.type === 'heal' && (player.hp < 100 || godMode)) { 
                player.hp = godMode ? player.hp : Math.min(100, player.hp + item.amount); hpEl.innerText = player.hp; 
                inventory[index] = null; healFlash.style.background = 'lime'; healFlash.style.opacity = '0.5'; setTimeout(() => healFlash.style.opacity = '0', 100); updateInventories(); 
            } 
            else if (item.type === 'food' && (player.food < 100 || godMode)) { 
                player.food = godMode ? player.food : Math.min(100, player.food + item.amount); foodEl.innerText = player.food; 
                inventory[index] = null; healFlash.style.background = 'orange'; healFlash.style.opacity = '0.5'; setTimeout(() => healFlash.style.opacity = '0', 100); updateInventories(); 
            }
            else if (item.type === 'building' || item.type === 'torch') {
                placementItem = item;
                placementIndex = index;
                isInventoryOpen = false;
                activeContainer = null;
                document.exitPointerLock();
                canvas.requestPointerLock();
                updateInventories();
            }
        }
    } else if (e.button === 0) {
        // Drag Start
        let item = targetInv[index];
        if (item) {
            dragItemData = item;
            dragSourceType = type;
            dragSourceIndex = index;
            targetInv[index] = null; // Temporarily clear from source array to not render it

            dragEl = document.createElement('div');
            dragEl.className = 'drag-item';
            dragEl.innerHTML = `${item.emoji}${item.count > 1 ? '<span class="drag-count">'+item.count+'</span>' : ''}`;
            document.body.appendChild(dragEl);
            
            dragEl.style.left = e.clientX + 'px';
            dragEl.style.top = e.clientY + 'px';
            
            updateInventories();
        }
    }
});

// Drag Move Logic
window.addEventListener('mousemove', e => {
    if (dragEl) {
        dragEl.style.left = e.clientX + 'px';
        dragEl.style.top = e.clientY + 'px';
    }
});

// Drag Drop Logic
window.addEventListener('mouseup', e => {
    if (e.button === 0 && dragItemData) {
        let dropSlot = e.target.closest('.inv-slot');
        let sourceInv = dragSourceType === 'player' ? inventory : activeContainer.items;
        
        if (dropSlot) {
            let destType = dropSlot.dataset.type;
            let destIndex = parseInt(dropSlot.dataset.index);
            let destInv = destType === 'player' ? inventory : activeContainer.items;

            // If dropped on the exact same slot it was taken from
            if (destType === dragSourceType && destIndex === dragSourceIndex) {
                sourceInv[dragSourceIndex] = dragItemData;
            } else {
                let destItem = destInv[destIndex];

                // If hovering the identical item and it's stackable
                if (destItem && destItem.emoji === dragItemData.emoji && destItem.id === dragItemData.id && destItem.type !== 'weapon' && destItem.type !== 'tool') {
                    destItem.count += dragItemData.count;
                    dragItemData = null; // Successfully merged, drag item consumed
                } else {
                    // Swap items
                    destInv[destIndex] = dragItemData;
                    sourceInv[dragSourceIndex] = destItem; // destItem is null if empty, or an item if swapping
                }
            }
        } else {
            // Cancel Drag - return to source if dropped outside
            sourceInv[dragSourceIndex] = dragItemData;
        }

        // Cleanup
        if (dragEl) {
            dragEl.remove();
            dragEl = null;
        }
        dragItemData = null;
        dragSourceType = null;
        dragSourceIndex = -1;
        updateInventories();
    }
});

window.addEventListener('contextmenu', e => e.preventDefault());

// --- Input Bindings ---
overlay.addEventListener('click', () => { if(!isInventoryOpen && !isDebugOpen && !isStairMenuOpen) canvas.requestPointerLock(); });

document.addEventListener('pointerlockchange', () => {
    isPaused = document.pointerLockElement !== canvas; 
    if (isPaused) { 
        placementItem = null; 
        overlay.style.display = (isInventoryOpen || isDebugOpen || isStairMenuOpen) ? 'none' : 'flex'; 
        invScreen.style.display = isInventoryOpen ? 'flex' : 'none'; 
        containerUI.style.display = (isInventoryOpen && activeContainer) ? 'flex' : 'none'; 
        debugMenu.style.display = isDebugOpen ? 'block' : 'none'; stairMenu.style.display = isStairMenuOpen ? 'block' : 'none';
        interactTooltip.style.display = 'none'; keys = {}; 
    } else { 
        // Handles dropping an item back if UI is closed mid-drag
        if (dragItemData) {
            let sourceInv = dragSourceType === 'player' ? inventory : activeContainer.items;
            sourceInv[dragSourceIndex] = dragItemData;
            if (dragEl) { dragEl.remove(); dragEl = null; }
            dragItemData = null;
        }
        
        isInventoryOpen = isDebugOpen = isStairMenuOpen = false; 
        activeContainer = null; 
        overlay.style.display = invScreen.style.display = debugMenu.style.display = stairMenu.style.display = 'none'; 
        updateInventories();
    }
});

window.addEventListener('mousedown', e => { 
    if (isPaused) return; 
    if (e.button === 0) {
        if (placementItem) {
            placementItem = null;
        } else {
            isMouseDown = true;
        }
    }
    if (e.button === 2) { 
        if (placementItem) {
            let hitTarget = getPlacementTarget();
            if (placementItem.type === 'torch') {
                torches.push({ x: hitTarget.x, y: hitTarget.y, z: hitTarget.z, emoji: '🔥', size: 0.4, flicker: 1.0 });
            } else {
                let isTent = placementItem.emoji === '⛺';
                buildings.push({ x: hitTarget.x, y: hitTarget.y, z: hitTarget.z, emoji: placementItem.emoji, rooms: placementItem.rooms, floors: placementItem.floors, roomW: isTent ? 6 : 10, roomH: isTent ? 6 : 10, wallH: isTent ? 3.0 : 3.5 });
            }
            
            let actualItem = inventory[placementIndex];
            if (actualItem && actualItem.emoji === placementItem.emoji) {
                actualItem.count--;
                if (actualItem.count <= 0) inventory[placementIndex] = null;
            }
            placementItem = null; 
            updateInventories();
        } else {
            isZooming = true; 
            adsEl.innerText = "ON"; 
        }
    } 
});
window.addEventListener('mouseup', e => { if (e.button === 0) isMouseDown = false; if (e.button === 2) { isZooming = false; adsEl.innerText = "OFF"; } });

window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return; keys[e.code] = true;
    if (e.key >= '1' && e.key <= '8') selectHotbar(parseInt(e.key) - 1);
    if (e.key.toLowerCase() === 'f') isFlashlightOn = !isFlashlightOn; 
    
    if (e.key.toLowerCase() === 'e') {
        if (player.inVehicle) {
            let v = player.inVehicle;
            player.inVehicle = null;
            player.x = v.x - Math.cos(v.angle) * 3;
            player.y = v.y - Math.sin(v.angle) * 3;
            player.z = getSafeFloorZ(player.x, player.y, v.z + 2) + 1.0;
            player.vz = 0;
        } else if (interactTarget && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen && !isPaused) { 
            if (vehicles.includes(interactTarget)) {
                player.inVehicle = interactTarget;
                player.vehicleView = '3rd';
            } else if (interactTarget.rooms) enterBuilding(interactTarget); 
            else if (interactTarget.action === 'exit') exitBuilding();
            else if (interactTarget.action === 'stairs') { if (activeBuilding.floors > 1) { if (activeFloor === 0) changeFloor(1); else if (activeFloor === activeBuilding.floors - 1) changeFloor(-1); else { isStairMenuOpen = true; stairMenuTitle.innerText = `Stairwell (Floor ${activeFloor + 1})`; document.exitPointerLock(); } } }
            else { isInventoryOpen = true; activeContainer = interactTarget; updateInventories(); document.exitPointerLock(); }
        }
    }
    
    if (e.key.toLowerCase() === 'v' && player.inVehicle) {
        player.vehicleView = player.vehicleView === '3rd' ? '1st' : '3rd';
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

document.getElementById('dbg-fov').oninput = e => { 
    let fovDegrees = parseInt(e.target.value);
    document.getElementById('dbg-fov-val').innerText = fovDegrees;
    baseZoom = 0.5 / Math.tan((fovDegrees / 2) * (Math.PI / 180));
};

document.getElementById('dbg-viewdist').oninput = e => {
    VIEW_DIST = parseInt(e.target.value);
    document.getElementById('dbg-viewdist-val').innerText = VIEW_DIST;
};

function closeStairMenu() { isStairMenuOpen = false; canvas.requestPointerLock(); }
document.getElementById('btn-stair-up').onclick = () => { changeFloor(1); closeStairMenu(); };
document.getElementById('btn-stair-down').onclick = () => { changeFloor(-1); closeStairMenu(); };
document.getElementById('btn-stair-cancel').onclick = closeStairMenu;

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
    else if (em === '🔥') torches.push({ x: cx, y: cy, z: z, emoji: '🔥', size: 0.4, flicker: 1.0 }); 
    else animals.push({ x: cx, y: cy, z: z, emoji: em, size: 1.2, hp: 4, speed: 0.02, dead: false, drop: { type: 'food', emoji: '🍖', amount: 10 }, moveAngle: Math.random() * Math.PI * 2, moveTimer: 0 }); 
};
window.spawnVehicle = (type) => { 
    let cx = player.x + Math.cos(player.angle) * 5, cy = player.y + Math.sin(player.angle) * 5;
    let z = getSafeFloorZ(cx, cy, player.z + 5); 
    vehicles.push({ type: type, x: cx, y: cy, z: z, angle: player.angle, pitch: 0, roll: 0, speed: 0 }); 
};

// --- SPLASH TEXT LOADER ---
fetch('splash.txt')
    .then(res => res.ok ? res.text() : Promise.reject())
    .then(txt => {
        let lines = txt.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
            document.getElementById('splash-text').innerText = lines[Math.floor(Math.random() * lines.length)];
        }
    })
    .catch(() => {
        // Fallback if splash.txt is missing
        document.getElementById('splash-text').innerText = "placeholder!";
    });

// Init hotbar UI states immediately
updateInventories();
selectHotbar(0);