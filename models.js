// --- 3D Model Support ---
const WEAPON_MODELS = {};
const WEAPON_MODEL_CONFIG = {
    'pistol':  { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0, offsetX: 0.2, offsetY: 0.5, offsetZ: -0.2 },
    'smg':     { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0, offsetX: 0.2, offsetY: 0.5, offsetZ: -0.2 },
    'shotgun': { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0, offsetX: 0.2, offsetY: 0.5, offsetZ: -0.2 }
};

const VEHICLE_MODEL_CONFIG = {
    'truck': { scale: 1.4, rotX: Math.PI/2, rotY: 0, rotZ: Math.PI/2, offsetZ: -0.8 } 
};

async function loadObjModel(name) {
    try {
        const objRes = await fetch(`models/${name}.obj`);
        if (!objRes.ok) return;
        const objText = await objRes.text();
        
        let mtlText = '';
        try {
            const mtlRes = await fetch(`models/${name}.mtl`);
            if (mtlRes.ok) mtlText = await mtlRes.text();
        } catch(e) {}
        
        const materials = {};
        let currentMtl = null;
        if (mtlText) {
            const lines = mtlText.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (line.startsWith('newmtl ')) {
                    currentMtl = line.substring(7).trim();
                    materials[currentMtl] = { r: 200, g: 200, b: 200 };
                } else if (line.startsWith('Kd ')) {
                    const parts = line.split(/\s+/);
                    if (currentMtl && parts.length >= 4) {
                        materials[currentMtl] = {
                            r: parseFloat(parts[1]) * 255,
                            g: parseFloat(parts[2]) * 255,
                            b: parseFloat(parts[3]) * 255
                        };
                    }
                }
            }
        }

        const vertices = [];
        const faces = [];
        currentMtl = null;

        const lines = objText.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('v ')) {
                const parts = line.split(/\s+/);
                vertices.push({ x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) });
            } else if (line.startsWith('usemtl ')) {
                currentMtl = line.substring(7).trim();
            } else if (line.startsWith('f ')) {
                const parts = line.split(/\s+/).slice(1);
                const faceVerts = [];
                for (let p of parts) {
                    if (!p) continue;
                    const vIdx = parseInt(p.split('/')[0]);
                    faceVerts.push(vIdx > 0 ? vIdx - 1 : vertices.length + vIdx);
                }
                for (let i = 1; i < faceVerts.length - 1; i++) {
                    faces.push({
                        pts: [ vertices[faceVerts[0]], vertices[faceVerts[i]], vertices[faceVerts[i+1]] ],
                        color: materials[currentMtl] || { r: 150, g: 150, b: 150 }
                    });
                }
            }
        }
        WEAPON_MODELS[name] = { vertices, faces };
    } catch (e) {}
}

loadObjModel('pistol');
loadObjModel('shotgun');
loadObjModel('smg');
loadObjModel('truck');

function rotate3D(x, y, z, rotX, rotY, rotZ) {
    let cx = Math.cos(rotX), sx = Math.sin(rotX);
    let cy = Math.cos(rotY), sy = Math.sin(rotY);
    let cz = Math.cos(rotZ), sz = Math.sin(rotZ);
    let y1 = y * cx - z * sx;
    let z1 = y * sx + z * cx;
    let x2 = x * cy + z1 * sy;
    let z2 = -x * sy + z1 * cy;
    let x3 = x2 * cz - y1 * sz;
    let y3 = x2 * sz + y1 * cz;
    return { x: x3, y: y3, z: z2 };
}

function renderWeaponModel() {
    let wData = WEAPONS[currentWeapon];
    if (!wData) return;
    let wName = wData.name.toLowerCase();
    let model = WEAPON_MODELS[wName];
    if (!model || wData.isMelee) return;

    let conf = WEAPON_MODEL_CONFIG[wName] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0, offsetX: 0.2, offsetY: 0.5, offsetZ: -0.2 };

    let isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
    let bobX = isMoving && !flightMode ? Math.cos(gameTime * 200) * 0.01 : 0;
    let bobY = isMoving && !flightMode ? Math.abs(Math.sin(gameTime * 200)) * 0.02 : 0;
    
    let recoilOffset = fireCooldown > 0 ? (fireCooldown / wData.fireRate) * 0.1 : 0;

    let targetOffsetX = isZooming ? 0 : conf.offsetX;
    let targetOffsetY = isZooming ? conf.offsetY - 0.1 : conf.offsetY;
    let targetOffsetZ = isZooming ? conf.offsetZ + 0.05 : conf.offsetZ;

    let ox = targetOffsetX + bobX;
    let oy = targetOffsetY - recoilOffset; 
    let oz = targetOffsetZ - bobY + (recoilOffset * 0.2); 
    
    const fov = canvas.width * currentZoom;
    const screenCenterY = canvas.height / 2;

    let facesToRender = [];
    
    for (let f of model.faces) {
        let poly = [];
        let valid = true;
        for (let v of f.pts) {
            let r = rotate3D(v.x, v.y, v.z, conf.rotX, conf.rotY, conf.rotZ);
            
            let mx = r.x * conf.scale;
            let my = -r.z * conf.scale;
            let mz = r.y * conf.scale;
            
            let lx = mx + ox;
            let ly = my + oy;
            let lz = mz + oz;
            
            if (ly < 0.01) { valid = false; break; }
            
            let sy = screenCenterY - (lz / ly) * fov; 
            let sx = canvas.width/2 + (lx / ly) * fov;
            
            poly.push({sx, sy, ly, lx, ly_val: ly, lz});
        }
        
        if (valid && poly.length === 3) {
            let ux = poly[1].sx - poly[0].sx;
            let uy = poly[1].sy - poly[0].sy;
            let vx = poly[2].sx - poly[0].sx;
            let vy = poly[2].sy - poly[0].sy;
            let cross = ux * vy - uy * vx;
            if (cross > 0) continue; 
            
            let depth = (poly[0].ly_val + poly[1].ly_val + poly[2].ly_val) / 3;
            
            let dx1 = poly[1].lx - poly[0].lx;
            let dy1 = poly[1].ly_val - poly[0].ly_val;
            let dz1 = poly[1].lz - poly[0].lz;
            let dx2 = poly[2].lx - poly[0].lx;
            let dy2 = poly[2].ly_val - poly[0].ly_val;
            let dz2 = poly[2].lz - poly[0].lz;
            
            let nx = dy1*dz2 - dz1*dy2;
            let ny = dz1*dx2 - dx1*dz2;
            let nz = dx1*dy2 - dy1*dx2;
            let len = Math.hypot(nx, ny, nz);
            if (len > 0) { nx/=len; ny/=len; nz/=len; }
            
            let dot = nx * 0.3 + ny * 0.5 + nz * 0.8;
            let shade = 0.4 + Math.max(0, dot) * 0.6;
            
            facesToRender.push({ poly, depth, color: f.color, shade });
        }
    }
    
    facesToRender.sort((a,b) => b.depth - a.depth);
    
    for (let f of facesToRender) {
        ctx.fillStyle = `rgb(${f.color.r * f.shade | 0}, ${f.color.g * f.shade | 0}, ${f.color.b * f.shade | 0})`;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(f.poly[0].sx, f.poly[0].sy);
        ctx.lineTo(f.poly[1].sx, f.poly[1].sy);
        ctx.lineTo(f.poly[2].sx, f.poly[2].sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}
