//THIS IS ui.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// Drag & Drop State Variables
let dragItemData = null;
let dragSourceType = null;
let dragSourceIndex = -1;
let dragEl = null;

// --- Tooltip Database ---
const ITEM_DETAILS = {
    // Resources
    '🪵': { name: 'Wood', desc: 'Freshly chopped timber. Used to craft torches.', category: 'resource' },
    '🪨': { name: 'Stone', desc: 'Heavy rock. Useful for building or crafting.', category: 'resource' },
    '🧶': { name: 'Wool', desc: 'Soft sheep wool. Soft and warm.', category: 'resource' },
    // Consumables
    '🩹': { name: 'Bandage', desc: 'Heals minor wounds and restores health.', category: 'heal' },
    '🍔': { name: 'Burger', desc: 'Juicy burger. Greatly satisfies hunger.', category: 'food' },
    '🥓': { name: 'Bacon', desc: 'Salty bacon strip. Delicious and filling.', category: 'food' },
    '🍗': { name: 'Chicken Leg', desc: 'Cooked chicken leg. Good source of protein.', category: 'food' },
    '🍖': { name: 'Raw Meat', desc: 'Edible, but maybe it should be cooked? Restores hunger.', category: 'food' },
    // Placeables
    '🔥': { name: 'Torch', desc: 'Provides light. Press Right-Click in inventory to place.', category: 'torch' },
    // Blocks
    '🟫': { name: 'Dirt Block', desc: 'A block of compressed soil. Right-Click in inventory to place.', category: 'block' },
    '🧊': { name: 'Cube Block', desc: 'A solid building cube. Right-Click in inventory to place.', category: 'block' },
    'wood_block': { name: 'Wood Block', desc: 'A block of processed wood. Right-Click in inventory to place.', category: 'block', emoji: '🪵' },
    'stone_block': { name: 'Stone Cube', desc: 'A cube crafted from stone. Right-Click in inventory to place.', category: 'block', emoji: '🪨' },
    // Weapons/Tools
    'pistol': { name: 'Pistol', desc: 'Semiautomatic handgun. Shoots fast, decent damage.', category: 'weapon' },
    'smg': { name: 'SMG', desc: 'Fully automatic submachine gun. High fire rate, high spread.', category: 'weapon' },
    'shotgun': { name: 'Shotgun', desc: 'Powerful close-range scatter gun. Fires 12 pellets at once.', category: 'weapon' },
    'axe': { name: 'Axe', desc: 'Sharp melee weapon and harvesting tool. Used to harvest Wood from trees.', category: 'tool' },
    'pickaxe': { name: 'Pickaxe', desc: 'Pointy mining tool. Used to harvest Stone from rocks.', category: 'tool' },
    'shovel': { name: 'Shovel', desc: 'Digging tool. Used to dig up dirt.', category: 'tool' },
    'coord_picker': { name: 'Coord Picker', desc: 'Developer tool to capture coordinates. Select it and click on vehicle models to copy local offset coordinates.', category: 'tool' }
};

function resolveItemDetails(item) {
    if (!item) return null;
    
    let details = {
        name: item.emoji + ' Item',
        desc: 'No description available.',
        category: item.type || 'resource',
        emoji: item.emoji || '📦',
        stats: {}
    };

    const baseItem = item.id ? ITEMS[item.id] : null;
    if (baseItem) {
        details.name = baseItem.name || details.name;
        details.category = baseItem.type || details.category;
    }

    const key = item.id || item.emoji;
    const info = ITEM_DETAILS[key];
    if (info) {
        details.name = info.name;
        details.desc = info.desc;
        if (info.category) details.category = info.category;
    }

    if (baseItem) {
        if (baseItem.dmg !== undefined && baseItem.dmg > 0) {
            details.stats['Damage'] = `${baseItem.dmg} DMG`;
        }
        if (baseItem.range !== undefined) {
            details.stats['Range'] = `${baseItem.range}m`;
        }
        if (baseItem.fireRate !== undefined) {
            details.stats['Fire Rate'] = baseItem.fireRate + ' ticks';
        }
        if (baseItem.spread !== undefined) {
            details.stats['Spread'] = (baseItem.spread * 100).toFixed(1) + '%';
        }
    } else {
        if (item.amount !== undefined) {
            if (item.type === 'heal') {
                details.stats['Heal Amount'] = `+${item.amount} HP`;
            } else if (item.type === 'food') {
                details.stats['Food Value'] = `+${item.amount} Food`;
            }
        }
    }

    return details;
}

function renderItemTooltip(item) {
    const details = resolveItemDetails(item);
    if (!details) return '';

    let statsHtml = '';
    const statKeys = Object.keys(details.stats);
    if (statKeys.length > 0) {
        statsHtml += '<div class="tooltip-divider"></div><div class="tooltip-stats">';
        for (let statName of statKeys) {
            statsHtml += `
                <div class="tooltip-stat-row">
                    <span class="tooltip-stat-label">${statName}</span>
                    <span class="tooltip-stat-value">${details.stats[statName]}</span>
                </div>
            `;
        }
        statsHtml += '</div>';
    }

    const badgeClass = details.category.toLowerCase();

    return `
        <div class="tooltip-header">
            <span class="tooltip-emoji">${details.emoji}</span>
            <div class="tooltip-title">${details.name}</div>
        </div>
        <div class="tooltip-badge ${badgeClass}">${details.category}</div>
        <div class="tooltip-divider"></div>
        <div class="tooltip-desc">${details.desc}</div>
        ${statsHtml}
    `;
}

function renderRecipeTooltip(recipe) {
    if (!recipe) return '';

    const resultItem = recipe.result;
    const details = resolveItemDetails(resultItem);
    
    let resourceCounts = {};
    for (let item of inventory) {
        if (item && (item.type === 'resource' || item.type === 'building' || item.type === 'torch' || item.type === 'block')) {
            let key = item.id || item.emoji;
            resourceCounts[key] = (resourceCounts[key] || 0) + (item.count || 1);
        }
    }

    let reqsHtml = '';
    for (let reqKey in recipe.req) {
        let reqAmt = recipe.req[reqKey];
        let hasAmt = resourceCounts[reqKey] || 0;
        let color = hasAmt >= reqAmt ? '#51cf66' : '#ff6b6b';
        let ingredientName = ITEM_DETAILS[reqKey] ? ITEM_DETAILS[reqKey].name : reqKey;
        let reqEmoji = (ITEM_DETAILS[reqKey] && ITEM_DETAILS[reqKey].emoji) ? ITEM_DETAILS[reqKey].emoji : (reqKey.length <= 2 ? reqKey : '📦');
        reqsHtml += `<div style="color: ${color}; display: flex; justify-content: space-between;">
            <span>${reqEmoji} ${ingredientName}</span>
            <span>${hasAmt}/${reqAmt}</span>
        </div>`;
    }

    return `
        <div class="tooltip-header">
            <span class="tooltip-emoji">${details.emoji}</span>
            <div class="tooltip-title">Craft: ${recipe.name}</div>
        </div>
        <div class="tooltip-badge craft">Craftable</div>
        <div class="tooltip-divider"></div>
        <div class="tooltip-desc">${details.desc}</div>
        <div class="tooltip-divider"></div>
        <div class="tooltip-reqs-title">Ingredients Required</div>
        <div class="tooltip-reqs-list">
            ${reqsHtml}
        </div>
    `;
}

let itemTooltipEl = null;

function updateTooltip(e) {
    if (!itemTooltipEl) {
        itemTooltipEl = document.getElementById('item-tooltip');
    }
    if (!itemTooltipEl || dragItemData) {
        hideTooltip();
        return;
    }

    let hoveredSlot = e.target.closest('.inv-slot, .hotbar-slot, .craft-btn');
    if (!hoveredSlot) {
        hideTooltip();
        return;
    }

    let html = '';
    
    // Case 1: Inventory slot
    if (hoveredSlot.classList.contains('inv-slot')) {
        let index = parseInt(hoveredSlot.dataset.index);
        let type = hoveredSlot.dataset.type;
        let targetInv = type === 'player' ? inventory : (activeContainer ? activeContainer.items : null);
        if (targetInv) {
            let item = targetInv[index];
            if (item) html = renderItemTooltip(item);
        }
    }
    // Case 2: Hotbar slot
    else if (hoveredSlot.classList.contains('hotbar-slot')) {
        let idParts = hoveredSlot.id.split('-');
        let index = parseInt(idParts[idParts.length - 1]);
        let item = inventory[index];
        if (item) html = renderItemTooltip(item);
    }
    // Case 3: Crafting button
    else if (hoveredSlot.classList.contains('craft-btn')) {
        let recipeIndex = parseInt(hoveredSlot.dataset.recipeIndex);
        if (!isNaN(recipeIndex)) {
            let recipe = RECIPES[recipeIndex];
            if (recipe) html = renderRecipeTooltip(recipe);
        }
    }

    if (!html) {
        hideTooltip();
        return;
    }

    itemTooltipEl.innerHTML = html;
    
    // Position tooltip near cursor with viewport bounds checking
    itemTooltipEl.classList.add('visible');
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Get tooltip dimensions
    const tooltipRect = itemTooltipEl.getBoundingClientRect();
    
    // Try placing tooltip to the bottom-right of cursor
    let posX = mouseX + 15;
    let posY = mouseY + 15;
    
    // Bounds check - horizontal
    if (posX + tooltipRect.width > window.innerWidth) {
        // Flip to left side of cursor
        posX = mouseX - tooltipRect.width - 15;
    }
    // Bounds check - vertical
    if (posY + tooltipRect.height > window.innerHeight) {
        // Flip to top side of cursor
        posY = mouseY - tooltipRect.height - 15;
    }
    
    // Keep it on screen (absolute minimums/maximums)
    posX = Math.max(10, Math.min(posX, window.innerWidth - tooltipRect.width - 10));
    posY = Math.max(10, Math.min(posY, window.innerHeight - tooltipRect.height - 10));
    
    itemTooltipEl.style.left = posX + 'px';
    itemTooltipEl.style.top = posY + 'px';
}

function hideTooltip() {
    if (!itemTooltipEl) {
        itemTooltipEl = document.getElementById('item-tooltip');
    }
    if (itemTooltipEl) {
        itemTooltipEl.classList.remove('visible');
    }
}

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
    hideTooltip();
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
            let key = item.id || item.emoji;
            resourceCounts[key] = (resourceCounts[key] || 0) + (item.count || 1);
        }
    }
    RECIPES.forEach((recipe, index) => {
        let canMake = true; let reqTextHtml = [];
        for (let reqKey in recipe.req) {
            let reqAmt = recipe.req[reqKey], hasAmt = resourceCounts[reqKey] || 0;
            let color = hasAmt >= reqAmt ? '#8f8' : '#f88';
            let reqEmoji = (ITEM_DETAILS[reqKey] && ITEM_DETAILS[reqKey].emoji) ? ITEM_DETAILS[reqKey].emoji : (reqKey.length <= 2 ? reqKey : '📦');
            reqTextHtml.push(`<span style="color:${color};">${hasAmt}/${reqAmt} ${reqEmoji}</span>`);
            if (hasAmt < reqAmt) canMake = false;
        }
        let btn = document.createElement('button');
        btn.className = 'craft-btn';
        btn.dataset.recipeIndex = index;
        let hasSpace = inventory.some(i => i === null) || inventory.some(i => i && (i.id || recipe.result.id ? i.id === recipe.result.id : i.emoji === recipe.result.emoji));
        if (!hasSpace) canMake = false;
        btn.disabled = !canMake;
        btn.innerHTML = `<div class="craft-title">${recipe.result.emoji} ${recipe.name}</div><div class="craft-reqs">${reqTextHtml.join(' &nbsp;|&nbsp; ')}</div>`;
        if (canMake) btn.onclick = () => craftRecipe(index);
        craftingList.appendChild(btn);
    });
}

function craftRecipe(index) {
    let recipe = RECIPES[index];
    for (let reqKey in recipe.req) {
        let needed = recipe.req[reqKey];
        for (let i = 0; i < inventory.length; i++) {
            let item = inventory[i];
            if (item) {
                let itemKey = item.id || item.emoji;
                if (itemKey === reqKey) {
                    if (item.count > needed) { item.count -= needed; needed = 0; break; }
                    else { needed -= item.count; inventory[i] = null; }
                }
            }
        }
    }
    giveItem({ ...recipe.result });
}

function giveItem(itemData) {
    if (itemData.type === 'resource' || itemData.type === 'building' || itemData.type === 'torch' || itemData.type === 'block') {
        let existing = inventory.find(i => i && (i.id || itemData.id ? i.id === itemData.id : i.emoji === itemData.emoji));
        if (existing) { 
            existing.count = (existing.count || 1) + (itemData.count || 1); 
            updateInventories(); 
            return true; 
        }
    }
    let emptyIndex = inventory.findIndex(x => x === null);
    if (emptyIndex !== -1) { 
        itemData.count = itemData.count || 1; 
        inventory[emptyIndex] = { ...itemData }; 
        updateInventories(); 
        return true; 
    }
    return false;
}

function dropActiveItem() {
    let activeItem = inventory[hotbarSelection];
    if (!activeItem) return;

    let dropItemData = { ...activeItem, count: 1 };
    activeItem.count--;
    if (activeItem.count <= 0) {
        inventory[hotbarSelection] = null;
    }
    updateInventories();
    spawnDroppedItem(dropItemData, true);
}

function spawnDroppedItem(itemData, thrownForward = true) {
    let force = thrownForward ? 0.12 : 0.02;
    let upForce = thrownForward ? 0.10 : 0.04;
    
    let vx = 0, vy = 0;
    if (thrownForward) {
        vx = Math.cos(player.angle) * force + (Math.random() - 0.5) * 0.04;
        vy = Math.sin(player.angle) * force + (Math.random() - 0.5) * 0.04;
    } else {
        let randAngle = Math.random() * Math.PI * 2;
        vx = Math.cos(randAngle) * force;
        vy = Math.sin(randAngle) * force;
    }

    droppedItems.push({
        x: player.x + Math.cos(player.angle) * 0.4,
        y: player.y + Math.sin(player.angle) * 0.4,
        z: player.z + 1.0,
        vx: vx,
        vy: vy,
        vz: upForce + Math.random() * 0.04,
        item: itemData,
        hoverTime: Math.random() * 100,
        cooldown: 50
    });
}

function spawnDroppedItemAt(itemData, x, y, z) {
    let randAngle = Math.random() * Math.PI * 2;
    let force = 0.02 + Math.random() * 0.04;
    let vx = Math.cos(randAngle) * force;
    let vy = Math.sin(randAngle) * force;
    let vz = 0.08 + Math.random() * 0.08;

    droppedItems.push({
        x: x,
        y: y,
        z: z,
        vx: vx,
        vy: vy,
        vz: vz,
        item: { ...itemData },
        hoverTime: Math.random() * 100,
        cooldown: 40
    });
}

function getPlacementTarget() {
    const pitchAngle = Math.atan2(player.pitch, canvas.width * currentZoom);
    const waterBob = (gameState === 'overworld' && player.isSubmerged) ? Math.sin(gameTime * 200) * 0.05 : 0;
    const camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
    let hitX = player.x + Math.cos(player.angle) * 4.0;
    let hitY = player.y + Math.sin(player.angle) * 4.0;
    let hitZ = player.z; 

    let foundSolid = false;
    let step = 0.2;
    for (let i = 0; i <= 6.0 / step; i++) {
        let rx = player.x + Math.cos(player.angle) * Math.cos(pitchAngle) * (i * step);
        let ry = player.y + Math.sin(player.angle) * Math.cos(pitchAngle) * (i * step);
        let rz = camZ + Math.sin(pitchAngle) * (i * step);
        
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
    updateTooltip(e);
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
            // Drop item on the ground when dragged outside panel
            spawnDroppedItem(dragItemData, false);
            dragItemData = null;
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
    hideTooltip();
    isPaused = document.pointerLockElement !== canvas; 
    if (isPaused) { 
        placementItem = null; 
        if (isLoading) {
            overlay.style.display = 'none';
            document.getElementById('loading-screen').style.display = 'flex';
        } else {
            overlay.style.display = (isInventoryOpen || isDebugOpen || isStairMenuOpen) ? 'none' : 'flex'; 
        }
        invScreen.style.display = isInventoryOpen ? 'flex' : 'none'; 
        containerUI.style.display = (isInventoryOpen && activeContainer) ? 'flex' : 'none'; 
        debugMenu.style.display = isDebugOpen ? 'block' : 'none'; stairMenu.style.display = isStairMenuOpen ? 'block' : 'none';
        interactTooltip.style.display = 'none'; keys = {}; 
        if (fpsCounterEl) {
            if (isDebugOpen) {
                fpsCounterEl.classList.add('debug-open');
                if (timeCounterEl) timeCounterEl.classList.add('debug-open');
            } else {
                fpsCounterEl.classList.remove('debug-open');
                if (timeCounterEl) timeCounterEl.classList.remove('debug-open');
            }
        }
    } else { 
        if (!hasLoaded) {
            isLoading = true;
            document.getElementById('loading-screen').style.display = 'flex';
            overlay.style.display = 'none';
            if (typeof startPreloading === 'function') {
                startPreloading();
            }
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
            if (fpsCounterEl) fpsCounterEl.classList.remove('debug-open');
            if (timeCounterEl) timeCounterEl.classList.remove('debug-open');
        }
    }
});

// Resumes pointer lock on click during loading
document.getElementById('loading-screen').addEventListener('click', () => {
    if (isLoading) {
        canvas.requestPointerLock();
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
    if (e.target.tagName === 'INPUT') return;
    if (isLoading) return;
    keys[e.code] = true;
    if (e.key >= '1' && e.key <= '8') selectHotbar(parseInt(e.key) - 1);
    if (e.key.toLowerCase() === 'f') isFlashlightOn = !isFlashlightOn; 
    
    if (e.key.toLowerCase() === 'b') {
        if (!isInventoryOpen && !isDebugOpen && !isStairMenuOpen && !isPaused && !player.inVehicle) {
            dropActiveItem();
        }
    }
    
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
                player.vehicleView = '3rd_back';
            } else if (droppedItems.includes(interactTarget)) {
                let success = giveItem({ ...interactTarget.item });
                if (success) {
                    droppedItems.splice(droppedItems.indexOf(interactTarget), 1);
                    interactTarget = null;
                    updateInventories();
                }
            } else if (interactTarget.rooms) enterBuilding(interactTarget); 
            else if (interactTarget.action === 'exit') exitBuilding();
            else if (interactTarget.action === 'stairs') { if (activeBuilding.floors > 1) { if (activeFloor === 0) changeFloor(1); else if (activeFloor === activeBuilding.floors - 1) changeFloor(-1); else { isStairMenuOpen = true; stairMenuTitle.innerText = `Stairwell (Floor ${activeFloor + 1})`; document.exitPointerLock(); } } }
            else { isInventoryOpen = true; activeContainer = interactTarget; updateInventories(); document.exitPointerLock(); }
        }
    }
    
    if (e.key.toLowerCase() === 'v') {
        if (player.inVehicle) {
            if (player.vehicleView === '1st') {
                player.vehicleView = '3rd_back';
            } else if (player.vehicleView === '3rd_back') {
                player.vehicleView = '3rd_front';
            } else {
                player.vehicleView = '1st';
            }
        } else {
            if (player.view === '1st') {
                player.view = '3rd_back';
            } else if (player.view === '3rd_back') {
                player.view = '3rd_front';
            } else {
                player.view = '1st';
            }
        }
    }

    if (e.key.toLowerCase() === 'p') {
        if (coordPickerActive) {
            pickX_screen = canvas.width / 2;
            pickY_screen = canvas.height / 2;
            triggerCoordPick = true;
            if (typeof render === 'function') {
                render();
            }
            if (typeof copyCoordsToClipboardDirectly === 'function') {
                copyCoordsToClipboardDirectly();
            }
        }
    }

    if (e.key.toLowerCase() === 'i') { if(!isInventoryOpen) { isInventoryOpen = true; isDebugOpen = isStairMenuOpen = false; activeContainer = null; updateInventories(); document.exitPointerLock(); } else canvas.requestPointerLock(); }
    if (e.key === '`' || e.key === '~') { if(!isDebugOpen) { isDebugOpen = true; isInventoryOpen = isStairMenuOpen = false; activeContainer = null; document.exitPointerLock(); } else canvas.requestPointerLock(); }
});
window.addEventListener('keyup', e => { if (e.target.tagName !== 'INPUT') keys[e.code] = false; });

// --- Debug Menu Hooks ---
dbgTimeEl.oninput = e => {
    gameTime = parseFloat(e.target.value);
    dbgTimeValEl.innerText = gameTime.toFixed(1);
    if (timeValEl) {
        let hours = Math.floor(gameTime);
        let minutes = Math.floor((gameTime - hours) * 60);
        timeValEl.innerText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
};
dbgTimeSpeedEl.oninput = e => { timeSpeed = parseFloat(e.target.value) || 1.0; };
document.getElementById('btn-hp').onclick = () => { player.hp = parseInt(document.getElementById('dbg-hp').value); hpEl.innerText = player.hp; };
document.getElementById('btn-stam').onclick = () => { player.stamina = parseInt(document.getElementById('dbg-stam').value); staminaEl.innerText = Math.floor(player.stamina); };
document.getElementById('btn-food').onclick = () => { player.food = parseInt(document.getElementById('dbg-food').value); foodEl.innerText = player.food; };
document.getElementById('dbg-god').onchange = e => godMode = e.target.checked;
document.getElementById('dbg-noclip').onchange = e => noclip = e.target.checked;
document.getElementById('dbg-freecam').onchange = e => {
    freecam = e.target.checked;
    if (freecam) {
        let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
        freecamX = player.x;
        freecamY = player.y;
        freecamZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
        
        if (player.inVehicle) {
            let v = player.inVehicle;
            if (player.vehicleView === '3rd_back' || player.vehicleView === '3rd_front') {
                let dirSign = player.vehicleView === '3rd_front' ? 1.0 : -1.0;
                freecamX = v.camX + Math.cos(player.angle) * dirSign * 9.5;
                freecamY = v.camY + Math.sin(player.angle) * dirSign * 9.5;
                freecamZ = v.camZ + 1.0 + player.baseHeight;
            } else {
                freecamX = v.x + Math.cos(v.angle) * 0.30 + Math.sin(v.angle) * 0.32;
                freecamY = v.y + Math.sin(v.angle) * 0.30 - Math.cos(v.angle) * 0.32;
                freecamZ = v.z + 0.45 + player.baseHeight;
            }
        } else if (player.view === '3rd_back' || player.view === '3rd_front') {
            let dist = 4.2;
            let dirSign = player.view === '3rd_front' ? 1.0 : -1.0;
            freecamX = player.x + Math.cos(player.angle) * dirSign * dist;
            freecamY = player.y + Math.sin(player.angle) * dirSign * dist;
            freecamZ = player.z + 1.0 + (0.2 / dist) * dist + (player.zOffset || 0) + waterBob;
        }
        
        freecamAngle = player.angle;
        freecamPitch = player.pitch;
    }
};
document.getElementById('dbg-infstam').onchange = e => infiniteStamina = e.target.checked;
document.getElementById('dbg-speed').onchange = e => speedMult = (parseInt(e.target.value) || 100) / 100;
document.getElementById('dbg-sprint').onchange = e => sprintMult = parseFloat(e.target.value) || 1.5;
document.getElementById('dbg-jump').onchange = e => jumpPower = parseFloat(e.target.value) || 0.28;
document.getElementById('dbg-flight').onchange = e => flightMode = e.target.checked;
document.getElementById('dbg-spawnenemies').onchange = e => spawnEnemiesToggle = e.target.checked;
document.getElementById('dbg-info').onchange = e => showDebugInfo = e.target.checked;
document.getElementById('dbg-lock-fps').onchange = e => lockFps30 = e.target.checked;

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
    return startZ;
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
        else if (type === 'zombie3d') enemies.push({ type: 'zombie3d', x: ex, y: ey, z: ez, hp: 15, cooldown: 60, size: 1.8, flash: 0 });
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

window.addEventListener('mousedown', hideTooltip);
window.addEventListener('mouseleave', hideTooltip);

// Init hotbar UI states immediately
updateInventories();
selectHotbar(0);

// --- HTML Coordinate Picker Panel Logic ---

// UI updates for picker panel
function updatePickerPanelUI() {
    let worldEl = document.getElementById('picker-world-coords');
    let localEl = document.getElementById('picker-local-coords');
    let copyWorldBtn = document.getElementById('picker-copy-world');
    let copyLocalBtn = document.getElementById('picker-copy-local');

    if (lastPickedCoord && lastPickedCoord.world) {
        let w = lastPickedCoord.world;
        worldEl.innerHTML = `<strong>World:</strong> X:${w.x.toFixed(3)} Y:${w.y.toFixed(3)} Z:${w.z.toFixed(3)}`;
        copyWorldBtn.style.display = 'inline-block';
        copyWorldBtn.innerText = 'Copy World';

        let l = lastPickedCoord.local;
        if (l) {
            localEl.innerHTML = `<strong>Vehicle (${lastPickedCoord.vehicleType}):</strong><br><span style="color:#ffaa00;">dx:${l.dx.toFixed(3)} dy:${l.dy.toFixed(3)} dz:${l.dz.toFixed(3)}</span>`;
            copyLocalBtn.style.display = 'inline-block';
            copyLocalBtn.innerText = 'Copy Local';
        } else {
            localEl.innerHTML = `<em>No vehicle hit (aim at vehicle)</em>`;
            copyLocalBtn.style.display = 'none';
        }
    } else {
        worldEl.innerHTML = `<em>Aim and press P to pick coords</em>`;
        localEl.innerHTML = "";
        copyWorldBtn.style.display = 'none';
        copyLocalBtn.style.display = 'none';
    }
}
window.updatePickerPanelUI = updatePickerPanelUI;

// Helper for temporary feedback text on copy button
function showTemporaryFeedback(buttonId, originalText) {
    let btn = document.getElementById(buttonId);
    btn.innerText = 'Copied!';
    setTimeout(() => {
        btn.innerText = originalText;
    }, 1200);
}

// Click-to-copy handlers
document.getElementById('picker-copy-local').onclick = () => {
    if (lastPickedCoord && lastPickedCoord.local) {
        let l = lastPickedCoord.local;
        let txt = `${l.dx.toFixed(3)}, ${l.dy.toFixed(3)}, ${l.dz.toFixed(3)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(() => {
                showTemporaryFeedback('picker-copy-local', 'Copy Local');
            }).catch(err => {
                console.error('Failed to copy local coords: ', err);
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = txt;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showTemporaryFeedback('picker-copy-local', 'Copy Local');
        }
    }
};

document.getElementById('picker-copy-world').onclick = () => {
    if (lastPickedCoord && lastPickedCoord.world) {
        let w = lastPickedCoord.world;
        let txt = `${w.x.toFixed(3)}, ${w.y.toFixed(3)}, ${w.z.toFixed(3)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(() => {
                showTemporaryFeedback('picker-copy-world', 'Copy World');
            }).catch(err => {
                console.error('Failed to copy world coords: ', err);
            });
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = txt;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showTemporaryFeedback('picker-copy-world', 'Copy World');
        }
    }
};

// Movable window dragging utility
function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        let newTop = element.offsetTop - pos2;
        let newLeft = element.offsetLeft - pos1;
        
        // Window bounds clamping
        if (newTop < 0) newTop = 0;
        if (newLeft < 0) newLeft = 0;
        if (newTop + element.offsetHeight > window.innerHeight) newTop = window.innerHeight - element.offsetHeight;
        if (newLeft + element.offsetWidth > window.innerWidth) newLeft = window.innerWidth - element.offsetWidth;
        
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        element.style.bottom = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Make picker panel draggable by its header
makeDraggable(document.getElementById('picker-panel'), document.getElementById('picker-header'));

// Run initial panel rendering update
updatePickerPanelUI();

// Copy coordinate value to clipboard and show feedback
function copyCoordsToClipboardDirectly() {
    if (!lastPickedCoord) return;
    
    let txt = "";
    let buttonId = "";
    let originalText = "";
    
    if (lastPickedCoord.local) {
        let l = lastPickedCoord.local;
        txt = `${l.dx.toFixed(3)}, ${l.dy.toFixed(3)}, ${l.dz.toFixed(3)}`;
        buttonId = 'picker-copy-local';
        originalText = 'Copy Local';
    } else if (lastPickedCoord.world) {
        let w = lastPickedCoord.world;
        txt = `${w.x.toFixed(3)}, ${w.y.toFixed(3)}, ${w.z.toFixed(3)}`;
        buttonId = 'picker-copy-world';
        originalText = 'Copy World';
    }
    
    if (!txt) return;
    
    const feedbackBtn = document.getElementById(buttonId);
    
    function setFeedback() {
        if (feedbackBtn) {
            feedbackBtn.innerText = 'Copied!';
            feedbackBtn.style.background = '#ffaa00';
            feedbackBtn.style.color = 'black';
            setTimeout(() => {
                feedbackBtn.innerText = originalText;
                feedbackBtn.style.background = '';
                feedbackBtn.style.color = '';
            }, 1200);
        }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => {
            setFeedback();
        }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopy(txt);
        });
    } else {
        fallbackCopy(txt);
    }
    
    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            setFeedback();
        } catch (err) {
            console.error('Fallback copy failed: ', err);
        }
        document.body.removeChild(textarea);
    }
}

// Intercept clicks on the canvas for coordinate picking
window.addEventListener('mousedown', (e) => {
    let activeItem = inventory[hotbarSelection];
    let isCoordPickerEquipped = activeItem && activeItem.id === 'coord_picker';
    if (!isCoordPickerEquipped && !coordPickerActive) return;

    // We only want to intercept if they click on the game canvas itself
    if (e.target !== canvas) {
        return;
    }

    let px_screen, py_screen;
    if (document.pointerLockElement === canvas) {
        // Pointer locked: pick at the center of the screen
        px_screen = canvas.width / 2;
        py_screen = canvas.height / 2;
    } else {
        // Pointer free: pick at cursor click position
        let rect = canvas.getBoundingClientRect();
        px_screen = (e.clientX - rect.left) * (canvas.width / rect.width);
        py_screen = (e.clientY - rect.top) * (canvas.height / rect.height);
    }

    pickX_screen = px_screen;
    pickY_screen = py_screen;
    triggerCoordPick = true;

    // Run render synchronously in the user click event handler stack!
    // This allows clipboard API to work since it's inside a user gesture.
    if (typeof render === 'function') {
        render();
    }

    // Attempt direct copy of the picked coordinate
    copyCoordsToClipboardDirectly();

    // Prevent default shooting/zooming etc. if pointer locked
    if (document.pointerLockElement === canvas) {
        e.preventDefault();
        e.stopPropagation();
    }
}, true); // Capture phase is critical to run before normal game input listeners!