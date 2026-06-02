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

function generateDefaultSteveSkin() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);

    function fill(x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    // Head (0,0 to 32,16)
    fill(8, 0, 8, 8, '#2b190e'); // Hair top
    fill(16, 0, 8, 8, '#e0a080'); // Neck/Bottom head
    fill(0, 8, 8, 8, '#e0a080'); // Right head
    fill(0, 8, 8, 3, '#2b190e'); // Right head hair
    fill(8, 8, 8, 8, '#e0a080'); // Front head
    fill(8, 8, 8, 2, '#2b190e'); // Front head hair
    fill(8, 10, 1, 1, '#2b190e'); // Front head hair left side
    fill(15, 10, 1, 1, '#2b190e'); // Front head hair right side
    
    // Steve Eyes
    fill(10, 12, 1, 1, '#ffffff'); // Left eye white
    fill(11, 12, 1, 1, '#2f5697'); // Left eye pupil (blue)
    fill(14, 12, 1, 1, '#ffffff'); // Right eye white
    fill(13, 12, 1, 1, '#2f5697'); // Right eye pupil (blue)
    
    // Steve Nose and Mouth
    fill(11, 13, 2, 1, '#bd6e4a'); // Nose
    fill(11, 14, 2, 1, '#7a462d'); // Mouth
    fill(10, 14, 1, 1, '#bd6e4a'); // Lip border L
    fill(13, 14, 1, 1, '#bd6e4a'); // Lip border R

    fill(16, 8, 8, 8, '#e0a080'); // Left head
    fill(16, 8, 8, 3, '#2b190e'); // Left head hair
    fill(24, 8, 8, 8, '#2b190e'); // Back head (all hair)

    // Torso (16,16 to 40,32)
    fill(20, 16, 8, 4, '#e0a080'); // Neck top
    fill(28, 16, 8, 4, '#00a2a2'); // Torso bottom
    fill(16, 20, 4, 12, '#00a2a2'); // Torso right
    fill(20, 20, 8, 12, '#00a2a2'); // Torso front
    fill(22, 20, 4, 2, '#e0a080'); // Neck cutout on front
    fill(28, 20, 4, 12, '#00a2a2'); // Torso left
    fill(32, 20, 8, 12, '#00a2a2'); // Torso back

    // Right Arm (40,16 to 56,32)
    fill(44, 16, 4, 4, '#00a2a2'); // Shoulder top
    fill(48, 16, 4, 4, '#e0a080'); // Hand bottom
    fill(40, 20, 4, 4, '#00a2a2'); // Right arm right sleeve
    fill(40, 24, 4, 8, '#e0a080'); // Right arm right skin
    fill(44, 20, 4, 4, '#00a2a2'); // Right arm front sleeve
    fill(44, 24, 4, 8, '#e0a080'); // Right arm front skin
    fill(48, 20, 4, 4, '#00a2a2'); // Right arm left sleeve
    fill(48, 24, 4, 8, '#e0a080'); // Right arm left skin
    fill(52, 20, 4, 4, '#00a2a2'); // Right arm back sleeve
    fill(52, 24, 4, 8, '#e0a080'); // Right arm back skin

    // Right Leg (0,16 to 16,32)
    fill(4, 16, 4, 4, '#3c3cbd'); // Leg top
    fill(8, 16, 4, 4, '#4c4c4c'); // Leg bottom
    fill(0, 20, 4, 10, '#3c3cbd'); // Leg right pants
    fill(0, 30, 4, 2, '#4c4c4c'); // Leg right shoe
    fill(4, 20, 4, 10, '#3c3cbd'); // Leg front pants
    fill(4, 30, 4, 2, '#4c4c4c'); // Leg front shoe
    fill(8, 20, 4, 10, '#3c3cbd'); // Leg left pants
    fill(8, 30, 4, 2, '#4c4c4c'); // Leg left shoe
    fill(12, 20, 4, 10, '#3c3cbd'); // Leg back pants
    fill(12, 30, 4, 2, '#4c4c4c'); // Leg back shoe

    // Left Arm (32,48 to 48,64)
    fill(36, 48, 4, 4, '#00a2a2'); // Sleeve top
    fill(40, 48, 4, 4, '#e0a080'); // Hand bottom
    fill(32, 52, 4, 4, '#00a2a2'); // Left arm right sleeve
    fill(32, 56, 4, 8, '#e0a080'); // Left arm right skin
    fill(36, 52, 4, 4, '#00a2a2'); // Left arm front sleeve
    fill(36, 56, 4, 8, '#e0a080'); // Left arm front skin
    fill(40, 52, 4, 4, '#00a2a2'); // Left arm left sleeve
    fill(40, 56, 4, 8, '#e0a080'); // Left arm left skin
    fill(44, 52, 4, 4, '#00a2a2'); // Left arm back sleeve
    fill(44, 56, 4, 8, '#e0a080'); // Left arm back skin

    // Left Leg (16,48 to 32,64)
    fill(20, 48, 4, 4, '#3c3cbd'); // Leg top
    fill(24, 48, 4, 4, '#4c4c4c'); // Leg bottom
    fill(16, 52, 4, 10, '#3c3cbd'); // Leg right pants
    fill(16, 62, 4, 2, '#4c4c4c'); // Leg right shoe
    fill(20, 52, 4, 10, '#3c3cbd'); // Leg front pants
    fill(20, 62, 4, 2, '#4c4c4c'); // Leg front shoe
    fill(24, 52, 4, 10, '#3c3cbd'); // Leg left pants
    fill(24, 62, 4, 2, '#4c4c4c'); // Leg left shoe
    fill(28, 52, 4, 10, '#3c3cbd'); // Leg back pants
    fill(28, 62, 4, 2, '#4c4c4c'); // Leg back shoe

    return canvas;
}

const fallbackPlayerSkinCanvas = generateDefaultSteveSkin();
const minecraftPlayerSkinImg = new Image();
let checkedPlayerSkinLimbs = false;
let playerLeftLimbsTransparent = false;

let currentCamX = 0;
let currentCamY = 0;
let currentCamZ = 0;
let currentCamAngle = 0;
let currentCamPitch = 0;

minecraftPlayerSkinImg.onload = () => {
    checkedPlayerSkinLimbs = false;
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = minecraftPlayerSkinImg.naturalWidth;
        tempCanvas.height = minecraftPlayerSkinImg.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(minecraftPlayerSkinImg, 0, 0);
        if (tempCanvas.width === 64 && tempCanvas.height === 64) {
            const imgData = tempCtx.getImageData(16, 48, 32, 16);
            let allTransparent = true;
            for (let i = 3; i < imgData.data.length; i += 4) {
                if (imgData.data[i] > 0) { allTransparent = false; break; }
            }
            if (allTransparent) {
                playerLeftLimbsTransparent = true;
            }
        }
    } catch(e) {}
};
minecraftPlayerSkinImg.src = 'textures/skin.png';
