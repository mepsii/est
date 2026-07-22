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

    let torsoColor = e.isSuperZombie ? { r: 180, g: 30, b: 30 } : { r: 60, g: 156, b: 156 };
    let parts = [
        // Torso: 8x12x4. Center at (0, 0, 18).
        {
            name: 'torso',
            minX: -4, maxX: 4, minY: -2, maxY: 2, minZ: 12, maxZ: 24,
            color: torsoColor,
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
            let camZ = currentCamZ;
            if (nx * (pt0.x - player.x) + ny * (pt0.y - player.y) + nz * (pt0.z - camZ) > 0) continue;

            // Calculate face center
            let cx = (pt0.x + pt1.x + pt2.x + pt3.x) / 4;
            let cy = (pt0.y + pt1.y + pt2.y + pt3.y) / 4;
            let cz = (pt0.z + pt1.z + pt2.z + pt3.z) / 4;

            // Depth check
            let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ;
            let cosA = Math.cos(currentCamAngle), sinA = Math.sin(currentCamAngle);
            let rx = dx * cosA + dy * sinA;
            let rz = dz;
            let pitchAngle = currentCamPitch;
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
        let camZ = currentCamZ;
        if (nx * (pt0.x - player.x) + ny * (pt0.y - player.y) + nz * (pt0.z - camZ) > 0) continue;

        // Face center
        let cx = (pt0.x + pt1.x + pt2.x + pt3.x) / 4;
        let cy = (pt0.y + pt1.y + pt2.y + pt3.y) / 4;
        let cz = (pt0.z + pt1.z + pt2.z + pt3.z) / 4;

        // Depth check
        let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ;
        let cosA = Math.cos(currentCamAngle), sinA = Math.sin(currentCamAngle);
        let rx = dx * cosA + dy * sinA;
        let rz = dz;
        let pitchAngle = currentCamPitch;
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

function add3DPlayerFaces(ambient, realPlayerX, realPlayerY) {
    let scale = player.baseHeight / 32.0;
    
    let skinSource = (minecraftPlayerSkinImg.complete && minecraftPlayerSkinImg.naturalWidth > 0) ? minecraftPlayerSkinImg : fallbackPlayerSkinCanvas;
    let skinH = skinSource.naturalHeight || skinSource.height || 64;

    let rArmPitch = 0;
    let lArmPitch = 0;
    let rElbowBend = 0;
    let lElbowBend = 0;
    let rKneeBend = 0;
    let lKneeBend = 0;
    let rLegPitch = 0;
    let lLegPitch = 0;
    let headPitch = 0;
    let headYaw = 0;

    const pitchAngle = player.pitch;

    let isSitting = (player.inVehicle !== null);
    let v = player.inVehicle;
    let realX, realY, realZ, bodyAngle;
    let bodyRoll = 0;
    let bodyPitch = 0;

    if (isSitting) {
        // 1. Calculate seat position using the vehicle's full 3D quaternion rotation
        let localSeat = new THREE.Vector3(0.30, -0.32, -0.62);
        let bodyQuat = new THREE.Quaternion(v.qx, v.qy, v.qz, v.qw);
        localSeat.applyQuaternion(bodyQuat);
        realX = v.x + localSeat.x;
        realY = v.y + localSeat.y;
        realZ = v.z + localSeat.z;
        
        // 2. Lock relative player leaning/movement to 15 degrees (0.2618 radians)
        let maxLean = 15 * Math.PI / 180;
        // Invert pitch and roll so the player leans against the vehicle tilt to stay upright relative to gravity
        let leanPitch = -Math.max(-maxLean, Math.min(maxLean, v.pitch || 0));
        let leanRoll = -Math.max(-maxLean, Math.min(maxLean, v.roll || 0));
        
        // Invert turning lean so the player leans outward in a turn under centrifugal G-force
        let turnLean = 0;
        if (v.raycastVehicle && v.raycastVehicle.wheelInfos && v.raycastVehicle.wheelInfos[0]) {
            let steer = v.raycastVehicle.wheelInfos[0].steering || 0;
            turnLean = -steer * Math.min(1.0, (v.speed || 0) / 10.0) * 0.12; 
        }
        leanRoll = Math.max(-maxLean, Math.min(maxLean, leanRoll + turnLean));
        
        bodyAngle = v.angle;
        bodyPitch = leanPitch;
        bodyRoll = leanRoll;

        rLegPitch = -Math.PI / 2;
        lLegPitch = -Math.PI / 2;
        rKneeBend = Math.PI / 2;
        lKneeBend = Math.PI / 2;

        rArmPitch = 1.0;
        lArmPitch = 1.0;
        rElbowBend = 0.5;
        lElbowBend = 0.5;

        headPitch = -pitchAngle;
        headYaw = 0;
    } else {
        realX = realPlayerX;
        realY = realPlayerY;
        realZ = player.z;
        bodyAngle = player.angle;

        let animTime = player.animTime || 0;
        let legSwing = Math.sin(animTime) * 0.6;
        rLegPitch = legSwing;
        lLegPitch = -legSwing;
        rKneeBend = legSwing < 0 ? -legSwing * 0.8 : 0;
        lKneeBend = legSwing > 0 ? legSwing * 0.8 : 0;

        rArmPitch = -legSwing * 0.6;
        lArmPitch = legSwing * 0.6;

        let activeItem = inventory[hotbarSelection];
        let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;
        let holdingWeapon = (curW !== null);
        let isTwoHanded = curW && (curW.type === 'weapon' && (activeItem.id === 'smg' || activeItem.id === 'shotgun'));

        if (holdingWeapon) {
            rArmPitch = 1.57 - pitchAngle;
            rElbowBend = 0.1;
            if (isTwoHanded) {
                lArmPitch = 1.2 - pitchAngle;
                lElbowBend = 0.4;
            }
        }

        headPitch = -pitchAngle;
        headYaw = 0;
    }

    let parts = [
        {
            name: 'torso',
            minX: -4, maxX: 4, minY: -2, maxY: 2, minZ: 12, maxZ: 24,
            color: { r: 0, g: 162, b: 162 },
            active: true,
            transform: v => ({ x: v.x, y: v.y, z: v.z })
        },
        {
            name: 'head',
            minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: 24, maxZ: 32,
            color: { r: 224, g: 160, b: 128 },
            active: true,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 0, 0, 24, headPitch, 0, headYaw)
        },
        {
            name: 'rightUpperArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            color: { r: 224, g: 160, b: 128 },
            active: true,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -6, 0, 24, rArmPitch, 0, 0)
        },
        {
            name: 'rightLowerArm',
            minX: -8, maxX: -4, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            color: { r: 224, g: 160, b: 128 },
            active: true,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -6, 0, 18, rElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -6, 0, 24, rArmPitch, 0, 0);
            }
        },
        {
            name: 'leftUpperArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 18, maxZ: 24,
            color: { r: 224, g: 160, b: 128 },
            active: true,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 6, 0, 24, lArmPitch, 0, 0)
        },
        {
            name: 'leftLowerArm',
            minX: 4, maxX: 8, minY: -2, maxY: 2, minZ: 12, maxZ: 18,
            color: { r: 224, g: 160, b: 128 },
            active: true,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 6, 0, 18, lElbowBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 6, 0, 24, lArmPitch, 0, 0);
            }
        },
        {
            name: 'rightUpperLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            color: { r: 60, g: 60, b: 189 },
            active: true,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, -2, 0, 12, -rLegPitch, 0, 0)
        },
        {
            name: 'rightLowerLeg',
            minX: -4, maxX: 0, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            color: { r: 60, g: 60, b: 189 },
            active: true,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, -2, 0, 6, -rKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, -2, 0, 12, -rLegPitch, 0, 0);
            }
        },
        {
            name: 'leftUpperLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 6, maxZ: 12,
            color: { r: 60, g: 60, b: 189 },
            active: true,
            transform: v => rotateAroundPivot(v.x, v.y, v.z, 2, 0, 12, -lLegPitch, 0, 0)
        },
        {
            name: 'leftLowerLeg',
            minX: 0, maxX: 4, minY: -2, maxY: 2, minZ: 0, maxZ: 6,
            color: { r: 60, g: 60, b: 189 },
            active: true,
            transform: v => {
                let v1 = rotateAroundPivot(v.x, v.y, v.z, 2, 0, 6, -lKneeBend, 0, 0);
                return rotateAroundPivot(v1.x, v1.y, v1.z, 2, 0, 12, -lLegPitch, 0, 0);
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

    let rotAngle = bodyAngle - Math.PI / 2;
    let cosH = Math.cos(rotAngle);
    let sinH = Math.sin(rotAngle);

    let camZ = currentCamZ;

    for (let part of parts) {
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

            let rx = sx, ry = sy, rz = sz;
            let wx, wy, wz;

            if (isSitting) {
                let cp = Math.cos(bodyPitch), sp = Math.sin(bodyPitch);
                let cr = Math.cos(bodyRoll), sr = Math.sin(bodyRoll);
                
                // Rotate locally by lean Pitch (around Y)
                let p2x = rx * cp - rz * sp;
                let p2y = ry;
                let p2z = rx * sp + rz * cp;
                
                // Rotate locally by lean Roll (around X)
                let p3x = p2x;
                let p3y = p2y * cr - p2z * sr;
                let p3z = p2y * sr + p2z * cr;
                
                // Rotate the player model's default orientation to face forward relative to the vehicle
                let rRotX = p3y;
                let rRotY = -p3x;
                let rRotZ = p3z;
                
                // Apply vehicle's full 3D quaternion rotation so we are locked to the body orientation
                let localPt = new THREE.Vector3(rRotX, rRotY, rRotZ);
                let bodyQuat = new THREE.Quaternion(v.qx, v.qy, v.qz, v.qw);
                localPt.applyQuaternion(bodyQuat);
                
                wx = localPt.x;
                wy = localPt.y;
                wz = localPt.z;
            } else {
                wx = rx * cosH - ry * sinH;
                wy = rx * sinH + ry * cosH;
                wz = rz;
            }

            worldVerts.push({
                x: realX + wx,
                y: realY + wy,
                z: realZ + wz
            });
        }

        for (let faceIndex = 0; faceIndex < BOX_FACES.length; faceIndex++) {
            let fIdx = BOX_FACES[faceIndex];
            let pt0 = worldVerts[fIdx[0]];
            let pt1 = worldVerts[fIdx[1]];
            let pt2 = worldVerts[fIdx[2]];
            let pt3 = worldVerts[fIdx[3]];

            let ux = pt1.x - pt0.x, uy = pt1.y - pt0.y, uz = pt1.z - pt0.z;
            let wx_v = pt2.x - pt0.x, wy_v = pt2.y - pt0.y, wz_v = pt2.z - pt0.z;
            let nx = uy*wz_v - uz*wy_v;
            let ny = uz*wx_v - ux*wz_v;
            let nz = ux*wy_v - uy*wx_v;

            if (nx * (pt0.x - player.x) + ny * (pt0.y - player.y) + nz * (pt0.z - camZ) > 0) continue;

            let cx = (pt0.x + pt1.x + pt2.x + pt3.x) / 4;
            let cy = (pt0.y + pt1.y + pt2.y + pt3.y) / 4;
            let cz = (pt0.z + pt1.z + pt2.z + pt3.z) / 4;

            let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ;
            let cosA = Math.cos(currentCamAngle), sinA = Math.sin(currentCamAngle);
            let rx_depth = dx * cosA + dy * sinA;
            let rz_depth = dz;
            let pitchAngle_depth = currentCamPitch;
            let cosP = Math.cos(pitchAngle_depth), sinP = Math.sin(pitchAngle_depth);
            let cz_depth = rz_depth * sinP + rx_depth * cosP;

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

                let uvRegion = getMinecraftUVs(part.name, faceIndex, skinH);
                if (uvRegion) {
                    let uMin = uvRegion[0], vMin = uvRegion[1], uMax = uvRegion[2], vMax = uvRegion[3];
                    o.texture = skinSource;
                    o.uvs = getFaceCornerUVs(faceIndex, uMin, vMin, uMax, vMax);
                }
            }
        }
    }

    // Held Weapon Rendering (in right hand)
    let activeItem = inventory[hotbarSelection];
    let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;
    if (curW && !curW.isMelee && !isSitting) {
        let wName = curW.name.toLowerCase();
        let model = WEAPON_MODELS[wName];
        if (model) {
            let conf = WEAPON_MODEL_CONFIG[wName] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0 };
            
            let localHandPt = { x: -6, y: 0.5, z: 12.0 };
            let handPt1 = rotateAroundPivot(localHandPt.x, localHandPt.y, localHandPt.z, -6, 0, 18, rElbowBend, 0, 0);
            let handPt2 = rotateAroundPivot(handPt1.x, handPt1.y, handPt1.z, -6, 0, 24, rArmPitch, 0, 0);
            
            let hx = handPt2.x * scale;
            let hy = handPt2.y * scale;
            let hz = handPt2.z * scale;
            
            let wxHand = hx * cosH - hy * sinH;
            let wyHand = hx * sinH + hy * cosH;
            let wzHand = hz;
            
            let worldHandPt = {
                x: realX + wxHand,
                y: realY + wyHand,
                z: realZ + wzHand
            };

            let weaponScale = conf.scale * 1.3;
            let weaponRotX = conf.rotX;
            let weaponRotY = conf.rotY;
            let weaponRotZ = conf.rotZ;

            for (let f of model.faces) {
                let wPts = [];
                for (let pt of f.pts) {
                    let p1 = rotate3D(pt.x * weaponScale, pt.y * weaponScale, pt.z * weaponScale, weaponRotX, weaponRotY, weaponRotZ);
                    
                    let p2 = rotate3D(p1.x, p1.y, p1.z, rArmPitch - 1.57, 0, 0);
                    
                    let wxW = p2.x * cosH - p2.y * sinH;
                    let wyW = p2.x * sinH + p2.y * cosH;
                    let wzW = p2.z;
                    
                    wPts.push({
                        x: worldHandPt.x + wxW,
                        y: worldHandPt.y + wyW,
                        z: worldHandPt.z + wzW
                    });
                }

                let ux = wPts[1].x - wPts[0].x, uy = wPts[1].y - wPts[0].y, uz = wPts[1].z - wPts[0].z;
                let wx_v = wPts[2].x - wPts[0].x, wy_v = wPts[2].y - wPts[0].y, wz_v = wPts[2].z - wPts[0].z;
                let nx = uy*wz_v - uz*wy_v;
                let ny = uz*wx_v - ux*wz_v;
                let nz = ux*wy_v - uy*wx_v;

                if (nx * (wPts[0].x - player.x) + ny * (wPts[0].y - player.y) + nz * (wPts[0].z - camZ) > 0) continue;

                let cx = (wPts[0].x + wPts[1].x + wPts[2].x) / 3;
                let cy = (wPts[0].y + wPts[1].y + wPts[2].y) / 3;
                let cz = (wPts[0].z + wPts[1].z + wPts[2].z) / 3;

                let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ;
                let cosA = Math.cos(currentCamAngle), sinA = Math.sin(currentCamAngle);
                let rx_depth = dx * cosA + dy * sinA;
                let rz_depth = dz;
                let pitchAngle_depth = currentCamPitch;
                let cosP = Math.cos(pitchAngle_depth), sinP = Math.sin(pitchAngle_depth);
                let cz_depth = rz_depth * sinP + rx_depth * cosP;

                if (cz_depth > 0.1 && cz_depth < VIEW_DIST) {
                    let o = getRenderItem();
                    o.type = 'objWorldFace';
                    o.pts = wPts;
                    o.color = f.color;
                    o.depthSq = cz_depth * cz_depth;
                    o.wX = cx;
                    o.wY = cy;
                    o.h = cz;
                    o.norm = { x: nx, y: ny, z: nz };
                }
            }
        }
    }
}

function drawRagdollPartFaces(body, name, scale, ambient, isFlash = false) {
    let w = body.partWidth;
    let d = body.partDepth;
    let h = body.partHeight;
    let color = body.partColor;
    
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

    const BOX_FACES = [
        [2, 3, 7, 6], // Front (+Y)
        [0, 1, 5, 4], // Back (-Y)
        [3, 0, 4, 7], // Left (-X)
        [1, 2, 6, 5], // Right (+X)
        [4, 5, 6, 7], // Top (+Z)
        [3, 2, 1, 0]  // Bottom (-Z)
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
        let camZ = currentCamZ;
        if (nx * (pt0.x - player.x) + ny * (pt0.y - player.y) + nz * (pt0.z - camZ) > 0) continue;

        // Face center
        let cx = (pt0.x + pt1.x + pt2.x + pt3.x) / 4;
        let cy = (pt0.y + pt1.y + pt2.y + pt3.y) / 4;
        let cz = (pt0.z + pt1.z + pt2.z + pt3.z) / 4;

        // Depth check
        let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ;
        let cosA = Math.cos(currentCamAngle), sinA = Math.sin(currentCamAngle);
        let rx = dx * cosA + dy * sinA;
        let rz = dz;
        let pitchAngle = currentCamPitch;
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
            o.targeted = (interactTarget && interactTarget.isRagdoll && interactTarget.body === body) || (draggingBody === body);
            o.flash = isFlash;

            let uvRegion = getMinecraftUVs(name, faceIndex, skinH);
            if (uvRegion) {
                let uMin = uvRegion[0], vMin = uvRegion[1], uMax = uvRegion[2], vMax = uvRegion[3];
                o.texture = skinSource;
                o.uvs = getFaceCornerUVs(faceIndex, uMin, vMin, uMax, vMax);
            } else {
                // Joint / cut stump
                if (name !== 'head' && name !== 'torso') {
                    o.color = { r: 150, g: 0, b: 0 };
                }
            }
        }
    }
}

