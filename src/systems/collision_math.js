//THIS IS collision_math.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// --- 3D Hitbox Math Helpers ---
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

function distPointToSegment(px, py, pz, p1x, p1y, p1z, p2x, p2y, p2z) {
    let dx = p2x - p1x, dy = p2y - p1y, dz = p2z - p1z;
    let len2 = dx*dx + dy*dy + dz*dz;
    let t = 0;
    if (len2 > 0) {
        t = ((px - p1x) * dx + (py - p1y) * dy + (pz - p1z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
    }
    let cx = p1x + t * dx;
    let cy = p1y + t * dy;
    let cz = p1z + t * dz;
    return Math.hypot(px - cx, py - cy, pz - cz);
}

function intersectSegmentTriangle(p1, p2, a, b, c) {
    const EPSILON = 0.0000001;
    let edge1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    let edge2 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    let dir = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    
    let h = {
        x: dir.y * edge2.z - dir.z * edge2.y,
        y: dir.z * edge2.x - dir.x * edge2.z,
        z: dir.x * edge2.y - dir.y * edge2.x
    };
    let a_dot = edge1.x * h.x + edge1.y * h.y + edge1.z * h.z;
    if (a_dot > -EPSILON && a_dot < EPSILON) return false;
    
    let f = 1.0 / a_dot;
    let s = { x: p1.x - a.x, y: p1.y - a.y, z: p1.z - a.z };
    let u = f * (s.x * h.x + s.y * h.y + s.z * h.z);
    if (u < 0.0 || u > 1.0) return false;
    
    let q = {
        x: s.y * edge1.z - s.z * edge1.y,
        y: s.z * edge1.x - s.x * edge1.z,
        z: s.x * edge1.y - s.y * edge1.x
    };
    let v = f * (dir.x * q.x + dir.y * q.y + dir.z * q.z);
    if (v < 0.0 || u + v > 1.0) return false;
    
    let t = f * (edge2.x * q.x + edge2.y * q.y + edge2.z * q.z);
    if (t >= 0.0 && t <= 1.0) {
        return t;
    }
    return false;
}

function intersectSegmentBox(p1, p2, verts) {
    const faces = [
        [2, 3, 7, 6],
        [0, 1, 5, 4],
        [3, 0, 4, 7],
        [1, 2, 6, 5],
        [4, 5, 6, 7],
        [3, 2, 1, 0]
    ];
    let minT = Infinity;
    for (let face of faces) {
        let t1 = intersectSegmentTriangle(p1, p2, verts[face[0]], verts[face[1]], verts[face[2]]);
        if (t1 !== false && t1 < minT) minT = t1;
        let t2 = intersectSegmentTriangle(p1, p2, verts[face[0]], verts[face[2]], verts[face[3]]);
        if (t2 !== false && t2 < minT) minT = t2;
    }
    return minT < Infinity ? minT : false;
}

function get3DZombieLimbBoxes(e) {
    let scale = e.size / 32.0;
    let animTime = e.animTime || 0;
    
    let legSwing = Math.sin(animTime) * 0.6;
    let rKneeBend = legSwing < 0 ? -legSwing * 0.8 : 0;
    let lKneeBend = legSwing > 0 ? legSwing * 0.8 : 0;

    let rArmPitch = 1.3 + Math.sin(animTime) * 0.1;
    let lArmPitch = 1.3 - Math.sin(animTime) * 0.1;
    let rElbowBend = 0.2 + Math.abs(Math.sin(animTime)) * 0.2;
    let lElbowBend = 0.2 + Math.abs(Math.cos(animTime)) * 0.2;

    let headPitch = 0.1 + Math.sin(animTime * 0.5) * 0.05;
    let headYaw = Math.cos(animTime * 0.3) * 0.1;

    let parts = [
        {
            name: 'torso',
            minX: -4, maxX: 4, minY: -2, maxY: 2, minZ: 12, maxZ: 24,
            active: true,
            transform: v => ({ x: v.x, y: v.y, z: v.z })
        },
        {
            name: 'head',
            minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: 24, maxZ: 32,
            active: e.hasHead !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 0, 0, 24, headPitch, 0, headYaw)
        },
        {
            name: 'leftUpperArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            active: e.hasLeftUpperArm !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -6, 0, 24, lArmPitch, 0, 0)
        },
        {
            name: 'leftLowerArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            active: e.hasLeftLowerArm !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -6, 0, 18, lElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -6, 0, 24, lArmPitch, 0, 0);
            }
        },
        {
            name: 'rightUpperArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            active: e.hasRightUpperArm !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 6, 0, 24, rArmPitch, 0, 0)
        },
        {
            name: 'rightLowerArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            active: e.hasRightLowerArm !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 6, 0, 18, rElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 6, 0, 24, rArmPitch, 0, 0);
            }
        },
        {
            name: 'leftUpperLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            active: e.hasLeftUpperLeg !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -2, 0, 12, -legSwing, 0, 0)
        },
        {
            name: 'leftLowerLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            active: e.hasLeftLowerLeg !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -2, 0, 6, -lKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -2, 0, 12, -legSwing, 0, 0);
            }
        },
        {
            name: 'rightUpperLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            active: e.hasRightUpperLeg !== false,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 2, 0, 12, legSwing, 0, 0)
        },
        {
            name: 'rightLowerLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            active: e.hasRightLowerLeg !== false,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 2, 0, 6, -rKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 2, 0, 12, legSwing, 0, 0);
            }
        }
    ];

    let rotAngle = e.angle - Math.PI / 2;
    let cosH = Math.cos(rotAngle);
    let sinH = Math.sin(rotAngle);

    let limbBoxes = [];

    for (let part of parts) {
        if (!part.active) continue;

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

            let wx = rx * cosH - ry * sinH;
            let wy = rx * sinH + ry * cosH;
            let wz = rz;

            worldVerts.push({
                x: e.x + wx,
                y: e.y + wy,
                z: e.z + wz
            });
        }

        limbBoxes.push({
            name: part.name,
            verts: worldVerts
        });
    }
    return limbBoxes;
}

function getRagdollPartWorldVerts(body) {
    let w = body.partWidth;
    let d = body.partDepth;
    let h = body.partHeight;
    let scale = body.scale;
    
    let hw = (w * scale) / 2;
    let hd = (d * scale) / 2;
    let hh = (h * scale) / 2;
    let localVerts = [
        { x: -hw, y: -hd, z: -hh },
        { x:  hw, y: -hd, z: -hh },
        { x:  hw, y:  hd, z: -hh },
        { x: -hw, y:  hd, z: -hh },
        { x: -hw, y: -hd, z:  hh },
        { x:  hw, y: -hd, z:  hh },
        { x:  hw, y:  hd, z:  hh },
        { x: -hw, y:  hd, z:  hh }
    ];
    let worldVerts = [];
    let q = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    for (let lv of localVerts) {
        let pt = new THREE.Vector3(lv.x, lv.y, lv.z);
        pt.applyQuaternion(q);
        worldVerts.push({
            x: body.position.x + pt.x,
            y: body.position.y + pt.y,
            z: body.position.z + pt.z
        });
    }
    return worldVerts;
}

