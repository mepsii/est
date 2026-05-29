//THIS IS render.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

class ZombiePartCache {
    constructor(img, fallbackEmoji = null, trimPadding = true) {
        this.img = img;
        this.fallbackEmoji = fallbackEmoji;
        this.trimPadding = trimPadding;
        this.sprites = new Map();
    }
    
    get(flash, ambient) {
        let ambStep = ambient >= 1.0 ? 1.0 : Math.max(0.1, Math.round(ambient * 20) / 20);
        const key = `${flash}_${ambStep}`;
        if (this.sprites.has(key)) return this.sprites.get(key);
        
        if (!this.img.complete || this.img.naturalWidth === 0) {
            if (this.fallbackEmoji) {
                const c = document.createElement('canvas');
                c.width = 128;
                c.height = 128;
                const cx = c.getContext('2d');
                cx.font = '96px sans-serif';
                cx.textAlign = 'center';
                cx.textBaseline = 'middle';
                cx.fillText(this.fallbackEmoji, 64, 64);
                
                if (flash) {
                    cx.globalCompositeOperation = 'source-atop';
                    cx.fillStyle = 'white';
                    cx.fillRect(0, 0, 128, 128);
                    cx.globalCompositeOperation = 'source-over';
                } else if (ambStep < 1.0) {
                    cx.globalCompositeOperation = 'source-atop';
                    cx.fillStyle = `rgba(15, 20, 35, ${1.0 - ambStep})`;
                    cx.fillRect(0, 0, 128, 128);
                    cx.globalCompositeOperation = 'source-over';
                }
                return c;
            }
            return null;
        }
        
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 128;
        const cx = c.getContext('2d');
        cx.drawImage(this.img, 0, 0, 128, 128);
        
        // Remove checkerboard background (flood-fill from borders/corners)
        const imgData = cx.getImageData(0, 0, 128, 128);
        const data = imgData.data;
        const visited = new Uint8Array(128 * 128);
        const queue = [];
        
        function isBg(r, g, b, a) {
            if (a === 0) return true;
            let isWhite = (r > 230 && g > 230 && b > 230);
            let isGrey = (Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && Math.abs(r - b) < 8 && r > 180 && r < 220);
            return isWhite || isGrey;
        }
        
        // Push borders to queue
        for (let x = 0; x < 128; x++) {
            for (let y of [0, 127]) {
                let idx = (y * 128 + x) * 4;
                if (isBg(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
                    queue.push(x, y);
                    visited[y * 128 + x] = 1;
                }
            }
        }
        for (let y = 0; y < 128; y++) {
            for (let x of [0, 127]) {
                let idx = (y * 128 + x) * 4;
                if (!visited[y * 128 + x] && isBg(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
                    queue.push(x, y);
                    visited[y * 128 + x] = 1;
                }
            }
        }
        
        let head = 0;
        const dirs = [-1, 0, 1, 0, 0, -1, 0, 1];
        while (head < queue.length) {
            let qx = queue[head++];
            let qy = queue[head++];
            let idx = (qy * 128 + qx) * 4;
            data[idx+3] = 0; // Transparent
            
            for (let d = 0; d < 8; d += 2) {
                let nx = qx + dirs[d];
                let ny = qy + dirs[d+1];
                if (nx >= 0 && nx < 128 && ny >= 0 && ny < 128) {
                    let nidx = ny * 128 + nx;
                    if (!visited[nidx]) {
                        let pidx = nidx * 4;
                        if (isBg(data[pidx], data[pidx+1], data[pidx+2], data[pidx+3])) {
                            queue.push(nx, ny);
                            visited[nidx] = 1;
                        }
                    }
                }
            }
        }
        cx.putImageData(imgData, 0, 0);
        
        if (flash) {
            cx.globalCompositeOperation = 'source-atop';
            cx.fillStyle = 'white';
            cx.fillRect(0, 0, 128, 128);
            cx.globalCompositeOperation = 'source-over';
        } else if (ambStep < 1.0) {
            cx.globalCompositeOperation = 'source-atop';
            cx.fillStyle = `rgba(15, 20, 35, ${1.0 - ambStep})`;
            cx.fillRect(0, 0, 128, 128);
            cx.globalCompositeOperation = 'source-over';
        }
        
        let finalCanvas = c;
        if (this.trimPadding) {
            let minX = 128, maxX = 0, minY = 128, maxY = 0;
            let foundContent = false;
            // Get updated image data after transparency mask applied
            const cleanData = cx.getImageData(0, 0, 128, 128).data;
            for (let y = 0; y < 128; y++) {
                for (let x = 0; x < 128; x++) {
                    let idx = (y * 128 + x) * 4;
                    if (cleanData[idx+3] > 0) {
                        foundContent = true;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (foundContent) {
                let croppedW = maxX - minX + 1;
                let croppedH = maxY - minY + 1;
                const croppedCanvas = document.createElement('canvas');
                croppedCanvas.width = croppedW;
                croppedCanvas.height = croppedH;
                const croppedCx = croppedCanvas.getContext('2d');
                croppedCx.drawImage(c, minX, minY, croppedW, croppedH, 0, 0, croppedW, croppedH);
                finalCanvas = croppedCanvas;
            }
        }
        
        if (this.img.complete && this.img.naturalWidth !== 0) {
            this.sprites.set(key, finalCanvas);
        }
        return finalCanvas;
    }
}

const zombieHeadImg = new Image();
zombieHeadImg.src = 'textures/zombiehead.png';
const ZombieHeadCache = new ZombiePartCache(zombieHeadImg, '🧟', false);

const zombieTorsoImg = new Image();
zombieTorsoImg.src = 'textures/zombietorso.png';
const ZombieTorsoCache = new ZombiePartCache(zombieTorsoImg, null, true);

const zombieArmUpperImg = new Image();
zombieArmUpperImg.src = 'textures/zombiearmupper.png';
const ZombieArmUpperCache = new ZombiePartCache(zombieArmUpperImg, null, true);

const zombieArmLowerImg = new Image();
zombieArmLowerImg.src = 'textures/zombiearmlower.png';
const ZombieArmLowerCache = new ZombiePartCache(zombieArmLowerImg, null, true);

const zombieLegUpperImg = new Image();
zombieLegUpperImg.src = 'textures/zombielegupper.png';
const ZombieLegUpperCache = new ZombiePartCache(zombieLegUpperImg, null, true);

const zombieLegLowerImg = new Image();
zombieLegLowerImg.src = 'textures/zombieleglower.png';
const ZombieLegLowerCache = new ZombiePartCache(zombieLegLowerImg, null, true);

function generateDefaultZombieSkin() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);

    function fill(x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    // Classic Zombie Skin Texture layout in 64x64
    // Head (0,0 to 32,16)
    fill(8, 0, 8, 8, '#3c5a3c'); // Hair top
    fill(16, 0, 8, 8, '#3c5a3c'); // Hair bottom/neck
    fill(0, 8, 8, 8, '#507d50'); // Right head
    fill(8, 8, 8, 8, '#5a8c5a'); // Front head
    fill(16, 8, 8, 8, '#507d50'); // Left head
    fill(24, 8, 8, 8, '#466e46'); // Back head
    
    // Face features
    fill(9, 12, 2, 1, '#ffffff'); // Left eye white
    fill(13, 12, 2, 1, '#ffffff'); // Right eye white
    fill(10, 12, 1, 1, '#3c3c78'); // Left pupil
    fill(13, 12, 1, 1, '#3c3c78'); // Right pupil
    fill(10, 14, 4, 1, '#2c402c'); // Mouth
    
    // Torso (16,16 to 40,32)
    fill(20, 16, 8, 4, '#2e8b9a'); // Torso top
    fill(28, 16, 8, 4, '#2e8b9a'); // Torso bottom
    fill(16, 20, 4, 12, '#287a87'); // Torso right
    fill(20, 20, 8, 12, '#2e8b9a'); // Torso front
    fill(28, 20, 4, 12, '#287a87'); // Torso left
    fill(32, 20, 8, 12, '#246b76'); // Torso back
    
    // Right Arm (40,16 to 56,32)
    fill(44, 16, 4, 4, '#2e8b9a'); // Shoulder top
    fill(48, 16, 4, 4, '#5a8c5a'); // Hand bottom
    fill(40, 20, 4, 12, '#287a87'); // Right arm right
    fill(44, 20, 4, 12, '#2e8b9a'); // Right arm front
    fill(48, 20, 4, 12, '#287a87'); // Right arm left
    fill(52, 20, 4, 12, '#246b76'); // Right arm back
    fill(40, 26, 16, 6, '#5a8c5a'); // Sleeve skin bottom
    
    // Right Leg (0,16 to 16,32)
    fill(4, 16, 4, 4, '#3c3c78'); // Leg top
    fill(8, 16, 4, 4, '#3c3c78'); // Leg bottom
    fill(0, 20, 4, 12, '#323264'); // Leg right
    fill(4, 20, 4, 12, '#3c3c78'); // Leg front
    fill(8, 20, 4, 12, '#323264'); // Leg left
    fill(12, 20, 4, 12, '#282850'); // Leg back
    
    // Left Arm (32,48 to 48,64)
    fill(36, 48, 4, 4, '#2e8b9a'); // Shoulder top
    fill(40, 48, 4, 4, '#5a8c5a'); // Hand bottom
    fill(32, 52, 4, 12, '#287a87'); // Left arm right
    fill(36, 52, 4, 12, '#2e8b9a'); // Left arm front
    fill(40, 52, 4, 12, '#287a87'); // Left arm left
    fill(44, 52, 4, 12, '#246b76'); // Left arm back
    fill(32, 58, 16, 6, '#5a8c5a'); // Hand skin
    
    // Left Leg (16,48 to 32,64)
    fill(20, 48, 4, 4, '#3c3c78'); // Leg top
    fill(24, 48, 4, 4, '#3c3c78'); // Leg bottom
    fill(16, 52, 4, 12, '#323264'); // Leg right
    fill(20, 52, 4, 12, '#3c3c78'); // Leg front
    fill(24, 52, 4, 12, '#323264'); // Leg left
    fill(28, 52, 4, 12, '#282850'); // Leg back
    
    return canvas;
}

let leftLimbsTransparent = false;
let checkedSkinLimbs = false;

function checkSkinTransparency() {
    if (checkedSkinLimbs) return;
    let img = minecraftZombieSkinImg;
    if (!img.complete || img.naturalWidth === 0) return;
    
    checkedSkinLimbs = true;
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        
        if (tempCanvas.width === 64 && tempCanvas.height === 64) {
            const imgData = tempCtx.getImageData(16, 48, 32, 16);
            let allTransparent = true;
            for (let i = 3; i < imgData.data.length; i += 4) {
                if (imgData.data[i] > 0) {
                    allTransparent = false;
                    break;
                }
            }
            if (allTransparent) {
                leftLimbsTransparent = true;
                console.log("Detected transparent left limbs in skin, enabling mirroring fallback.");
            }
        }
    } catch (e) {
        console.warn("Could not check skin transparency:", e);
    }
}

function getMinecraftUVs(partName, faceIndex, skinHeight) {
    if (minecraftZombieSkinImg.complete && !checkedSkinLimbs) {
        checkSkinTransparency();
    }

    if (partName === 'upperArm') partName = 'rightUpperArm';
    if (partName === 'lowerArm') partName = 'rightLowerArm';
    if (partName === 'upperLeg') partName = 'rightUpperLeg';
    if (partName === 'lowerLeg') partName = 'rightLowerLeg';

    // Stump checks
    if ((partName.endsWith('UpperArm') || partName.endsWith('UpperLeg')) && faceIndex === 5) return null;
    if ((partName.endsWith('LowerArm') || partName.endsWith('LowerLeg')) && faceIndex === 4) return null;

    let isOldSkin = (skinHeight === 32) || leftLimbsTransparent;

    if (partName === 'head') {
        const uvs = [
            [8, 8, 16, 16],  // Front (+Y)
            [24, 8, 32, 16], // Back (-Y)
            [16, 8, 24, 16], // Left (-X)
            [0, 8, 8, 16],   // Right (+X)
            [8, 0, 16, 8],   // Top (+Z)
            [16, 0, 24, 8]   // Bottom (-Z)
        ];
        return uvs[faceIndex];
    }
    if (partName === 'torso') {
        const uvs = [
            [20, 20, 28, 32], // Front
            [32, 20, 40, 32], // Back
            [28, 20, 32, 32], // Left
            [16, 20, 20, 32], // Right
            [20, 16, 28, 20], // Top
            [28, 16, 36, 20]  // Bottom
        ];
        return uvs[faceIndex];
    }

    // Right Arm
    if (partName === 'rightUpperArm') {
        const uvs = [
            [44, 20, 48, 26], // Front
            [52, 20, 56, 26], // Back
            [48, 20, 52, 26], // Left
            [40, 20, 44, 26], // Right
            [44, 16, 48, 20]  // Top
        ];
        return uvs[faceIndex];
    }
    if (partName === 'rightLowerArm') {
        const uvs = [
            [44, 26, 48, 32], // Front
            [52, 26, 56, 32], // Back
            [48, 26, 52, 32], // Left
            [40, 26, 44, 32], // Right
            null,
            [48, 16, 52, 20]  // Bottom
        ];
        return uvs[faceIndex];
    }

    // Left Arm
    if (partName === 'leftUpperArm') {
        if (isOldSkin) return getMinecraftUVs('rightUpperArm', faceIndex, skinHeight);
        const uvs = [
            [36, 52, 40, 58], // Front
            [44, 52, 48, 58], // Back
            [40, 52, 44, 58], // Left
            [32, 52, 36, 58], // Right
            [36, 48, 40, 52]  // Top
        ];
        return uvs[faceIndex];
    }
    if (partName === 'leftLowerArm') {
        if (isOldSkin) return getMinecraftUVs('rightLowerArm', faceIndex, skinHeight);
        const uvs = [
            [36, 58, 40, 64], // Front
            [44, 58, 48, 64], // Back
            [40, 58, 44, 64], // Left
            [32, 58, 36, 64], // Right
            null,
            [40, 48, 44, 52]  // Bottom
        ];
        return uvs[faceIndex];
    }

    // Right Leg
    if (partName === 'rightUpperLeg') {
        const uvs = [
            [4, 20, 8, 26],   // Front
            [12, 20, 16, 26], // Back
            [8, 20, 12, 26],  // Left
            [0, 20, 4, 26],   // Right
            [4, 16, 8, 20]    // Top
        ];
        return uvs[faceIndex];
    }
    if (partName === 'rightLowerLeg') {
        const uvs = [
            [4, 26, 8, 32],   // Front
            [12, 26, 16, 32], // Back
            [8, 26, 12, 32],  // Left
            [0, 26, 4, 32],   // Right
            null,
            [8, 16, 12, 20]   // Bottom
        ];
        return uvs[faceIndex];
    }

    // Left Leg
    if (partName === 'leftUpperLeg') {
        if (isOldSkin) return getMinecraftUVs('rightUpperLeg', faceIndex, skinHeight);
        const uvs = [
            [20, 52, 24, 58], // Front
            [28, 52, 32, 58], // Back
            [24, 52, 28, 58], // Left
            [16, 52, 20, 58], // Right
            [20, 48, 24, 52]  // Top
        ];
        return uvs[faceIndex];
    }
    if (partName === 'leftLowerLeg') {
        if (isOldSkin) return getMinecraftUVs('rightLowerLeg', faceIndex, skinHeight);
        const uvs = [
            [20, 58, 24, 64], // Front
            [28, 58, 32, 64], // Back
            [24, 58, 28, 64], // Left
            [16, 58, 20, 64], // Right
            null,
            [24, 48, 28, 52]  // Bottom
        ];
        return uvs[faceIndex];
    }

    return null;
}

function getFaceCornerUVs(faceIndex, uMin, vMin, uMax, vMax) {
    if (faceIndex === 0) { // Front
        return [
            { u: uMin, v: vMax },
            { u: uMax, v: vMax },
            { u: uMax, v: vMin },
            { u: uMin, v: vMin }
        ];
    }
    if (faceIndex === 1) { // Back
        return [
            { u: uMax, v: vMax },
            { u: uMin, v: vMax },
            { u: uMin, v: vMin },
            { u: uMax, v: vMin }
        ];
    }
    if (faceIndex === 2) { // Left
        return [
            { u: uMin, v: vMax },
            { u: uMax, v: vMax },
            { u: uMax, v: vMin },
            { u: uMin, v: vMin }
        ];
    }
    if (faceIndex === 3) { // Right
        return [
            { u: uMin, v: vMax },
            { u: uMax, v: vMax },
            { u: uMax, v: vMin },
            { u: uMin, v: vMin }
        ];
    }
    if (faceIndex === 4) { // Top
        return [
            { u: uMin, v: vMax },
            { u: uMax, v: vMax },
            { u: uMax, v: vMin },
            { u: uMin, v: vMin }
        ];
    }
    if (faceIndex === 5) { // Bottom
        return [
            { u: uMin, v: vMin },
            { u: uMax, v: vMin },
            { u: uMax, v: vMax },
            { u: uMin, v: vMax }
        ];
    }
    return null;
}

function drawTexturedTriangle(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2, light, isFlash, fog, sky, alpha = 1.0) {
    if (isFlash) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.fill();
        ctx.restore();
        return;
    }

    let den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (Math.abs(den) < 1e-5) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${90 * light | 0}, ${140 * light | 0}, ${90 * light | 0})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.fill();
        ctx.restore();
        return;
    }

    let a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / den;
    let c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / den;
    let e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / den;
    let b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / den;
    let d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / den;
    let f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / den;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    if (light < 1.0 || fog > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        
        if (light < 1.0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${1.0 - light})`;
            ctx.fill();
        }
        if (fog > 0) {
            ctx.fillStyle = `rgba(${sky.r | 0}, ${sky.g | 0}, ${sky.b | 0}, ${fog})`;
            ctx.fill();
        }
        ctx.restore();
    }
}

const fallbackSkinCanvas = generateDefaultZombieSkin();
const minecraftZombieSkinImg = new Image();
minecraftZombieSkinImg.onload = () => {
    checkedSkinLimbs = false;
    checkSkinTransparency();
};
minecraftZombieSkinImg.src = 'textures/zombie_skin.png';

function render() {
    if (isLoading) return;
    if (isPaused && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) return;

    meshesBuiltThisFrame = 0;

    let animTime = performance.now() * 0.0015;

    let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
    let camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;

    const fov = canvas.width * currentZoom, hY = canvas.height/2 + player.pitch;
    const cosA = Math.cos(player.angle), sinA = Math.sin(player.angle);
    const pitchAngle = Math.atan2(player.pitch, fov);
    const cosP = Math.cos(pitchAngle), sinP = Math.sin(pitchAngle);
    const aimX = cosA * Math.cos(pitchAngle), aimY = sinA * Math.cos(pitchAngle), aimZ = Math.sin(pitchAngle);

    renderCount = 0; 
    let sky = getSkyColor(gameTime);
    let ambient = getAmbientLight(gameTime);
    let visibleTorches = torches.filter(c => Math.hypot(c.x - player.x, c.y - player.y) < VIEW_DIST);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = `rgb(${sky.r|0}, ${sky.g|0}, ${sky.b|0})`; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    function project3D(px, py, pz) {
        let dx = px - player.x, dy = py - player.y, dz = pz - camZ;
        let rx = dx * cosA + dy * sinA;
        let ry = dx * -sinA + dy * cosA;
        let rz = dz;
        let cx = ry;
        let cy = rz * cosP - rx * sinP;
        let cz = rz * sinP + rx * cosP;
        if (cz < 0.1) return null; 
        let sx = canvas.width/2 + (cx / cz) * fov;
        let sy = canvas.height/2 - (cy / cz) * fov;
        return { sx, sy, depth: cz };
    }

    const getDepth = (x, y, z) => {
        let dx = x - player.x, dy = y - player.y, dz = z - camZ;
        let rx = dx * cosA + dy * sinA;
        let rz = dz;
        return rz * sinP + rx * cosP;
    };

    let fovMult = 0.7 / currentZoom; 

    if (gameState === 'overworld') {
        let sunTimeAngle = ((gameTime - 6) / 24) * Math.PI * 2;
        let sunDx = Math.cos(sunTimeAngle) * 50000;
        let sunDz = Math.sin(sunTimeAngle) * 50000;
        let sunDy = 15000; 
        let distSqCel = sunDx*sunDx + sunDy*sunDy + sunDz*sunDz;
        
        let sunRotX = sunDx * cosA + sunDy * sinA;
        if (sunRotX > 0) {
            let o = getRenderItem(); o.type = 'celestial'; o.emoji = '☀️'; o.depthSq = distSqCel;
            o.wX = player.x + sunDx; o.wY = player.y + sunDy; o.h = camZ + sunDz; o.size = 6000;
        }
        
        let moonDx = -sunDx, moonDy = -sunDy, moonDz = -sunDz;
        let moonRotX = moonDx * cosA + moonDy * sinA;
        if (moonRotX > 0) {
            let o = getRenderItem(); o.type = 'celestial'; o.emoji = '🌕'; o.depthSq = distSqCel;
            o.wX = player.x + moonDx; o.wY = player.y + moonDy; o.h = camZ + moonDz; o.size = 5000;
        }

        let cloudHeight = 130;
        let cloudGrid = 20;
        let cloudViewDist = 200;
        let cloudRad = Math.ceil(cloudViewDist / cloudGrid);
        let cloudSpeed = 25;
        let cloudMoveX = gameTime * cloudSpeed;
        let pCxCloud = Math.floor((player.x - cloudMoveX) / cloudGrid);
        let pCyCloud = Math.floor(player.y / cloudGrid);
        
        let cGridSize = cloudRad * 2 + 3;
        let cloudNoise = new Float32Array(cGridSize * cGridSize);
        for (let x = 0; x < cGridSize; x++) {
            for (let y = 0; y < cGridSize; y++) {
                let cx = pCxCloud - cloudRad - 1 + x;
                let cy = pCyCloud - cloudRad - 1 + y;
                cloudNoise[x + y * cGridSize] = fbm2D(cx * cloudGrid * 0.012, cy * cloudGrid * 0.012, 2);
            }
        }

        let cH = 12; 
        let colorTop = 'rgba(255, 255, 255, 0.5)';
        let colorBottom = 'rgba(210, 210, 210, 0.5)';
        let colorSide1 = 'rgba(235, 235, 235, 0.5)';
        let colorSide2 = 'rgba(220, 220, 220, 0.5)';

        for (let x = 1; x < cGridSize - 1; x++) {
            for (let y = 1; y < cGridSize - 1; y++) {
                if (cloudNoise[x + y * cGridSize] > 0.45) {
                    let cx = pCxCloud - cloudRad - 1 + x;
                    let cy = pCyCloud - cloudRad - 1 + y;
                    let wx = cx * cloudGrid + cloudMoveX;
                    let wy = cy * cloudGrid;
                    
                    let n_px = cloudNoise[(x + 1) + y * cGridSize] > 0.45;
                    let n_nx = cloudNoise[(x - 1) + y * cGridSize] > 0.45;
                    let n_py = cloudNoise[x + (y + 1) * cGridSize] > 0.45;
                    let n_ny = cloudNoise[x + (y - 1) * cGridSize] > 0.45;
                    
                    let addCloudFace = (pts, col) => {
                        let cX = (pts[0].x + pts[2].x)/2, cY = (pts[0].y + pts[2].y)/2, cZ = (pts[0].z + pts[2].z)/2;
                        let dX = cX - player.x, dY = cY - player.y, dZ = cZ - camZ;
                        let rotX = dX * cosA + dY * sinA;
                        if (rotX > -cloudGrid && rotX < cloudViewDist) {
                            let fRotY = dX * -sinA + dY * cosA;
                            if (Math.abs(fRotY) <= Math.max(0, rotX) * fovMult + cloudGrid * 2) {
                                let o = getRenderItem();
                                o.type = 'cloudPoly'; o.pts = pts; o.color = col;
                                o.depthSq = rotX * rotX;
                            }
                        }
                    };

                    addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight} ], colorBottom);
                    addCloudFace([ {x: wx, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], colorTop);
                    
                    if (!n_nx) addCloudFace([ {x: wx, y: wy, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy, z: cloudHeight + cH} ], colorSide1);
                    if (!n_px) addCloudFace([ {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH} ], colorSide1);
                    if (!n_ny) addCloudFace([ {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH} ], colorSide2);
                    if (!n_py) addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], colorSide2);
                }
            }
        }

        let pCx = Math.floor(player.x / CHUNK_SIZE), pCy = Math.floor(player.y / CHUNK_SIZE);
        let chunkRadius = Math.ceil(VIEW_DIST / CHUNK_SIZE);
        
        for (let cx = pCx - chunkRadius; cx <= pCx + chunkRadius; cx++) {
            for (let cy = pCy - chunkRadius; cy <= pCy + chunkRadius; cy++) {
                let dx = cx * CHUNK_SIZE + CHUNK_SIZE/2 - player.x, dy = cy * CHUNK_SIZE + CHUNK_SIZE/2 - player.y;
                let cRotX = dx * cosA + dy * sinA;
                let cRotY = dx * -sinA + dy * cosA;
                
                if (cRotX < -CHUNK_SIZE * 1.5) continue; 
                if (Math.abs(cRotY) > cRotX * fovMult + CHUNK_SIZE * 1.5) continue;
                
                let faces = getChunkMesh(cx, cy);
                for (let i = 0; i < faces.length; i++) {
                    let f = faces[i];
                    let cX = f.cx, cY = f.cy, cZ = f.cz;
                    let dX = cX - player.x, dY = cY - player.y, dZ = cZ - camZ;
                    
                    let rx = dX * cosA + dY * sinA;
                    let ry = dX * -sinA + dY * cosA;
                    let rz = dZ;
                    let cz = rz * sinP + rx * cosP;
                    
                    if (cz > 0.1 && cz < VIEW_DIST) {
                        let cx_cam = ry;
                        if (Math.abs(cx_cam) > cz * fovMult + 3.0) continue;
                        
                        let nx = f.norm.x, ny = f.norm.y, nz = f.norm.z;
                        if (dX * nx + dY * ny + dZ * nz > 0 && !f.isWater) continue;
                        
                        let distSq = dX*dX + dY*dY + dZ*dZ;
                        if (distSq >= VIEW_DIST * VIEW_DIST * 0.90) continue;
                        
                        let o = getRenderItem();
                        o.type = 'chunk_face';
                        o.face = f;
                        o.depthSq = cz * cz;
                        o.wX = cX; o.wY = cY; o.h = cZ;
                    }
                }
                
                let chunk = getMapChunk(cx, cy);
                for (let i = 0; i < chunk.length; i++) {
                    let obj = chunk[i];
                    let cz = getDepth(obj.wx, obj.wy, obj.h);
                    if (cz > 0.2 && cz < VIEW_DIST) {
                        let dx = obj.wx - player.x, dy = obj.wy - player.y;
                        let rx = dx * cosA + dy * sinA;
                        let ry = dx * -sinA + dy * cosA;
                        if (Math.abs(ry) < cz * fovMult + 3.0) {
                            let o = getRenderItem(); o.type = obj.type; o.emoji = obj.emoji; o.size = obj.size; o.hp = obj.hp; o.depthSq = cz*cz; o.h = obj.h; o.wX = obj.wx; o.wY = obj.wy;
                        }
                    }
                }
            }
        }

        for (let v of vehicles) {
            let cz = getDepth(v.x, v.y, v.z);
            if (cz < -10 || cz > VIEW_DIST * 1.5) continue;
            let dx = v.x - player.x, dy = v.y - player.y;
            let rx = dx * cosA + dy * sinA;
            let ry = dx * -sinA + dy * cosA;
            if (Math.abs(ry) > cz * fovMult + 10.0) continue;
            if (player.inVehicle === v && player.vehicleView === '1st') continue; 
            
            let model = WEAPON_MODELS[v.type];
            if (model) {
                let conf = VEHICLE_MODEL_CONFIG[v.type] || { scale: 1, rotX: 0, rotY: 0, rotZ: 0, offsetZ: 0 };
                let vcx = Math.cos(v.angle), vsx = Math.sin(v.angle);
                
                for (let f of model.faces) {
                    let wPts = [];
                    for (let pt of f.pts) {
                        let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, conf.rotZ);
                        p1.x *= conf.scale; p1.y *= conf.scale; p1.z *= conf.scale;
                        
                        let cp = Math.cos(v.pitch), sp = Math.sin(v.pitch); 
                        let cr = Math.cos(v.roll), sr = Math.sin(v.roll);
                        
                        let p2x = p1.x * cp - p1.z * sp;
                        let p2y = p1.y;
                        let p2z = p1.x * sp + p1.z * cp;
                        
                        let p3x = p2x;
                        let p3y = p2y * cr - p2z * sr;
                        let p3z = p2y * sr + p2z * cr;
                        
                        let wx = p3x * vcx - p3y * vsx;
                        let wy = p3x * vsx + p3y * vcx;
                        
                        wPts.push({ x: v.x + wx, y: v.y + wy, z: v.z + p3z + (conf.offsetZ || 0) });
                    }
                    
                    let u = { x: wPts[1].x - wPts[0].x, y: wPts[1].y - wPts[0].y, z: wPts[1].z - wPts[0].z };
                    let w = { x: wPts[2].x - wPts[0].x, y: wPts[2].y - wPts[0].y, z: wPts[2].z - wPts[0].z };
                    let nx = u.y*w.z - u.z*w.y, ny = u.z*w.x - u.x*w.z, nz = u.x*w.y - u.y*w.x;
                    
                    if (nx*(wPts[0].x - player.x) + ny*(wPts[0].y - player.y) + nz*(wPts[0].z - camZ) > 0) continue;
                    
                    let cX = (wPts[0].x+wPts[1].x+wPts[2].x)/3, cY = (wPts[0].y+wPts[1].y+wPts[2].y)/3, cZ = (wPts[0].z+wPts[1].z+wPts[2].z)/3;
                    let czFace = getDepth(cX, cY, cZ);
                    
                    if (czFace > 0.1) {
                        let o = getRenderItem();
                        o.type = 'objWorldFace'; o.pts = wPts; o.color = f.color; o.depthSq = czFace * czFace;
                        o.wX = cX; o.wY = cY; o.h = cZ; o.norm = {x: nx, y: ny, z: nz};
                    }
                }
            } else {
                let o = getRenderItem(); o.type = 'emoji'; o.emoji = '🚚'; o.size = 4; o.depthSq = cz*cz; o.h = v.z; o.wX = v.x; o.wY = v.y; o.targeted = (v === interactTarget);
            }
        }
        
        for (let e of enemies) {
            let cz = getDepth(e.x, e.y, e.z);
            if (cz > 0.2 && cz < VIEW_DIST) {
                let dx = e.x - player.x, dy = e.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 4.0) {
                    if (e.type === 'zombie3d') {
                        add3DZombieFaces(e, ambient);
                    } else {
                        let o = getRenderItem();
                        o.hp = e.hp;
                        o.flash = e.flash;
                        o.depthSq = cz * cz;
                        o.size = e.size;
                        o.h = e.z;
                        o.wX = e.x;
                        o.wY = e.y;
                        if (e.type === 'experimental' || e.type === 'zombie') {
                            o.type = 'locationalEnemy';
                            o.obj = e;
                        } else {
                            o.type = 'emoji';
                            o.emoji = e.emoji || '👽';
                        }
                    }
                }
            }
        }
        for (let c of torches) {
            let cz = getDepth(c.x, c.y, c.z);
            if (cz > 0.2 && cz < VIEW_DIST) {
                let dx = c.x - player.x, dy = c.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 4.0) {
                    let o = getRenderItem(); o.type = 'emoji'; o.emoji = c.emoji; o.size = c.size; o.depthSq = cz*cz; o.h = c.z; o.wX = c.x; o.wY = c.y;
                    if (ambient < 1.0) {
                        let g = getRenderItem(); g.type = 'torchBloom'; g.depthSq = cz*cz - 0.1; g.h = c.z; g.flicker = c.flicker; g.size = c.size; g.wX = c.x; g.wY = c.y;
                    }
                }
            }
        }
        for (let e of containers) {
            let cz = getDepth(e.x, e.y, e.z);
            if (cz > 0.2 && cz < VIEW_DIST) {
                let dx = e.x - player.x, dy = e.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 4.0) {
                    let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.depthSq = cz*cz; o.h = e.z; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y;
                }
            }
        }
        for (let e of animals) {
            let cz = getDepth(e.x, e.y, e.z);
            if (cz > 0.2 && cz < VIEW_DIST) {
                let dx = e.x - player.x, dy = e.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 4.0) {
                    let o = getRenderItem(); o.type = 'animal'; o.emoji = e.emoji; o.size = e.size; o.hp = (!e.dead ? e.hp : undefined); o.depthSq = cz*cz; o.h = e.z; o.targeted = e === interactTarget; o.dead = e.dead; o.wX = e.x; o.wY = e.y;
                }
            }
        }
        for (let b of buildings) {
            let cz = getDepth(b.x, b.y, b.z);
            if (cz > 0.2 && cz < VIEW_DIST) {
                let dx = b.x - player.x, dy = b.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 8.0) {
                    let o = getRenderItem(); o.type = 'emoji'; o.emoji = b.emoji; o.size = 4.5; o.depthSq = cz*cz; o.h = b.z; o.targeted = b === interactTarget; o.wX = b.x; o.wY = b.y;
                }
            }
        }
        for (let d of damageTexts) {
            let cz = getDepth(d.x, d.y, d.z);
            if (cz > 0.2 && cz < VIEW_DIST) {
                let dx = d.x - player.x, dy = d.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 2.0) {
                    let o = getRenderItem(); o.type = 'dmgText'; o.text = Math.round(d.amt*10)/10; o.depthSq = cz*cz; o.h = d.z; o.life = d.life; o.wX = d.x; o.wY = d.y;
                }
            }
        }
        for (let b of bloodParticles) {
            let cz = getDepth(b.x, b.y, b.z);
            if (cz > 0.1 && cz < VIEW_DIST) {
                let dx = b.x - player.x, dy = b.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 2.0) {
                    if (b.isLimb && b.is3D) {
                        add3DLimbFaces(b, ambient);
                    } else {
                        let o = getRenderItem();
                        o.type = 'blood';
                        o.color = b.color;
                        o.size = b.size;
                        o.depthSq = cz * cz;
                        o.h = b.z;
                        o.life = b.life;
                        o.wX = b.x;
                        o.wY = b.y;
                        o.onGround = b.onGround;
                        o.isPooling = b.isPooling;
                        if (b.isLimb) {
                            o.isLimb = true;
                            o.limbType = b.limbType;
                            o.vx = b.vx;
                            o.vy = b.vy;
                            o.vz = b.vz;
                            o.landedAngle = b.landedAngle;
                        }
                    }
                }
            }
        }
        
        if (typeof placementItem !== 'undefined' && placementItem !== null) {
            let target = getPlacementTarget();
            let cz = getDepth(target.x, target.y, target.z);
            if (cz > 0.1 && cz < VIEW_DIST) {
                let dx = target.x - player.x, dy = target.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 4.0) {
                    let o = getRenderItem(); 
                    o.type = 'emoji'; 
                    o.emoji = placementItem.emoji; 
                    o.size = placementItem.type === 'torch' ? 0.4 : 4.5; 
                    o.depthSq = cz*cz; 
                    o.h = target.z; 
                    o.wX = target.x; 
                    o.wY = target.y; 
                    o.ghost = true;
                }
            }
        }

        let activeItem = inventory[hotbarSelection];
        let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;

        if (curW && (curW.type === 'block' || curW.toolType === 'pickaxe' || curW.toolType === 'shovel')) {
            let aim = getAimVoxel(curW.range);
            if (aim) {
                let isPlace = (curW.type === 'block');
                let targetX = isPlace ? aim.placeX : aim.hitX;
                let targetY = isPlace ? aim.placeY : aim.hitY;
                let targetZ = isPlace ? aim.placeZ : aim.hitZ;
                let isFine = (curW.type === 'block' && isVoxelCube(curW.blockId)) || curW.toolType === 'pickaxe';
                
                let mx = isFine ? Math.floor(targetX) : targetX;
                let my = isFine ? Math.floor(targetY) : targetY;
                let mz = isFine ? Math.floor(targetZ) : targetZ;
                
                let cx = mx, cy = my, cz = mz;
                let sz = isFine ? 1.0 : 1.4;
                if (!isFine) {
                    cx -= sz/2; cy -= sz/2; cz -= sz/2;
                }

                let p000 = {x:cx, y:cy, z:cz}, p100 = {x:cx+sz, y:cy, z:cz}, p110 = {x:cx+sz, y:cy+sz, z:cz}, p010 = {x:cx, y:cy+sz, z:cz};
                let p001 = {x:cx, y:cy, z:cz+sz}, p101 = {x:cx+sz, y:cy, z:cz+sz}, p111 = {x:cx+sz, y:cy+sz, z:cz+sz}, p011 = {x:cx, y:cy+sz, z:cz+sz};
                
                let col;
                if (curW.type === 'block') {
                    if (isVoxelCube(curW.blockId)) {
                        let vCol = getVoxelColor(0, 0, 0, curW.blockId);
                        col = { r: vCol.r, g: vCol.g, b: vCol.b, a: 0.35 };
                    } else {
                        col = { r: 120, g: 255, b: 120, a: 0.35 };
                    }
                } else {
                    col = { r: 255, g: 80, b: 80, a: 0.35 };
                } 

                let addPF = (p1, p2, p3, p4) => {
                    let tCx = (p1.x+p3.x)/2, tCy = (p1.y+p3.y)/2, tCz = (p1.z+p3.z)/2;
                    let czDepth = getDepth(tCx, tCy, tCz);
                    if (czDepth > 0.1 && czDepth < VIEW_DIST) {
                        let o = getRenderItem(); o.type = 'face'; 
                        o.face = { pts: [p1,p2,p3,p4], col: col, shade: 1.0, isWater: false };
                        o.depthSq = czDepth * czDepth;
                        o.wX = tCx; o.wY = tCy; o.h = tCz;
                    }
                };
                addPF(p001, p101, p111, p011);
                addPF(p010, p110, p100, p000);
                addPF(p000, p100, p101, p001);
                addPF(p110, p010, p011, p111);
                addPF(p100, p110, p111, p101);
                addPF(p010, p000, p001, p011);
            }
        }
    } else {
        ctx.fillStyle = '#0a0d04'; ctx.fillRect(0, 0, canvas.width, hY); ctx.fillStyle = patternArmyGreenFloor; ctx.fillRect(0, Math.max(0, hY), canvas.width, canvas.height - Math.max(0, hY));
        let interiorEnts = getInteriorEntities();
        for (let e of interiorEnts) {
            let cz = getDepth(e.x, e.y, e.z);
            if (cz > 0.2) {
                let dx = e.x - player.x, dy = e.y - player.y;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                if (Math.abs(ry) < cz * fovMult + 4.0) {
                    let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.depthSq = cz*cz; o.h = e.z; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y;
                }
            }
        }
        let walls = getInteriorWalls();
        for (let w of walls) {
            if (w.pts) {
                let cX = (w.pts[0].x + w.pts[2].x)/2, cY = (w.pts[0].y + w.pts[2].y)/2, cZ = (w.pts[0].z + w.pts[2].z)/2;
                let cz = getDepth(cX, cY, cZ);
                if (cz > 0.1) {
                    let o = getRenderItem(); o.type = 'wallPoly'; o.pts = w.pts; o.color = w.color; o.depthSq = cz*cz;
                }
            } else {
                let r1 = getDepth(w.p1.x, w.p1.y, 0), r2 = getDepth(w.p2.x, w.p2.y, 0);
                if (r1 > 0.1 || r2 > 0.1) {
                    let o = getRenderItem(); o.type = 'wall'; o.p1 = w.p1; o.p2 = w.p2; o.color = w.color; o.depthSq = Math.min(r1, r2)**2;
                }
            }
        }
    }

    // Render Dropped Items (in both overworld & interior states)
    for (let e of droppedItems) {
        let cz = getDepth(e.x, e.y, e.z);
        if (cz > 0.2 && cz < VIEW_DIST) {
            let dx = e.x - player.x, dy = e.y - player.y;
            let rx = dx * cosA + dy * sinA;
            let ry = dx * -sinA + dy * cosA;
            if (Math.abs(ry) < cz * fovMult + 4.0) {
                let itemId = e.item.id;
                let model = itemId ? WEAPON_MODELS[itemId] : null;
                
                // Bobbing hover effect
                let bobZ = Math.sin(e.hoverTime * 0.08) * 0.12 + 0.08;
                let itemZ = e.z + bobZ;

                if (model) {
                    // Render as 3D Model
                    let conf = WEAPON_MODEL_CONFIG[itemId] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0 };
                    let scale = conf.scale * 1.5;
                    let spinAngle = e.hoverTime * 0.012;
                    let ryaw = conf.rotZ + spinAngle;

                    for (let f of model.faces) {
                        let wPts = [];
                        for (let pt of f.pts) {
                            let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, ryaw);
                            let wx = p1.x * scale;
                            let wy = p1.y * scale;
                            let wz = p1.z * scale;
                            wPts.push({ x: e.x + wx, y: e.y + wy, z: itemZ + wz + 0.15 });
                        }
                        
                        let u = { x: wPts[1].x - wPts[0].x, y: wPts[1].y - wPts[0].y, z: wPts[1].z - wPts[0].z };
                        let w = { x: wPts[2].x - wPts[0].x, y: wPts[2].y - wPts[0].y, z: wPts[2].z - wPts[0].z };
                        let nx = u.y*w.z - u.z*w.y, ny = u.z*w.x - u.x*w.z, nz = u.x*w.y - u.y*w.x;
                        
                        if (nx*(wPts[0].x - player.x) + ny*(wPts[0].y - player.y) + nz*(wPts[0].z - camZ) > 0) continue;
                        
                        let cX = (wPts[0].x+wPts[1].x+wPts[2].x)/3, cY = (wPts[0].y+wPts[1].y+wPts[2].y)/3, cZ = (wPts[0].z+wPts[1].z+wPts[2].z)/3;
                        let czFace = getDepth(cX, cY, cZ);
                        
                        if (czFace > 0.1) {
                            let o = getRenderItem();
                            o.type = 'objWorldFace'; 
                            o.pts = wPts; 
                            o.color = f.color; 
                            o.depthSq = czFace * czFace;
                            o.wX = cX; 
                            o.wY = cY; 
                            o.h = cZ; 
                            o.norm = {x: nx, y: ny, z: nz};
                            o.targeted = (e === interactTarget);
                        }
                    }
                } else {
                    let o = getRenderItem();
                    o.type = 'droppedItem';
                    o.emoji = e.item.emoji;
                    o.size = 0.55;
                    o.depthSq = cz * cz;
                    o.h = itemZ;
                    o.targeted = (e === interactTarget);
                    o.wX = e.x;
                    o.wY = e.y;
                    o.spinScaleX = Math.cos(e.hoverTime * 0.012);
                }
            }
        }
    }

    for (let p of projectiles) {
        let cz = getDepth(p.x, p.y, p.z);
        if (cz > 0.1 && cz < VIEW_DIST) {
            let dx = p.x - player.x, dy = p.y - player.y;
            let rx = dx * cosA + dy * sinA;
            let ry = dx * -sinA + dy * cosA;
            if (Math.abs(ry) < cz * fovMult + 2.0) {
                let o = getRenderItem(); o.type = 'bullet'; o.owner = p.owner; o.depthSq = cz*cz; o.h = p.z; o.wX = p.x; o.wY = p.y;
            }
        }
    }

    activeRenderList.length = renderCount;
    for(let i=0; i < renderCount; i++) activeRenderList[i] = renderPool[i];
    activeRenderList.sort((a,b) => b.depthSq - a.depthSq); 
    
    // Draw Budgeting: Scale budget dynamically from 5,000 at VIEW_DIST=80 up to 30,000 at VIEW_DIST=600
    let drawBudget = Math.max(5000, Math.floor(5000 + (VIEW_DIST - 80) * 100));
    if (activeRenderList.length > drawBudget) {
        let celestials = activeRenderList.filter(o => o.type === 'celestial');
        activeRenderList = celestials.concat(activeRenderList.slice(activeRenderList.length - drawBudget).filter(o => o.type !== 'celestial'));
    }

    if (_lastAlign !== 'center') { ctx.textAlign = 'center'; _lastAlign = 'center'; }
    ctx.lineJoin = 'round'; 

    for (let i = 0; i < activeRenderList.length; i++) {
        let o = activeRenderList[i];
        
        let objLight = gameState === 'overworld' ? ambient : 1.0;
        
        let depth = Math.max(0.1, Math.sqrt(Math.max(0, o.depthSq))); 
        
        let isUnderground = o.type === 'face' && !o.face.isWater && o.face.underground;
        if (isUnderground) objLight = 0.05; 

        if (objLight < 1.0 && o.type !== 'torchBloom') {
            let lightIntensity = 0;
            let cx = o.wX, cy = o.wY, cz = o.type === 'face' || o.type === 'objWorldFace' ? o.h : o.h + (o.size?o.size/2:0);
            
            if (isFlashlightOn) {
                let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ; 
                let lDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (lDist > 0.1 && lDist < 45) {
                    let dot = (dx/lDist)*aimX + (dy/lDist)*aimY + (dz/lDist)*aimZ; 
                    if (dot > 0.90) { 
                        let att = (Math.max(0, (dot - 0.98) / 0.02) * 0.6 + Math.pow(Math.max(0, (dot - 0.90) / 0.08), 2.0) * 0.4) * Math.pow(1 - lDist/45, 2);
                        lightIntensity += att * 1.5;
                    }
                }
            }
            for (let c of visibleTorches) {
                let dist = Math.hypot(cx - c.x, cy - c.y, cz - c.z); 
                if (dist < 22) { lightIntensity += Math.pow(1 - dist/22, 2.5) * c.flicker * 1.5; }
            }
            objLight = Math.min(1.0, objLight + lightIntensity);
        }

        if (o.type === 'chunk_face') {
            let f = o.face;
            let ptsArray = f.pts;
            let camPts = [];
            for (let k = 0; k < ptsArray.length; k++) {
                let z_pt = ptsArray[k].z;
                if (f.isWater) {
                    let zFract = z_pt - Math.floor(z_pt);
                    if (zFract > 0.1 && zFract < 0.9) {
                        let waveVal = Math.sin(ptsArray[k].x * 0.5 + animTime) * 
                                      Math.cos(ptsArray[k].y * 0.5 + animTime * 0.8) * 0.08 +
                                      Math.sin(ptsArray[k].x * 0.15 - animTime * 0.5) * 0.03;
                        z_pt += waveVal;
                    }
                }
                let dx_pt = ptsArray[k].x - player.x, dy_pt = ptsArray[k].y - player.y, dz_pt = z_pt - camZ;
                let rx = dx_pt * cosA + dy_pt * sinA;
                let ry = dx_pt * -sinA + dy_pt * cosA;
                let rz = dz_pt;
                let cx = ry;
                let cy = rz * cosP - rx * sinP;
                let cz = rz * sinP + rx * cosP;
                camPts.push({ cx, cy, cz });
            }
            
            let clipped = [];
            let zNear = 0.1;
            for (let j = 0; j < camPts.length; j++) {
                let p1 = camPts[j], p2 = camPts[(j + 1) % camPts.length];
                if (p1.cz >= zNear) clipped.push(p1);
                if ((p1.cz >= zNear) !== (p2.cz >= zNear)) {
                    let t = (zNear - p1.cz) / (p2.cz - p1.cz);
                    clipped.push({ cx: p1.cx + t * (p2.cx - p1.cx), cy: p1.cy + t * (p2.cy - p1.cy), cz: zNear });
                }
            }
            
            if (clipped.length >= 3) {
                let depth = Math.max(0.1, Math.sqrt(o.depthSq));
                let objLightVal = objLight;
                let isUnderground = !f.isWater && f.underground;
                if (isUnderground) objLightVal = 0.05;
                
                if (objLightVal < 1.0) {
                    let lightIntensity = 0;
                    let cz_val = f.cz + 0.5;
                    if (isFlashlightOn) {
                        let dx = f.cx - player.x, dy = f.cy - player.y, dz = cz_val - camZ;
                        let lDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                        if (lDist > 0.1 && lDist < 45) {
                            let dot = (dx/lDist)*aimX + (dy/lDist)*aimY + (dz/lDist)*aimZ;
                            if (dot > 0.90) {
                                let att = (Math.max(0, (dot - 0.98) / 0.02) * 0.6 + Math.pow(Math.max(0, (dot - 0.90) / 0.08), 2.0) * 0.4) * Math.pow(1 - lDist/45, 2);
                                lightIntensity += att * 1.5;
                            }
                        }
                    }
                    for (let c of visibleTorches) {
                        let dist = Math.hypot(f.cx - c.x, f.cy - c.y, cz_val - c.z);
                        if (dist < 22) { lightIntensity += Math.pow(1 - dist/22, 2.5) * c.flicker * 1.5; }
                    }
                    objLightVal = Math.min(1.0, objLightVal + lightIntensity);
                }
                
                let shade = f.shade * objLightVal;
                let fr = f.col.r * shade | 0, fg = f.col.g * shade | 0, fb = f.col.b * shade | 0;
                let fAlpha = f.col.a;
                
                if (f.isWater) {
                    let shimmer = Math.sin(f.cx * 1.0 + animTime) * 
                                  Math.cos(f.cy * 1.0 + animTime * 0.7) * 0.15;
                    
                    shade = Math.min(1.0, Math.max(0.2, shade + shimmer * 0.2));
                    fr = f.col.r * shade | 0;
                    fg = f.col.g * shade | 0;
                    fb = f.col.b * shade | 0;
                    
                    if (fAlpha !== undefined) {
                        fAlpha = Math.min(0.85, Math.max(0.35, fAlpha + shimmer * 0.1));
                    }
                    
                    if (shimmer > 0.05) {
                        let highlight = (shimmer - 0.05) * 1.5;
                        fr = Math.min(255, fr + highlight * 120) | 0;
                        fg = Math.min(255, fg + highlight * 100) | 0;
                        fb = Math.min(255, fb + highlight * 50) | 0;
                    }
                }
                
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
                
                let colorKey;
                if (fAlpha !== undefined) {
                    colorKey = `rgba(${fr}, ${fg}, ${fb}, ${fAlpha})`;
                } else {
                    colorKey = `rgb(${fr}, ${fg}, ${fb})`;
                }
                
                ctx.lineWidth = 2.0;
                ctx.fillStyle = colorKey;
                ctx.strokeStyle = colorKey;
                ctx.beginPath();
                
                let sx = canvas.width/2 + (clipped[0].cx / clipped[0].cz) * fov;
                let sy = canvas.height/2 - (clipped[0].cy / clipped[0].cz) * fov;
                ctx.moveTo(sx, sy);
                for (let j = 1; j < clipped.length; j++) {
                    let sx_pt = canvas.width/2 + (clipped[j].cx / clipped[j].cz) * fov;
                    let sy_pt = canvas.height/2 - (clipped[j].cy / clipped[j].cz) * fov;
                    ctx.lineTo(sx_pt, sy_pt);
                }
                ctx.closePath();
                ctx.fill();
                if (depth <= 35.0 && !f.isWater) {
                    ctx.stroke();
                }
            }
        } else if (o.type === 'face' || o.type === 'wallPoly' || o.type === 'objWorldFace' || o.type === 'cloudPoly') {
            let ptsArray = (o.type === 'objWorldFace') ? o.pts : (o.type === 'face' ? o.face.pts : o.pts);
            let camPts = [];
            for (let k = 0; k < ptsArray.length; k++) {
                let dx = ptsArray[k].x - player.x, dy = ptsArray[k].y - player.y, dz = ptsArray[k].z - camZ;
                let rx = dx * cosA + dy * sinA;
                let ry = dx * -sinA + dy * cosA;
                let rz = dz;
                let cx = ry;
                let cy = rz * cosP - rx * sinP;
                let cz = rz * sinP + rx * cosP;
                let cp = { cx, cy, cz };
                if (o.uvs && o.uvs[k]) {
                    cp.u = o.uvs[k].u;
                    cp.v = o.uvs[k].v;
                }
                camPts.push(cp);
            }

            let clipped = [];
            let zNear = 0.1;
            for(let j=0; j<camPts.length; j++) {
                let p1 = camPts[j], p2 = camPts[(j+1)%camPts.length];
                if(p1.cz >= zNear) clipped.push(p1);
                if((p1.cz >= zNear) !== (p2.cz >= zNear)) {
                    let t = (zNear - p1.cz) / (p2.cz - p1.cz);
                    let cp = { cx: p1.cx + t * (p2.cx - p1.cx), cy: p1.cy + t * (p2.cy - p1.cy), cz: zNear };
                    if (o.uvs) {
                        cp.u = p1.u + t * (p2.u - p1.u);
                        cp.v = p1.v + t * (p2.v - p1.v);
                    }
                    clipped.push(cp);
                }
            }
            
            if (clipped.length < 3) continue; 

            if (o.type === 'face') {
                let shade = o.face.shade * objLight;
                let fr = o.face.col.r * shade | 0, fg = o.face.col.g * shade | 0, fb = o.face.col.b * shade | 0;

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
                if (o.face.col.a !== undefined) {
                    ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${o.face.col.a})`;
                    ctx.strokeStyle = ctx.fillStyle; 
                } else {
                    ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`; ctx.strokeStyle = ctx.fillStyle; 
                }
            } else if (o.type === 'objWorldFace') {
                let len = Math.hypot(o.norm.x, o.norm.y, o.norm.z);
                let nx = o.norm.x/len, ny = o.norm.y/len, nz = o.norm.z/len;
                let sunDot = Math.max(0, nx*0.3 + ny*0.5 + nz*0.8);
                let shade = (0.4 + sunDot * 0.6) * objLight;
                let fog = Math.min(1, depth / VIEW_DIST);
                
                if (o.texture && o.uvs) {
                    // Render textured triangles
                    for (let j = 1; j < clipped.length - 1; j++) {
                        let p0 = clipped[0];
                        let p1 = clipped[j];
                        let p2 = clipped[j+1];

                        let sx0 = canvas.width/2 + (p0.cx / p0.cz) * fov;
                        let sy0 = canvas.height/2 - (p0.cy / p0.cz) * fov;
                        let sx1 = canvas.width/2 + (p1.cx / p1.cz) * fov;
                        let sy1 = canvas.height/2 - (p1.cy / p1.cz) * fov;
                        let sx2 = canvas.width/2 + (p2.cx / p2.cz) * fov;
                        let sy2 = canvas.height/2 - (p2.cy / p2.cz) * fov;

                        drawTexturedTriangle(
                            ctx, o.texture,
                            sx0, sy0, sx1, sy1, sx2, sy2,
                            p0.u, p0.v, p1.u, p1.v, p2.u, p2.v,
                            shade, o.flash, fog, sky,
                            o.alpha !== undefined ? o.alpha : 1.0
                        );
                    }
                    
                    if (depth <= 35.0 || o.targeted) {
                        ctx.strokeStyle = o.targeted ? 'rgba(255, 255, 255, 0.8)' : (o.flash ? 'white' : `rgba(0,0,0,0.15)`);
                        ctx.lineWidth = 1.0;
                        ctx.beginPath();
                        for (let j = 0; j < clipped.length; j++) {
                            let sx = canvas.width/2 + (clipped[j].cx / clipped[j].cz) * fov;
                            let sy = canvas.height/2 - (clipped[j].cy / clipped[j].cz) * fov;
                            if (j === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    }
                } else {
                    let fr = o.flash ? 255 : (o.color.r * shade * (1-fog) + sky.r * fog | 0);
                    let fg = o.flash ? 255 : (o.color.g * shade * (1-fog) + sky.g * fog | 0);
                    let fb = o.flash ? 255 : (o.color.b * shade * (1-fog) + sky.b * fog | 0);
                    if (o.targeted) {
                        fr = Math.min(255, fr + 40);
                        fg = Math.min(255, fg + 40);
                        fb = Math.min(255, fb + 40);
                    }
                    if (o.alpha !== undefined && o.alpha < 1.0) {
                        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${o.alpha})`;
                        ctx.strokeStyle = o.targeted ? `rgba(255, 255, 255, ${o.alpha * 0.8})` : (o.flash ? `rgba(255, 255, 255, ${o.alpha})` : ctx.fillStyle);
                    } else {
                        ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`;
                        ctx.strokeStyle = o.targeted ? 'rgba(255, 255, 255, 0.8)' : (o.flash ? 'white' : ctx.fillStyle);
                    }
                    ctx.lineWidth = 2.0;
                    ctx.beginPath();
                    for (let j = 0; j < clipped.length; j++) {
                        let sx = canvas.width/2 + (clipped[j].cx / clipped[j].cz) * fov;
                        let sy = canvas.height/2 - (clipped[j].cy / clipped[j].cz) * fov;
                        if (j === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
                    }
                    ctx.closePath();
                    ctx.fill();
                    if (depth <= 35.0 || o.targeted) {
                        ctx.stroke();
                    }
                }
            } else if (o.type === 'cloudPoly') {
                ctx.fillStyle = o.color;
                ctx.strokeStyle = o.color;
                ctx.lineWidth = 1.0;
            } else {
                ctx.fillStyle = o.color; ctx.strokeStyle = '#000';
            }
            
            if (o.type !== 'objWorldFace') {
                ctx.lineWidth = 2.0; 
                ctx.beginPath();
                for (let j = 0; j < clipped.length; j++) {
                    let sx = canvas.width/2 + (clipped[j].cx / clipped[j].cz) * fov;
                    let sy = canvas.height/2 - (clipped[j].cy / clipped[j].cz) * fov;
                    if (j===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
                }
                ctx.closePath(); 
                ctx.fill(); 
                // Stroke Culling: Avoid expensive strokes on far-away faces since seams are invisible at distance.
                if (depth <= 35.0 || o.targeted) {
                    ctx.stroke();
                }
            }
            
        } else if (o.type === 'wall') {
            let p1 = project3D(o.p1.x, o.p1.y, 0), p2 = project3D(o.p2.x, o.p2.y, 0), p3 = project3D(o.p2.x, o.p2.y, activeBuilding.wallH), p4 = project3D(o.p1.x, o.p1.y, activeBuilding.wallH);
            if (p1 && p2 && p3 && p4) { ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        } else {
            let p = project3D(o.wX, o.wY, o.h);
            if (!p) continue;
            let sx = p.sx, sy = p.sy, sz = (fov/depth)*o.size; 
            
            if (o.type === 'torchBloom') {
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
            } else if (o.type === 'celestial') {
                ctx.fillStyle = o.emoji === '☀️' ? '#ffd700' : '#fff';
                ctx.font = sz + 'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillText(o.emoji, sx, sy);
                _lastFont = ''; _lastBaseline = ''; _lastAlign = '';
            } else if (o.type === 'locationalEnemy') {
                let e = o.obj, isFlash = e.flash > 0, isZombie = e.type === 'zombie';
                let legH = sz * 0.44, abdH = sz * 0.28, chestH = sz * 0.16, headR = sz * 0.12;
                
                let color1 = isFlash ? 'white' : (isZombie ? `rgb(${30*objLight|0},${86*objLight|0},${34*objLight|0})` : `rgb(${100*objLight|0},${100*objLight|0},${100*objLight|0})`);
                let color2 = isFlash ? 'white' : (isZombie ? `rgb(${46*objLight|0},${125*objLight|0},${50*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                
                if (isZombie && e.hasHead !== undefined) {
                    let redColor = `rgb(${150*objLight|0}, 0, 0)`;
                    if (e.isCrawling) {
                        // Crawling layout (low to the ground, legs dragged horizontally behind)
                        let topChest = sy - (abdH + chestH);
                        
                        // Draw Torso
                        const torsoSprite = ZombieTorsoCache.get(isFlash, objLight);
                        if (torsoSprite) {
                            ctx.drawImage(torsoSprite, sx - (sz * 0.18)/2, topChest, sz * 0.18, abdH + chestH);
                        } else {
                            ctx.fillStyle = color2;
                            ctx.fillRect(sx - (sz * 0.18)/2, topChest, sz * 0.18, abdH + chestH);
                        }
                        
                        // Draw Arms (dragging on ground)
                        if (e.hasLeftUpperArm) {
                            const sprite = ZombieArmUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx - sz * 0.15, topChest + chestH, sz * 0.06, chestH * 0.7);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx - sz * 0.15, topChest + chestH, sz * 0.06, chestH * 0.7);
                            }
                            if (e.hasLeftLowerArm) {
                                const spriteL = ZombieArmLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx - sz * 0.15, topChest + chestH * 1.7, sz * 0.06, chestH * 0.8);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx - sz * 0.15, topChest + chestH * 1.7, sz * 0.06, chestH * 0.8);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx - sz * 0.15, topChest + chestH * 1.7, sz * 0.06, chestH * 0.15);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx - sz * 0.12, topChest + chestH, sz * 0.04, sz * 0.04);
                        }
                        
                        if (e.hasRightUpperArm) {
                            const sprite = ZombieArmUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx + sz * 0.09, topChest + chestH, sz * 0.06, chestH * 0.7);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx + sz * 0.09, topChest + chestH, sz * 0.06, chestH * 0.7);
                            }
                            if (e.hasRightLowerArm) {
                                const spriteL = ZombieArmLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx + sz * 0.09, topChest + chestH * 1.7, sz * 0.06, chestH * 0.8);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx + sz * 0.09, topChest + chestH * 1.7, sz * 0.06, chestH * 0.8);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx + sz * 0.09, topChest + chestH * 1.7, sz * 0.06, chestH * 0.15);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx + sz * 0.08, topChest + chestH, sz * 0.04, sz * 0.04);
                        }

                        // Draw Head or Neck Stump
                        if (e.hasHead) {
                            const headSprite = ZombieHeadCache.get(isFlash, objLight);
                            let headScale = (headR * 2) / 128;
                            let headW = headSprite.width * headScale;
                            let headH = headSprite.height * headScale;
                            let headX = sx - headW / 2;
                            let headY = topChest - (headSprite.height - 20) * headScale;
                            ctx.drawImage(headSprite, headX, headY, headW, headH);
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx - (sz * 0.06)/2, topChest - sz * 0.04, sz * 0.06, sz * 0.04);
                        }

                        // Draw Crawling Legs (horizontal)
                        // Left Leg
                        if (e.hasLeftUpperLeg) {
                            const sprite = ZombieLegUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx - sz * 0.20, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx - sz * 0.20, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                            }
                            if (e.hasLeftLowerLeg) {
                                const spriteL = ZombieLegLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx - sz * 0.32, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx - sz * 0.32, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx - sz * 0.23, sy - sz * 0.06, sz * 0.03, sz * 0.06);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx - sz * 0.09, sy - sz * 0.06, sz * 0.03, sz * 0.06);
                        }
                        // Right Leg
                        if (e.hasRightUpperLeg) {
                            const sprite = ZombieLegUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx + sz * 0.08, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx + sz * 0.08, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                            }
                            if (e.hasRightLowerLeg) {
                                const spriteL = ZombieLegLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx + sz * 0.20, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx + sz * 0.20, sy - sz * 0.06, sz * 0.12, sz * 0.06);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx + sz * 0.20, sy - sz * 0.06, sz * 0.03, sz * 0.06);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx + sz * 0.06, sy - sz * 0.06, sz * 0.03, sz * 0.06);
                        }
                    } else {
                        // Standing layout (upper and lower segments)
                        let topLegs = sy - legH;
                        let topChest = topLegs - (abdH + chestH);

                        // Draw Legs separately (standing)
                        // Left Leg
                        if (e.hasLeftUpperLeg) {
                            const sprite = ZombieLegUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx - sz * 0.09, topLegs, sz * 0.07, legH * 0.5);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx - sz * 0.09, topLegs, sz * 0.07, legH * 0.5);
                            }
                            if (e.hasLeftLowerLeg) {
                                const spriteL = ZombieLegLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx - sz * 0.09, topLegs + legH * 0.5, sz * 0.07, legH * 0.5);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx - sz * 0.09, topLegs + legH * 0.5, sz * 0.07, legH * 0.5);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx - sz * 0.09, topLegs + legH * 0.5, sz * 0.07, legH * 0.1);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx - sz * 0.09, topLegs, sz * 0.07, legH * 0.1);
                        }
                        
                        // Right Leg
                        if (e.hasRightUpperLeg) {
                            const sprite = ZombieLegUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx + sz * 0.02, topLegs, sz * 0.07, legH * 0.5);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx + sz * 0.02, topLegs, sz * 0.07, legH * 0.5);
                            }
                            if (e.hasRightLowerLeg) {
                                const spriteL = ZombieLegLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx + sz * 0.02, topLegs + legH * 0.5, sz * 0.07, legH * 0.5);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx + sz * 0.02, topLegs + legH * 0.5, sz * 0.07, legH * 0.5);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx + sz * 0.02, topLegs + legH * 0.5, sz * 0.07, legH * 0.1);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx + sz * 0.02, topLegs, sz * 0.07, legH * 0.1);
                        }

                        // Draw Torso
                        const torsoSprite = ZombieTorsoCache.get(isFlash, objLight);
                        if (torsoSprite) {
                            ctx.drawImage(torsoSprite, sx - (sz * 0.18)/2, topChest, sz * 0.18, abdH + chestH);
                        } else {
                            ctx.fillStyle = color2;
                            ctx.fillRect(sx - (sz * 0.18)/2, topChest, sz * 0.18, abdH + chestH);
                        }

                        // Draw Arms (standing)
                        // Left Arm
                        if (e.hasLeftUpperArm) {
                            const sprite = ZombieArmUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx - sz * 0.15, topChest + chestH * 0.2, sz * 0.06, chestH * 0.7);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx - sz * 0.15, topChest + chestH * 0.2, sz * 0.06, chestH * 0.7);
                            }
                            if (e.hasLeftLowerArm) {
                                const spriteL = ZombieArmLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx - sz * 0.15, topChest + chestH * 0.9, sz * 0.06, chestH * 0.8);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx - sz * 0.15, topChest + chestH * 0.9, sz * 0.06, chestH * 0.8);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx - sz * 0.15, topChest + chestH * 0.9, sz * 0.06, chestH * 0.15);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx - sz * 0.12, topChest + chestH * 0.2, sz * 0.04, sz * 0.04);
                        }
                        
                        // Right Arm
                        if (e.hasRightUpperArm) {
                            const sprite = ZombieArmUpperCache.get(isFlash, objLight);
                            if (sprite) {
                                ctx.drawImage(sprite, sx + sz * 0.09, topChest + chestH * 0.2, sz * 0.06, chestH * 0.7);
                            } else {
                                ctx.fillStyle = color1;
                                ctx.fillRect(sx + sz * 0.09, topChest + chestH * 0.2, sz * 0.06, chestH * 0.7);
                            }
                            if (e.hasRightLowerArm) {
                                const spriteL = ZombieArmLowerCache.get(isFlash, objLight);
                                if (spriteL) {
                                    ctx.drawImage(spriteL, sx + sz * 0.09, topChest + chestH * 0.9, sz * 0.06, chestH * 0.8);
                                } else {
                                    ctx.fillStyle = color1;
                                    ctx.fillRect(sx + sz * 0.09, topChest + chestH * 0.9, sz * 0.06, chestH * 0.8);
                                }
                            } else {
                                ctx.fillStyle = redColor;
                                ctx.fillRect(sx + sz * 0.09, topChest + chestH * 0.9, sz * 0.06, chestH * 0.15);
                            }
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx + sz * 0.08, topChest + chestH * 0.2, sz * 0.04, sz * 0.04);
                        }

                        // Draw Head or Neck Stump
                        if (e.hasHead) {
                            const headSprite = ZombieHeadCache.get(isFlash, objLight);
                            let headScale = (headR * 2) / 128;
                            let headW = headSprite.width * headScale;
                            let headH = headSprite.height * headScale;
                            let headX = sx - headW / 2;
                            let headY = topChest - (headSprite.height - 20) * headScale;
                            ctx.drawImage(headSprite, headX, headY, headW, headH);
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillRect(sx - (sz * 0.06)/2, topChest - sz * 0.04, sz * 0.06, sz * 0.04);
                        }
                    }

                } else {
                    // Fallback for non-zombies (experimental/alien)
                    let topLegs = sy - legH;
                    let topChest = topLegs - abdH - chestH;
                    ctx.fillStyle = color1;
                    ctx.fillRect(sx - (sz * 0.20)/2, topLegs, sz * 0.20, legH);
                    ctx.fillStyle = color2;
                    ctx.fillRect(sx - (sz * 0.18)/2, topChest, sz * 0.18, abdH + chestH);
                    const headSprite = isZombie ? ZombieHeadCache.get(isFlash, objLight) : SpriteCache.get('👽', isFlash, false, objLight);
                    let headScale = (headR * 2) / 128;
                    let headW = headSprite.width * headScale;
                    let headH = headSprite.height * headScale;
                    let headX = sx - headW / 2;
                    let headY = topChest - (headSprite.height - 20) * headScale;
                    ctx.drawImage(headSprite, headX, headY, headW, headH);
                }
            } else if (o.type === 'dmgText') {
                ctx.fillStyle = `rgba(255, 50, 50, ${o.life/60})`; let df = 'bold ' + Math.max(12, 24/depth) + 'px sans-serif';
                if (_lastFont !== df) { ctx.font = df; _lastFont = df; } if (_lastBaseline !== 'middle') { ctx.textBaseline = 'middle'; _lastBaseline = 'middle'; }
                ctx.fillText(o.text, sx, sy);
            } else if (o.type === 'blood') {
                let bsz = Math.max(1, (fov/depth) * o.size);
                if (o.isLimb) {
                    ctx.save();
                    ctx.translate(sx, sy);
                    let isMoving = (o.vx !== 0 || o.vy !== 0 || o.vz !== 0);
                    let spinAngle = isMoving ? (o.life * 0.15) : (o.landedAngle !== undefined ? o.landedAngle : Math.PI / 2);
                    ctx.rotate(spinAngle);
                    
                    if (o.limbType === 'head') {
                        const headSprite = ZombieHeadCache.get(false, objLight);
                        ctx.drawImage(headSprite, -bsz/2, -bsz/2, bsz, bsz);
                        ctx.fillStyle = `rgb(${150 * objLight | 0}, 0, 0)`;
                        ctx.fillRect(-bsz/4, bsz/3, bsz/2, bsz/6);
                    } else if (o.limbType.endsWith('UpperArm') || o.limbType === 'upperArm') {
                        const sprite = ZombieArmUpperCache.get(false, objLight);
                        if (sprite) {
                            ctx.drawImage(sprite, -bsz/4, -bsz/2, bsz/2, bsz);
                        } else {
                            ctx.fillStyle = `rgb(${30 * objLight | 0}, ${86 * objLight | 0}, ${34 * objLight | 0})`;
                            ctx.fillRect(-bsz/4, -bsz/2, bsz/2, bsz);
                        }
                        ctx.fillStyle = `rgb(${150 * objLight | 0}, 0, 0)`;
                        ctx.fillRect(-bsz/4, -bsz/2, bsz/2, bsz/4);
                    } else if (o.limbType.endsWith('LowerArm') || o.limbType === 'lowerArm') {
                        const sprite = ZombieArmLowerCache.get(false, objLight);
                        if (sprite) {
                            ctx.drawImage(sprite, -bsz/4, -bsz/2, bsz/2, bsz);
                        } else {
                            ctx.fillStyle = `rgb(${30 * objLight | 0}, ${86 * objLight | 0}, ${34 * objLight | 0})`;
                            ctx.fillRect(-bsz/4, -bsz/2, bsz/2, bsz);
                        }
                        ctx.fillStyle = `rgb(${150 * objLight | 0}, 0, 0)`;
                        ctx.fillRect(-bsz/4, -bsz/2, bsz/2, bsz/4);
                    } else if (o.limbType.endsWith('UpperLeg') || o.limbType === 'upperLeg') {
                        const sprite = ZombieLegUpperCache.get(false, objLight);
                        if (sprite) {
                            ctx.drawImage(sprite, -bsz/3, -bsz/2, bsz*0.66, bsz);
                        } else {
                            ctx.fillStyle = `rgb(${30 * objLight | 0}, ${86 * objLight | 0}, ${34 * objLight | 0})`;
                            ctx.fillRect(-bsz/3, -bsz/2, bsz*0.66, bsz);
                        }
                        ctx.fillStyle = `rgb(${150 * objLight | 0}, 0, 0)`;
                        ctx.fillRect(-bsz/3, -bsz/2, bsz*0.66, bsz/4);
                    } else if (o.limbType.endsWith('LowerLeg') || o.limbType === 'lowerLeg') {
                        const sprite = ZombieLegLowerCache.get(false, objLight);
                        if (sprite) {
                            ctx.drawImage(sprite, -bsz/3, -bsz/2, bsz*0.66, bsz);
                        } else {
                            ctx.fillStyle = `rgb(${30 * objLight | 0}, ${86 * objLight | 0}, ${34 * objLight | 0})`;
                            ctx.fillRect(-bsz/3, -bsz/2, bsz*0.66, bsz);
                        }
                        ctx.fillStyle = `rgb(${150 * objLight | 0}, 0, 0)`;
                        ctx.fillRect(-bsz/3, -bsz/2, bsz*0.66, bsz/4);
                    } else {
                        ctx.fillStyle = `rgb(${30 * objLight | 0}, ${86 * objLight | 0}, ${34 * objLight | 0})`;
                        ctx.fillRect(-bsz/3, -bsz/2, bsz*0.66, bsz);
                        ctx.fillStyle = `rgb(${150 * objLight | 0}, 0, 0)`;
                        ctx.fillRect(-bsz/3, -bsz/2, bsz*0.66, bsz/4);
                    }
                    ctx.restore();
                } else {
                    ctx.fillStyle = `rgba(${o.color.r * objLight | 0}, ${o.color.g * objLight | 0}, ${o.color.b * objLight | 0}, ${Math.min(1.0, o.life / 60.0)})`;
                    ctx.fillRect(sx - bsz/2, sy - bsz/2, bsz, bsz);
                }
            } else if (o.type === 'emoji' || o.type === 'animal' || o.type === 'droppedItem') {
                const sprite = SpriteCache.get(o.emoji, o.targeted || (o.flash > 0), o.dead, objLight);
                let scale = sz / 128;
                
                ctx.save();
                if (o.ghost) ctx.globalAlpha = 0.5;
                
                if (o.spinScaleX !== undefined) {
                    let drawW = sprite.width * scale;
                    let drawH = sprite.height * scale;
                    ctx.translate(sx, sy - drawH / 2 + 10 * scale);
                    ctx.scale(o.spinScaleX, 1.0);
                    ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
                } else {
                    ctx.drawImage(sprite, sx - (sprite.width/2)*scale, sy - (sprite.height - 20)*scale, sprite.width * scale, sprite.height * scale);
                }
                
                if (o.ghost) ctx.globalAlpha = 1.0;
                ctx.restore();
            } else {
                ctx.fillStyle = o.owner==='player'?'#ff0':'#f33'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, 15/depth), 0, 7); ctx.fill();
            }
        }
    }

    if (!player.inVehicle || player.vehicleView === '1st') {
        renderWeaponModel();
        ctx.strokeStyle = fireCooldown > 0 ? 'red' : 'white'; ctx.lineWidth = isZooming?1:2; ctx.beginPath(); let cs = isZooming?4:8;
        ctx.moveTo(canvas.width/2-cs, hY-player.pitch); ctx.lineTo(canvas.width/2+cs, hY-player.pitch);
        ctx.moveTo(canvas.width/2, hY-player.pitch-cs); ctx.lineTo(canvas.width/2, hY-player.pitch+cs); ctx.stroke();
    }

    if (player.isSubmerged) {
        ctx.fillStyle = 'rgba(10, 50, 130, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function rotateAroundPivot(x, y, z, px, py, pz, rx, ry, rz) {
    let tx = x - px;
    let ty = y - py;
    let tz = z - pz;
    let r = rotate3D(tx, ty, tz, rx, ry, rz);
    return {
        x: r.x + px,
        y: r.y + py,
        z: r.z + pz
    };
}

function add3DZombieFaces(e, ambient) {
    let scale = e.size / 32.0;
    let animTime = e.animTime || 0;
    
    // Leg swing back and forth
    let legSwing = Math.sin(animTime) * 0.6;
    let rKneeBend = legSwing < 0 ? -legSwing * 0.8 : 0;
    let lKneeBend = legSwing > 0 ? legSwing * 0.8 : 0;

    // Zombie arms raised forward
    let rArmPitch = 1.3 + Math.sin(animTime) * 0.1;
    let lArmPitch = 1.3 - Math.sin(animTime) * 0.1;
    let rElbowBend = 0.2 + Math.abs(Math.sin(animTime)) * 0.2;
    let lElbowBend = 0.2 + Math.abs(Math.cos(animTime)) * 0.2;

    // Head bobbing/tilting
    let headPitch = 0.1 + Math.sin(animTime * 0.5) * 0.05;
    let headYaw = Math.cos(animTime * 0.3) * 0.1;

    // Set up the parts configuration
    let parts = [
        // Torso: 8x12x4. Center at (0, 0, 18).
        {
            name: 'torso',
            minX: -4, maxX: 4, minY: -2, maxY: 2, minZ: 12, maxZ: 24,
            color: { r: 60, g: 156, b: 156 },
            active: true,
            transform: v => ({ x: v.x, y: v.y, z: v.z })
        },
        // Head: 8x8x8. Center at (0, 0, 28).
        {
            name: 'head',
            minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: 24, maxZ: 32,
            color: { r: 90, g: 140, b: 90 },
            active: e.hasHead !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 0, 0, 24, headPitch, 0, headYaw)
        },
        // Left Upper Arm: 4x6x4. Center at (-6, 0, 21).
        {
            name: 'leftUpperArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            color: { r: 90, g: 140, b: 90 },
            active: e.hasLeftUpperArm !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -6, 0, 24, lArmPitch, 0, 0)
        },
        // Left Lower Arm: 4x6x4. Center at (-6, 0, 15).
        {
            name: 'leftLowerArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            color: { r: 90, g: 140, b: 90 },
            active: e.hasLeftLowerArm !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -6, 0, 18, lElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -6, 0, 24, lArmPitch, 0, 0);
            }
        },
        // Right Upper Arm: 4x6x4. Center at (6, 0, 21).
        {
            name: 'rightUpperArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            color: { r: 90, g: 140, b: 90 },
            active: e.hasRightUpperArm !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 6, 0, 24, rArmPitch, 0, 0)
        },
        // Right Lower Arm: 4x6x4. Center at (6, 0, 15).
        {
            name: 'rightLowerArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            color: { r: 90, g: 140, b: 90 },
            active: e.hasRightLowerArm !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 6, 0, 18, rElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 6, 0, 24, rArmPitch, 0, 0);
            }
        },
        // Left Upper Leg: 4x6x4. Center at (-2, 0, 9).
        {
            name: 'leftUpperLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            color: { r: 64, g: 64, b: 144 },
            active: e.hasLeftUpperLeg !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -2, 0, 12, -legSwing, 0, 0)
        },
        // Left Lower Leg: 4x6x4. Center at (-2, 0, 3).
        {
            name: 'leftLowerLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            color: { r: 64, g: 64, b: 144 },
            active: e.hasLeftLowerLeg !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -2, 0, 6, -lKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -2, 0, 12, -legSwing, 0, 0);
            }
        },
        // Right Upper Leg: 4x6x4. Center at (2, 0, 9).
        {
            name: 'rightUpperLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            color: { r: 64, g: 64, b: 144 },
            active: e.hasRightUpperLeg !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 2, 0, 12, legSwing, 0, 0)
        },
        // Right Lower Leg: 4x6x4. Center at (2, 0, 3).
        {
            name: 'rightLowerLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            color: { r: 64, g: 64, b: 144 },
            active: e.hasRightLowerLeg !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 2, 0, 6, -rKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 2, 0, 12, legSwing, 0, 0);
            }
        }
    ];

    const BOX_FACES = [
        [2, 3, 7, 6], // Front (+Y)
        [0, 1, 5, 4], // Back (-Y)
        [3, 0, 4, 7], // Left (-X)
        [1, 2, 6, 5], // Right (+X)
        [4, 5, 6, 7], // Top (+Z)
        [3, 2, 1, 0]  // Bottom (-Z)
    ];

    let rotAngle = e.angle - Math.PI / 2;
    let cosH = Math.cos(rotAngle);
    let sinH = Math.sin(rotAngle);

    let skinSource = (minecraftZombieSkinImg.complete && minecraftZombieSkinImg.naturalWidth > 0) ? minecraftZombieSkinImg : fallbackSkinCanvas;
    let skinH = skinSource.naturalHeight || skinSource.height || 64;

    for (let part of parts) {
        if (!part.active) continue;

        // Generate 8 vertices
        let localVerts = [
            { x: part.minX, y: part.minY, z: part.minZ },
            { x: part.maxX, y: part.minY, z: part.minZ },
            { x: part.maxX, y: part.maxY, z: part.minZ },
            { x: part.minX, y: part.maxY, z: part.minZ },
            { x: part.minX, y: part.minY, z: part.maxZ },
            { x: part.maxX, y: part.minY, z: part.maxZ },
            { x: part.maxX, y: part.maxY, z: part.maxZ },
            { x: part.minX, y: part.maxY, z: part.maxZ }
        ];

        // Apply transformations to vertices (skeletal then world)
        let worldVerts = [];
        for (let lv of localVerts) {
            let pt = part.transform(lv);
            let sx = pt.x * scale;
            let sy = pt.y * scale;
            let sz = pt.z * scale;

            let rx, ry, rz;
            if (e.isCrawling) {
                rx = sx;
                ry = sz - 12 * scale;
                rz = -sy + 2 * scale;
            } else {
                rx = sx;
                ry = sy;
                rz = sz;
            }

            // Rotate by zombie heading angle (e.angle)
            let wx = rx * cosH - ry * sinH;
            let wy = rx * sinH + ry * cosH;
            let wz = rz;

            worldVerts.push({
                x: e.x + wx,
                y: e.y + wy,
                z: e.z + wz
            });
        }

        // Generate faces
        for (let faceIndex = 0; faceIndex < BOX_FACES.length; faceIndex++) {
            let fIdx = BOX_FACES[faceIndex];
            let pt0 = worldVerts[fIdx[0]];
            let pt1 = worldVerts[fIdx[1]];
            let pt2 = worldVerts[fIdx[2]];
            let pt3 = worldVerts[fIdx[3]];

            // Calculate face normal
            let ux = pt1.x - pt0.x, uy = pt1.y - pt0.y, uz = pt1.z - pt0.z;
            let wx = pt2.x - pt0.x, wy = pt2.y - pt0.y, wz = pt2.z - pt0.z;
            let nx = uy*wz - uz*wy;
            let ny = uz*wx - ux*wz;
            let nz = ux*wy - uy*wx;

            // Backface culling
            let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
            let camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
            if (nx * (pt0.x - player.x) + ny * (pt0.y - player.y) + nz * (pt0.z - camZ) > 0) continue;

            // Calculate face center
            let cx = (pt0.x + pt1.x + pt2.x + pt3.x) / 4;
            let cy = (pt0.y + pt1.y + pt2.y + pt3.y) / 4;
            let cz = (pt0.z + pt1.z + pt2.z + pt3.z) / 4;

            // Depth check
            let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ;
            let cosA = Math.cos(player.angle), sinA = Math.sin(player.angle);
            let rx = dx * cosA + dy * sinA;
            let rz = dz;
            let fov = canvas.width * currentZoom;
            let pitchAngle = Math.atan2(player.pitch, fov);
            let cosP = Math.cos(pitchAngle), sinP = Math.sin(pitchAngle);
            let cz_depth = rz * sinP + rx * cosP;

            if (cz_depth > 0.1 && cz_depth < VIEW_DIST) {
                let o = getRenderItem();
                o.type = 'objWorldFace';
                o.pts = [pt0, pt1, pt2, pt3];
                o.color = part.color;
                o.depthSq = cz_depth * cz_depth;
                o.wX = cx;
                o.wY = cy;
                o.h = cz;
                o.norm = { x: nx, y: ny, z: nz };
                o.targeted = (e === interactTarget);
                o.flash = e.flash > 0;

                let uvRegion = getMinecraftUVs(part.name, faceIndex, skinH);
                if (uvRegion) {
                    let uMin = uvRegion[0], vMin = uvRegion[1], uMax = uvRegion[2], vMax = uvRegion[3];
                    o.texture = skinSource;
                    o.uvs = getFaceCornerUVs(faceIndex, uMin, vMin, uMax, vMax);
                } else {
                    // Joint / cut stump
                    if (part.name !== 'head' && part.name !== 'torso') {
                        o.color = { r: 150, g: 0, b: 0 };
                    }
                }
            }
        }
    }
}

function add3DLimbFaces(b, ambient) {
    let scale = (b.scale || (1.4 / 32.0)) * 1.333;
    let minX, maxX, minY, maxY, minZ, maxZ;
    let color;

    let type = b.limbType;
    let isArm = type.includes('Arm') || type === 'upperArm' || type === 'lowerArm';
    let isLeg = type.includes('Leg') || type === 'upperLeg' || type === 'lowerLeg';

    if (type === 'head') {
        minX = -4 * scale; maxX = 4 * scale;
        minY = -4 * scale; maxY = 4 * scale;
        minZ = -4 * scale; maxZ = 4 * scale;
        color = { r: 90, g: 140, b: 90 };
    } else if (isArm) {
        minX = -2 * scale; maxX = 2 * scale;
        minY = -2 * scale; maxY = 2 * scale;
        minZ = -3 * scale; maxZ = 3 * scale;
        color = { r: 90, g: 140, b: 90 };
    } else {
        // Legs
        minX = -2 * scale; maxX = 2 * scale;
        minY = -2 * scale; maxY = 2 * scale;
        minZ = -3 * scale; maxZ = 3 * scale;
        color = { r: 64, g: 64, b: 144 };
    }

    // Spin/rotation angles
    let isMoving = (b.vx !== 0 || b.vy !== 0 || b.vz !== 0);
    let rx = isMoving ? (b.spinX + b.life * b.spinSpeed) : Math.PI / 2;
    let ry = isMoving ? (b.spinY + b.life * b.spinSpeed) : 0;
    let rz = isMoving ? (b.spinZ + b.life * b.spinSpeed) : (b.landedAngle || 0);

    let localVerts = [
        { x: minX, y: minY, z: minZ },
        { x: maxX, y: minY, z: minZ },
        { x: maxX, y: maxY, z: minZ },
        { x: minX, y: maxY, z: minZ },
        { x: minX, y: minY, z: maxZ },
        { x: maxX, y: minY, z: maxZ },
        { x: maxX, y: maxY, z: maxZ },
        { x: minX, y: maxY, z: maxZ }
    ];

    const BOX_FACES = [
        [2, 3, 7, 6], // Front (+Y)
        [0, 1, 5, 4], // Back (-Y)
        [3, 0, 4, 7], // Left (-X)
        [1, 2, 6, 5], // Right (+X)
        [4, 5, 6, 7], // Top (+Z)
        [3, 2, 1, 0]  // Bottom (-Z)
    ];

    // Transform vertices
    let worldVerts = [];
    for (let lv of localVerts) {
        let pt = rotate3D(lv.x, lv.y, lv.z, rx, ry, rz);
        worldVerts.push({
            x: b.x + pt.x,
            y: b.y + pt.y,
            z: b.z + pt.z
        });
    }

    // Alpha fade over its 900 frame lifetime
    let alpha = Math.min(1.0, b.life / 150.0);

    let skinSource = (minecraftZombieSkinImg.complete && minecraftZombieSkinImg.naturalWidth > 0) ? minecraftZombieSkinImg : fallbackSkinCanvas;
    let skinH = skinSource.naturalHeight || skinSource.height || 64;

    for (let faceIndex = 0; faceIndex < BOX_FACES.length; faceIndex++) {
        let fIdx = BOX_FACES[faceIndex];
        let pt0 = worldVerts[fIdx[0]];
        let pt1 = worldVerts[fIdx[1]];
        let pt2 = worldVerts[fIdx[2]];
        let pt3 = worldVerts[fIdx[3]];

        // Calculate face normal
        let ux = pt1.x - pt0.x, uy = pt1.y - pt0.y, uz = pt1.z - pt0.z;
        let wx = pt2.x - pt0.x, wy = pt2.y - pt0.y, wz = pt2.z - pt0.z;
        let nx = uy*wz - uz*wy;
        let ny = uz*wx - ux*wz;
        let nz = ux*wy - uy*wx;

        // Backface culling
        let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
        let camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
        if (nx * (pt0.x - player.x) + ny * (pt0.y - player.y) + nz * (pt0.z - camZ) > 0) continue;

        // Face center
        let cx = (pt0.x + pt1.x + pt2.x + pt3.x) / 4;
        let cy = (pt0.y + pt1.y + pt2.y + pt3.y) / 4;
        let cz = (pt0.z + pt1.z + pt2.z + pt3.z) / 4;

        // Depth check
        let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ;
        let cosA = Math.cos(player.angle), sinA = Math.sin(player.angle);
        let rx = dx * cosA + dy * sinA;
        let rz = dz;
        let fov = canvas.width * currentZoom;
        let pitchAngle = Math.atan2(player.pitch, fov);
        let cosP = Math.cos(pitchAngle), sinP = Math.sin(pitchAngle);
        let cz_depth = rz * sinP + rx * cosP;

        if (cz_depth > 0.1 && cz_depth < VIEW_DIST) {
            let o = getRenderItem();
            o.type = 'objWorldFace';
            o.pts = [pt0, pt1, pt2, pt3];
            o.color = color;
            o.depthSq = cz_depth * cz_depth;
            o.wX = cx;
            o.wY = cy;
            o.h = cz;
            o.norm = { x: nx, y: ny, z: nz };
            o.targeted = false;
            o.flash = false;
            o.alpha = alpha;

            let uvRegion = getMinecraftUVs(type, faceIndex, skinH);
            if (uvRegion) {
                let uMin = uvRegion[0], vMin = uvRegion[1], uMax = uvRegion[2], vMax = uvRegion[3];
                o.texture = skinSource;
                o.uvs = getFaceCornerUVs(faceIndex, uMin, vMin, uMax, vMax);
            } else {
                // Joint / cut stump
                if (type !== 'head') {
                    o.color = { r: 150, g: 0, b: 0 };
                }
            }
        }
    }
}
