//THIS IS helpers.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

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

function spawnDirt(x, y, z, vx, vy, isHeavy) {
    let count = isHeavy ? 5 : 1;
    for(let i=0; i<count; i++) {
        let c = {r: 80 + Math.random()*20, g: 55 + Math.random()*15, b: 35 + Math.random()*10};
        bloodParticles.push({
            x: x, y: y, z: z + Math.random()*0.5,
            vx: vx + (Math.random()-0.5)*0.1, vy: vy + (Math.random()-0.5)*0.1, vz: Math.random()*0.15 + (isHeavy ? 0.1 : 0.05),
            color: c, life: 25 + Math.random()*20, size: Math.random()*0.1 + 0.05
        });
    }
}

function selectHotbar(index) {
    hotbarSelection = index;
    let item = inventory[index];
    if (item && item.id && ITEMS[item.id]) {
        weaponEl.innerText = ITEMS[item.id].name;
    } else if (item) {
        weaponEl.innerText = item.emoji + " Item";
    } else {
        weaponEl.innerText = "Empty Hands";
    }
    fireCooldown = 5;
    if (typeof updateHotbarUI === 'function') updateHotbarUI();
}

function takeDamage(amt) { if (godMode) return; player.hp -= amt; hpEl.innerText = player.hp; damageFlash.style.opacity = '0.5'; setTimeout(() => damageFlash.style.opacity = '0', 100); if (player.hp <= 0) location.reload(); }

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();