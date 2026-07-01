//THIS IS combat.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

function spawnFlyingLimb(x, y, z, type, is3D = false, zSize = 1.4) {
    let angle = Math.random() * Math.PI * 2;
    let speed = Math.random() * 0.05 + 0.03;
    let vz = Math.random() * 0.05 + 0.08;
    bloodParticles.push({
        x: x, y: y, z: z,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: vz,
        color: {r: 30, g: 86, b: 34}, // Zombie skin green
        life: is3D ? 900 : (3000 + Math.random() * 600), // 30 seconds (900 frames) for 3D
        maxLife: is3D ? 900 : 3000,
        size: (type === 'head') ? 0.20 : ((type.endsWith('UpperArm') || type.endsWith('UpperLeg') || type === 'upperArm' || type === 'upperLeg') ? 0.16 : 0.12),
        scale: zSize / 32.0,
        isLimb: true,
        limbType: type,
        is3D: is3D,
        sprayAngle: Math.random() * Math.PI * 2,
        landedAngle: (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2) + (Math.random() - 0.5) * 0.3,
        spinX: Math.random() * Math.PI * 2,
        spinY: Math.random() * Math.PI * 2,
        spinZ: Math.random() * Math.PI * 2,
        spinSpeed: Math.random() * 0.2 + 0.1
    });
}

function damageZombieLimb(e, dmg, hitZ, px, py, dx, dy, specificLimb = null) {
    if (e.hasHead === undefined) {
        e.hasHead = true;
        e.hasLeftUpperArm = true;
        e.hasLeftLowerArm = true;
        e.hasRightUpperArm = true;
        e.hasRightLowerArm = true;
        e.hasLeftUpperLeg = true;
        e.hasLeftLowerLeg = true;
        e.hasRightUpperLeg = true;
        e.hasRightLowerLeg = true;
        e.limbsHP = {
            head: 4,
            leftUpperArm: 3,
            leftLowerArm: 2,
            rightUpperArm: 3,
            rightLowerArm: 2,
            leftUpperLeg: 3,
            leftLowerLeg: 2,
            rightUpperLeg: 3,
            rightLowerLeg: 2
        };
        e.isCrawling = false;
    }

    let hitLimb = null;
    let mult = 1.0;

    if (specificLimb) {
        hitLimb = specificLimb;
        if (hitLimb === 'head') {
            mult = 2.0;
        } else if (hitLimb === 'torso') {
            mult = 1.1;
        } else if (hitLimb.endsWith('Arm') || hitLimb.endsWith('arm')) {
            mult = 1.0;
        } else if (hitLimb.endsWith('Leg') || hitLimb.endsWith('leg')) {
            mult = 0.5;
        }
    } else {
        let relZ = hitZ - e.z;
        let len = Math.hypot(dx, dy);
        let hOffset = 0;
        if (len > 0) {
            let sdx = dx / len;
            let sdy = dy / len;
            let vx = px - e.x;
            let vy = py - e.y;
            hOffset = vy * sdx - vx * sdy;
            if (vx === 0 && vy === 0) {
                hOffset = (Math.random() - 0.5) * 0.4; // randomize melee
            }
        }

        // Check hit segment based on height (relZ)
        if (e.type === 'zombie3d' || e.type === 'zombie3d_ragdoll') {
            if (relZ > e.size * 0.75) {
                // Head
                if (e.hasHead) {
                    hitLimb = 'head';
                    mult = 2.0;
                } else {
                    mult = 1.0; // Neck stump
                }
            } else if (relZ > e.size * 0.375) {
                // Torso / Arms height
                if (Math.abs(hOffset) > 0.225) {
                    // Arm!
                    if (hOffset > 0) {
                        // Right Arm
                        if (relZ <= e.size * 0.5625) {
                            if (e.hasRightLowerArm) hitLimb = 'rightLowerArm';
                            else if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        } else {
                            if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        }
                    } else {
                        // Left Arm
                        if (relZ <= e.size * 0.5625) {
                            if (e.hasLeftLowerArm) hitLimb = 'leftLowerArm';
                            else if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        } else {
                            if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        }
                    }
                }
                if (!hitLimb) {
                    mult = (relZ > e.size * 0.5625) ? 1.2 : 1.0;
                }
            } else {
                // Legs / Crawling torso height
                if (e.isCrawling) {
                    mult = 0.5; // Torso/stumps hit while crawling
                } else {
                    // Legs
                    if (hOffset > 0) {
                        // Right Leg
                        if (relZ <= e.size * 0.1875) {
                            if (e.hasRightLowerLeg) hitLimb = 'rightLowerLeg';
                            else if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        } else {
                            if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        }
                    } else {
                        // Left Leg
                        if (relZ <= e.size * 0.1875) {
                            // Left Leg
                            if (e.hasLeftLowerLeg) hitLimb = 'leftLowerLeg';
                            else if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        } else {
                            if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        }
                    }
                    mult = 0.5;
                }
            }
        } else {
            // Original billboard zombie logic
            if (relZ > e.size * 0.88) {
                // Head
                if (e.hasHead) {
                    hitLimb = 'head';
                    mult = 2.0;
                } else {
                    mult = 1.0; // Neck stump hit
                }
            } else if (relZ > e.size * 0.44) {
                // Torso height (chest/abdomen)
                if (Math.abs(hOffset) > 0.12) {
                    // Arm! hOffset > 0 is player's right (screen-right, i.e. zombie's right arm in visual/billboard space)
                    if (hOffset > 0) {
                        // Right Arm
                        if (relZ <= e.size * 0.62) {
                            if (e.hasRightLowerArm) hitLimb = 'rightLowerArm';
                            else if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        } else {
                            if (e.hasRightUpperArm) hitLimb = 'rightUpperArm';
                        }
                    } else {
                        // Left Arm
                        if (relZ <= e.size * 0.62) {
                            if (e.hasLeftLowerArm) hitLimb = 'leftLowerArm';
                            else if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        } else {
                            if (e.hasLeftUpperArm) hitLimb = 'leftUpperArm';
                        }
                    }
                }
                if (!hitLimb) {
                    mult = (relZ > e.size * 0.72) ? 1.2 : 1.0;
                }
            } else {
                // Leg height
                if (e.isCrawling) {
                    mult = 0.5; // Torso/stumps hit while crawling
                } else {
                    // Legs
                    if (hOffset > 0) {
                        // Right Leg
                        if (relZ <= e.size * 0.22) {
                            if (e.hasRightLowerLeg) hitLimb = 'rightLowerLeg';
                            else if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        } else {
                            if (e.hasRightUpperLeg) hitLimb = 'rightUpperLeg';
                        }
                    } else {
                        // Left Leg
                        if (relZ <= e.size * 0.22) {
                            if (e.hasLeftLowerLeg) hitLimb = 'leftLowerLeg';
                            else if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        } else {
                            if (e.hasLeftUpperLeg) hitLimb = 'leftUpperLeg';
                        }
                    }
                    mult = 0.5;
                }
            }
        }
    }

    let totalDmg = dmg * mult;
    e.hp -= totalDmg;
    e.flash = 5;
    addDamageText(e.x, e.y, hitZ, totalDmg);

    let bCol = getBloodColor('zombie') || {r: 92, g: 64, b: 51};
    spawnBlood(px, py, hitZ, bCol, mult === 2.0 ? 25 : 8);

    if (hitLimb) {
        e.limbsHP[hitLimb] -= totalDmg;
        if (e.limbsHP[hitLimb] <= 0) {
            let is3D = e.type === 'zombie3d' || e.type === 'zombie3d_ragdoll';
            if (hitLimb === 'head') {
                e.hasHead = false;
                spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.88, 'head', is3D, e.size);
                if (e.bleedOutTimer === undefined) {
                    e.bleedOutTimer = 120 + Math.random() * 60; // 2 to 3 seconds of movement
                }
            } else if (hitLimb === 'leftLowerArm') {
                e.hasLeftLowerArm = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.15, e.y - Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'leftLowerArm', is3D, e.size);
            } else if (hitLimb === 'leftUpperArm') {
                e.hasLeftUpperArm = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.15, e.y - Math.cos(player.angle)*0.15, e.z + e.size * 0.72, 'leftUpperArm', is3D, e.size);
                if (e.hasLeftLowerArm) {
                    e.hasLeftLowerArm = false;
                    spawnFlyingLimb(e.x + Math.sin(player.angle)*0.15, e.y - Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'leftLowerArm', is3D, e.size);
                }
            } else if (hitLimb === 'rightLowerArm') {
                e.hasRightLowerArm = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.15, e.y + Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'rightLowerArm', is3D, e.size);
            } else if (hitLimb === 'rightUpperArm') {
                e.hasRightUpperArm = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.15, e.y + Math.cos(player.angle)*0.15, e.z + e.size * 0.72, 'rightUpperArm', is3D, e.size);
                if (e.hasRightLowerArm) {
                    e.hasRightLowerArm = false;
                    spawnFlyingLimb(e.x - Math.sin(player.angle)*0.15, e.y + Math.cos(player.angle)*0.15, e.z + e.size * 0.5, 'rightLowerArm', is3D, e.size);
                }
            } else if (hitLimb === 'leftLowerLeg') {
                e.hasLeftLowerLeg = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.08, e.y - Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'leftLowerLeg', is3D, e.size);
                e.isCrawling = true;
            } else if (hitLimb === 'leftUpperLeg') {
                e.hasLeftUpperLeg = false;
                spawnFlyingLimb(e.x + Math.sin(player.angle)*0.08, e.y - Math.cos(player.angle)*0.08, e.z + e.size * 0.3, 'leftUpperLeg', is3D, e.size);
                if (e.hasLeftLowerLeg) {
                    e.hasLeftLowerLeg = false;
                    spawnFlyingLimb(e.x + Math.sin(player.angle)*0.08, e.y - Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'leftLowerLeg', is3D, e.size);
                }
                e.isCrawling = true;
            } else if (hitLimb === 'rightLowerLeg') {
                e.hasRightLowerLeg = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.08, e.y + Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'rightLowerLeg', is3D, e.size);
                e.isCrawling = true;
            } else if (hitLimb === 'rightUpperLeg') {
                e.hasRightUpperLeg = false;
                spawnFlyingLimb(e.x - Math.sin(player.angle)*0.08, e.y + Math.cos(player.angle)*0.08, e.z + e.size * 0.3, 'rightUpperLeg', is3D, e.size);
                if (e.hasRightLowerLeg) {
                    e.hasRightLowerLeg = false;
                    spawnFlyingLimb(e.x - Math.sin(player.angle)*0.08, e.y + Math.cos(player.angle)*0.08, e.z + e.size * 0.1, 'rightLowerLeg', is3D, e.size);
                }
                e.isCrawling = true;
            }
        }
    }

    if (e.hp <= 0) {
        let is3D = e.type === 'zombie3d' || e.type === 'zombie3d_ragdoll';
        spawnBlood(e.x, e.y, e.z + e.size * 0.5, getBloodColor(e.type) || {r: 92, g: 64, b: 51}, 30);
        if (e.type !== 'zombie3d_ragdoll') {
            if (e.hasHead) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.88, 'head', is3D, e.size);
            if (e.hasLeftUpperArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.72, 'leftUpperArm', is3D, e.size);
            if (e.hasLeftLowerArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.5, 'leftLowerArm', is3D, e.size);
            if (e.hasRightUpperArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.72, 'rightUpperArm', is3D, e.size);
            if (e.hasRightLowerArm) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.5, 'rightLowerArm', is3D, e.size);
            if (e.hasLeftUpperLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.3, 'leftUpperLeg', is3D, e.size);
            if (e.hasLeftLowerLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.1, 'leftLowerLeg', is3D, e.size);
            if (e.hasRightUpperLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.3, 'rightUpperLeg', is3D, e.size);
            if (e.hasRightLowerLeg) spawnFlyingLimb(e.x, e.y, e.z + e.size * 0.1, 'rightLowerLeg', is3D, e.size);
        }
        return true;
    }
    return false;
}

