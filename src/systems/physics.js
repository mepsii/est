//THIS IS physics.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// --- Cannon.js Physics Integration ---
const cannonWorld = new CANNON.World();
cannonWorld.gravity.set(0, 0, -28); // Stays heavy
cannonWorld.broadphase = new CANNON.SAPBroadphase(cannonWorld); // SAP Broadphase for high numeric stability
cannonWorld.solver.iterations = 25; // Optimized iterations for 180Hz substepping
cannonWorld.allowSleep = true; // Enable sleeping to completely eliminate CPU overhead for resting/parked/flipped vehicles
cannonWorld.defaultContactMaterial.friction = 0.8;
cannonWorld.defaultContactMaterial.restitution = 0.02; // Minimal bounce for realistic landings
cannonWorld.defaultContactMaterial.contactEquationStiffness = 1e7; // Stiffer equations to prevent sinking into voxels
cannonWorld.defaultContactMaterial.contactEquationRelaxation = 3; // Tuned relaxation to prevent voxel seam snagging

// Create low-friction material for the vehicle chassis body so it slides smoothly over voxel obstacles instead of sticking/leaning

function update() {
    if (isPaused || isLoading) return;

    // --- Cannon.js Physics Step ---
    for (let v of vehicles) {
        if (!v.chassisBody) {
            initCannonVehicle(v);
        }
    }
    syncVoxelCollidersAroundVehicles();


    preUpdateVehicles();

    // Use 3 sub-steps per frame (running at 180Hz internally) to prevent tunneling/glitching 
    // through voxels at high speeds, while keeping the external physics step at 60Hz.
    const physicsSubSteps = 3;
    const subStepSize = (1 / 60) / physicsSubSteps;
    for (let i = 0; i < physicsSubSteps; i++) {
        cannonWorld.step(subStepSize);
    }

    // Static vector reuse to prevent garbage collection allocations during physics loops
    if (typeof _tempImpulseVec === 'undefined') {
        window._tempImpulseVec = new CANNON.Vec3(0, 0, 0);
    }

    // Cleanup ragdolls that fall below Z < -20 to prevent memory leaks and physics bugs
    for (let i = activeRagdolls.length - 1; i >= 0; i--) {
        let r = activeRagdolls[i];
        let torso = r.parts ? r.parts.torso : null;
        if (torso && torso.position.z < -20) {
            for (let name in r.parts) {
                if (r.parts[name]) cannonWorld.removeBody(r.parts[name]);
            }
            if (r.parts) {
                let partValues = Object.values(r.parts);
                for (let j = cannonWorld.constraints.length - 1; j >= 0; j--) {
                    let c = cannonWorld.constraints[j];
                    if (partValues.includes(c.bodyA) || partValues.includes(c.bodyB)) {
                        cannonWorld.removeConstraint(c);
                    }
                }
            }
            activeRagdolls.splice(i, 1);
        }
    }

    // Vehicle "Roadkill" hit mechanic: check moving vehicles against living zombies
    if (vehicles.length > 0 && enemies.length > 0) {
        for (let vIdx = 0; vIdx < vehicles.length; vIdx++) {
            let v = vehicles[vIdx];
            if (!v.chassisBody) continue;
            const vVel = v.chassisBody.velocity;
            const vSpeedSq = vVel.x * vVel.x + vVel.y * vVel.y + vVel.z * vVel.z;
            if (vSpeedSq < 1.44) continue; // Minimum speed threshold (~1.2 m/s, ~4.3 km/h)
            const vSpeed = Math.sqrt(vSpeedSq);

            for (let i = enemies.length - 1; i >= 0; i--) {
                let e = enemies[i];
                if (e.type !== 'zombie3d' && e.type !== 'zombie' && e.type !== 'zombie3d_ragdoll') continue;

                let dx = e.x - v.x;
                let dy = e.y - v.y;
                let distSq = dx * dx + dy * dy;

                // Fast squared distance check (2.3m radius = 5.29 sq distance)
                if (distSq < 5.29) {
                    let dz = e.z - v.z;
                    if (Math.abs(dz) < 1.4) {
                        let horizontalDist = Math.sqrt(distSq);
                        let hitAngle = Math.atan2(dy, dx);
                        let normDx = horizontalDist > 0.01 ? dx / horizontalDist : Math.cos(hitAngle);
                        let normDy = horizontalDist > 0.01 ? dy / horizontalDist : Math.sin(hitAngle);

                        // Transfer vehicle momentum + upward impact pop
                        let initVx = vVel.x * 1.1 + normDx * (vSpeed * 0.3 + 1.0);
                        let initVy = vVel.y * 1.1 + normDy * (vSpeed * 0.3 + 1.0);
                        let initVz = Math.max(vVel.z * 1.0 + 2.2, vSpeed * 0.25 + 1.6);

                        // Rebalanced impact damage: zombies take moderate damage so they survive to ragdoll & flail
                        let impactDmg = Math.min(8, Math.max(2, Math.floor(vSpeed * 0.8)));
                        e.hp -= impactDmg;

                        let bCol = getBloodColor(e.type) || { r: 92, g: 64, b: 51 };
                        spawnBlood(e.x, e.y, e.z + (e.size || 1.8) * 0.5, bCol, 6);

                        let isAlive = e.hp > 0;
                        if (!isAlive) {
                            score += 150;
                            if (typeof scoreEl !== 'undefined' && scoreEl) scoreEl.innerText = score;
                        }

                        // Convert zombie into ragdoll with caught momentum
                        spawnCannonRagdoll(
                            e,
                            normDx,
                            normDy,
                            e.z + 0.9,
                            { vx: initVx, vy: initVy, vz: initVz },
                            isAlive,
                            e.hp
                        );

                        // Remove living entity from enemies array
                        enemies.splice(i, 1);
                    }
                }
            }
        }
    }

    // Dragging logic: pull draggingBody toward the player in full 3D
    if (draggingBody) {
        let body = draggingBody;
        
        let parentRagdoll = activeRagdolls.find(r => r.parts && Object.values(r.parts).includes(body));
        if (parentRagdoll) {
            for (let name in parentRagdoll.parts) {
                if (parentRagdoll.parts[name]) {
                    parentRagdoll.parts[name].wakeUp();
                }
            }
        } else {
            body.wakeUp();
        }

        let eyeZ = player.z + (player.inVehicle ? 1.0 : 1.6);
        let lookX = Math.cos(player.angle) * Math.cos(player.pitch);
        let lookY = Math.sin(player.angle) * Math.cos(player.pitch);
        let lookZ = Math.sin(player.pitch);
        
        let tx = player.x + lookX * 2.5;
        let ty = player.y + lookY * 2.5;
        let tz = eyeZ + lookZ * 2.5;
        
        let dx = tx - body.position.x;
        let dy = ty - body.position.y;
        let dz = tz - body.position.z;
        
        let vx = dx * 18;
        let vy = dy * 18;
        let vz = dz * 18;
        
        let maxV = 16.0;
        let vLen = Math.hypot(vx, vy, vz);
        if (vLen > maxV) {
            vx = (vx / vLen) * maxV;
            vy = (vy / vLen) * maxV;
            vz = (vz / vLen) * maxV;
        }
        
        body.velocity.set(vx, vy, vz);
        body.angularVelocity.set(body.angularVelocity.x * 0.9, body.angularVelocity.y * 0.9, body.angularVelocity.z * 0.9);
        
        let dist = Math.hypot(body.position.x - player.x, body.position.y - player.y);
        if (dist > 5.0) {
            draggingBody = null;
        }
    }

    // Vehicle pushing & continuous dragging/scraping damage on active ragdolls
    if (vehicles.length > 0 && activeRagdolls.length > 0) {
        for (let vIdx = 0; vIdx < vehicles.length; vIdx++) {
            let v = vehicles[vIdx];
            if (!v.chassisBody) continue;
            const vVel = v.chassisBody.velocity;
            const vSpeedSq = vVel.x * vVel.x + vVel.y * vVel.y + vVel.z * vVel.z;
            if (vSpeedSq < 0.0025) continue;
            const vSpeed = Math.sqrt(vSpeedSq);
            
            for (let rIdx = 0; rIdx < activeRagdolls.length; rIdx++) {
                let r = activeRagdolls[rIdx];
                let torso = r.parts ? r.parts.torso : null;
                if (!torso) continue;

                let dx = torso.position.x - v.x;
                let dy = torso.position.y - v.y;
                let distSq = dx * dx + dy * dy;

                if (distSq < 5.29) {
                    let dz = torso.position.z - v.z;
                    if (Math.abs(dz) < 1.3) {
                        r.beingPushedTimer = 30; // Reset recovery timer while actively pushed by vehicle

                        for (let name in r.parts) {
                            if (r.parts[name]) r.parts[name].wakeUp();
                        }
                        
                        let pushAngle = Math.atan2(dy, dx);
                        let radialPushX = Math.cos(pushAngle) * 0.4;
                        let radialPushY = Math.sin(pushAngle) * 0.4;
                        
                        for (let name in r.parts) {
                            let body = r.parts[name];
                            if (!body) continue;
                            body.velocity.x = vVel.x * 1.1 + radialPushX;
                            body.velocity.y = vVel.y * 1.1 + radialPushY;
                            body.velocity.z = Math.max(body.velocity.z, vVel.z + 1.2);
                        }

                        // Continuous dragging damage while pushed by vehicle
                        if (r.isAlive && r.hp > 0) {
                            r.dragDamageTimer = (r.dragDamageTimer || 0) + 1;
                            if (r.dragDamageTimer >= 25) { // Rebalanced: 1 damage every 25 ticks (~0.4 sec)
                                r.dragDamageTimer = 0;
                                r.hp -= 1;
                                r.flash = 3;

                                let bCol = getBloodColor(r.type) || { r: 92, g: 64, b: 51 };
                                spawnBlood(torso.position.x, torso.position.y, torso.position.z + 0.3, bCol, 2);

                                if (r.hp <= 0) {
                                    r.hp = 0;
                                    r.isAlive = false;
                                    score += 150;
                                    if (typeof scoreEl !== 'undefined' && scoreEl) scoreEl.innerText = score;
                                    spawnBlood(torso.position.x, torso.position.y, torso.position.z + 0.5, bCol, 15);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Process living ragdoll flailing mechanics & grab-himself-back-up recovery
    for (let i = activeRagdolls.length - 1; i >= 0; i--) {
        let r = activeRagdolls[i];
        let torso = r.parts ? r.parts.torso : null;
        if (!torso) continue;

        if (r.flash && r.flash > 0) r.flash--;

        if (r.isAlive && r.hp > 0) {
            let vx = torso.velocity.x, vy = torso.velocity.y, vz = torso.velocity.z;
            let speedSq = vx * vx + vy * vy + vz * vz;

            // Track recovery timer when not being pushed by vehicle
            if (r.beingPushedTimer && r.beingPushedTimer > 0) {
                r.beingPushedTimer--;
                r.recoveryTimer = 90; // Hold off recovery while under vehicle
            } else if (!r.isGettingUp) {
                if (r.recoveryTimer === undefined) r.recoveryTimer = 90; // ~1.5s total duration
                r.recoveryTimer--;
                if (r.recoveryTimer <= 0) {
                    r.isGettingUp = true;
                    r.getUpTimer = 0;
                }
            }

            // Dynamic limb flailing while alive and not yet in final get-up phase
            if (!r.isGettingUp && (r.recoveryTimer === undefined || r.recoveryTimer > 15)) {
                let t = (tickCounter + (r.flailOffset || 0)) * 0.25;
                let flailStr = 0.4; // Organic limb twitching strength
                
                if (r.parts.leftLowerArm) {
                    _tempImpulseVec.set(Math.sin(t * 1.7) * flailStr, Math.cos(t * 1.3) * flailStr, (Math.sin(t * 2.1) + 0.5) * flailStr);
                    r.parts.leftLowerArm.applyImpulse(_tempImpulseVec, r.parts.leftLowerArm.position);
                }
                if (r.parts.rightLowerArm) {
                    _tempImpulseVec.set(Math.cos(t * 1.5) * flailStr, Math.sin(t * 1.8) * flailStr, (Math.cos(t * 2.3) + 0.5) * flailStr);
                    r.parts.rightLowerArm.applyImpulse(_tempImpulseVec, r.parts.rightLowerArm.position);
                }
                if (r.parts.leftLowerLeg) {
                    _tempImpulseVec.set(Math.cos(t * 2.0) * flailStr * 0.5, Math.sin(t * 1.4) * flailStr * 0.5, Math.sin(t * 2.5) * flailStr * 0.5);
                    r.parts.leftLowerLeg.applyImpulse(_tempImpulseVec, r.parts.leftLowerLeg.position);
                }
                if (r.parts.rightLowerLeg) {
                    _tempImpulseVec.set(Math.sin(t * 1.8) * flailStr * 0.5, Math.cos(t * 1.6) * flailStr * 0.5, Math.cos(t * 2.2) * flailStr * 0.5);
                    r.parts.rightLowerLeg.applyImpulse(_tempImpulseVec, r.parts.rightLowerLeg.position);
                }
            }

            // High-speed asphalt scraping damage
            if (speedSq > 20.25) { // speed > 4.5 m/s
                r.dragDamageTimer = (r.dragDamageTimer || 0) + 1;
                if (r.dragDamageTimer >= 30) {
                    r.dragDamageTimer = 0;
                    r.hp -= 1;
                    r.flash = 2;
                    let bCol = getBloodColor(r.type) || { r: 92, g: 64, b: 51 };
                    spawnBlood(torso.position.x, torso.position.y, torso.position.z + 0.2, bCol, 2);
                    if (r.hp <= 0) {
                        r.hp = 0;
                        r.isAlive = false;
                        score += 150;
                        if (typeof scoreEl !== 'undefined' && scoreEl) scoreEl.innerText = score;
                    }
                }
            }

            // Physical Pose Get-Up Animation: Zombie stops flailing, regains composure, pushes up off ground, and stands upright
            if (r.isGettingUp) {
                r.getUpTimer++;
                let gTime = r.getUpTimer;
                let s = r.scale || (1.8 / 32.0);
                
                // Wake up all parts during get-up
                for (let name in r.parts) {
                    if (r.parts[name]) r.parts[name].wakeUp();
                }

                let facingAngle = Math.atan2(player.y - torso.position.y, player.x - torso.position.x);
                let targetTorsoQuat = new THREE.Quaternion();
                targetTorsoQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), facingAngle);

                // Smoothly slerp torso quaternion to face upright towards player
                let curTorsoQ = new THREE.Quaternion(torso.quaternion.x, torso.quaternion.y, torso.quaternion.z, torso.quaternion.w);
                curTorsoQ.slerp(targetTorsoQuat, 0.12);
                torso.quaternion.set(curTorsoQ.x, curTorsoQ.y, curTorsoQ.z, curTorsoQ.w);
                torso.angularVelocity.set(0, 0, 0);

                // Calculate target floor height & standing torso Z
                let floorZ = Math.max(0, torso.position.z - 1.2);
                if (typeof getSafeFloorZ !== 'undefined') {
                    floorZ = getSafeFloorZ(torso.position.x, torso.position.y, torso.position.z);
                }
                let targetTorsoZ = floorZ + 18.0 * s;

                // Gradually lift torso Z from floor level to standing height over 50 frames
                torso.position.z += (targetTorsoZ - torso.position.z) * 0.12;
                torso.velocity.set(0, 0, 0);

                // Local part offsets relative to torso center in standing pose
                const localOffsets = {
                    head: { x: 0, y: 0, z: 10 },
                    leftUpperArm: { x: -6, y: 0, z: 3 },
                    leftLowerArm: { x: -6, y: 0, z: -3 },
                    rightUpperArm: { x: 6, y: 0, z: 3 },
                    rightLowerArm: { x: 6, y: 0, z: -3 },
                    leftUpperLeg: { x: -2, y: 0, z: -9 },
                    leftLowerLeg: { x: -2, y: 0, z: -15 },
                    rightUpperLeg: { x: 2, y: 0, z: -9 },
                    rightLowerLeg: { x: 2, y: 0, z: -15 }
                };

                // Pose interpolation rate increases as zombie regains composure
                let poseRate = Math.min(0.35, 0.05 + (gTime / 50.0) * 0.3);

                for (let name in localOffsets) {
                    let b = r.parts[name];
                    if (!b) continue;

                    let off = localOffsets[name];
                    let lx = off.x * s;
                    let ly = off.y * s;
                    let lz = off.z * s;

                    // Ground push phase (Frames 1-20): Arms project downwards towards ground to simulate pushing off floor
                    if (gTime <= 20 && (name === 'leftLowerArm' || name === 'rightLowerArm')) {
                        lz -= 4.0 * s;
                        ly += 2.0 * s;
                    }
                    // Knee extension phase (Frames 15-35): Legs extend downwards to floor
                    if (gTime >= 15 && gTime <= 35 && (name === 'leftLowerLeg' || name === 'rightLowerLeg')) {
                        lz -= 2.0 * s;
                    }

                    // Rotate local offset by current torso orientation
                    let offsetVec = new THREE.Vector3(lx, ly, lz);
                    offsetVec.applyQuaternion(curTorsoQ);

                    let targetX = torso.position.x + offsetVec.x;
                    let targetY = torso.position.y + offsetVec.y;
                    let targetZ = torso.position.z + offsetVec.z;

                    // Smoothly slerp part position & quaternion into standing pose
                    b.position.x += (targetX - b.position.x) * poseRate;
                    b.position.y += (targetY - b.position.y) * poseRate;
                    b.position.z += (targetZ - b.position.z) * poseRate;
                    b.velocity.set(0, 0, 0);

                    let curPartQ = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
                    curPartQ.slerp(curTorsoQ, poseRate);
                    b.quaternion.set(curPartQ.x, curPartQ.y, curPartQ.z, curPartQ.w);
                    b.angularVelocity.set(0, 0, 0);
                }

                // Seamless hand-off to standing walking zombie after 55 frames (~0.92s of live physical get-up pose)
                if (r.getUpTimer >= 55) {
                    let getUpX = torso.position.x;
                    let getUpY = torso.position.y;
                    let feetZ = torso.position.z - 18.0 * s;

                    for (let name in r.parts) {
                        if (r.parts[name]) cannonWorld.removeBody(r.parts[name]);
                    }
                    if (r.parts) {
                        let partValues = Object.values(r.parts);
                        for (let j = cannonWorld.constraints.length - 1; j >= 0; j--) {
                            let c = cannonWorld.constraints[j];
                            if (partValues.includes(c.bodyA) || partValues.includes(c.bodyB)) {
                                cannonWorld.removeConstraint(c);
                            }
                        }
                    }

                    activeRagdolls.splice(i, 1);

                    enemies.push({
                        type: r.type || 'zombie3d',
                        isSuperZombie: !!r.isSuperZombie,
                        x: getUpX,
                        y: getUpY,
                        z: feetZ,
                        angle: facingAngle,
                        hp: r.hp,
                        maxHp: r.maxHp || 15,
                        cooldown: 30,
                        size: s * 32.0,
                        flash: 0,
                        hasHead: r.hasHead,
                        hasLeftUpperArm: r.hasLeftUpperArm,
                        hasLeftLowerArm: r.hasLeftLowerArm,
                        hasRightUpperArm: r.hasRightUpperArm,
                        hasRightLowerArm: r.hasRightLowerArm,
                        hasLeftUpperLeg: r.hasLeftUpperLeg,
                        hasLeftLowerLeg: r.hasLeftLowerLeg,
                        hasRightUpperLeg: r.hasRightUpperLeg,
                        hasRightLowerLeg: r.hasRightLowerLeg,
                        limbsHP: r.limbsHP
                    });
                }
            }
        }
    }

    postUpdateVehicles();
    updatePlayer();
    updateEntities();
    updateProjectiles();
    updateParticles();

    gameTime += (24 / 54000) * timeSpeed; if (gameTime >= 24) gameTime %= 24; 
    if (isDebugOpen && tickCounter % 10 === 0) { dbgTimeEl.value = gameTime; dbgTimeValEl.innerText = gameTime.toFixed(1); }
    if (timeValEl) {
        let hours = Math.floor(gameTime);
        let minutes = Math.floor((gameTime - hours) * 60);
        timeValEl.innerText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }


    for(let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].z += 0.02; damageTexts[i].life--; if(damageTexts[i].life <= 0) damageTexts.splice(i, 1); }
    if (player.muzzleFlashTick > 0) player.muzzleFlashTick--;
    if (player.pistolSmokeTimer > 0) player.pistolSmokeTimer--;
}

function spawnCannonRagdoll(e, dx, dy, hitZ, initialVel = null, isAlive = false, hp = null) {
    const scale = (e.size || 1.8) / 32.0;
    const rotAngle = (e.angle || 0) - Math.PI / 2;
    const cosH = Math.cos(rotAngle);
    const sinH = Math.sin(rotAngle);
    
    let initVx = 0, initVy = 0, initVz = 3.0;
    if (initialVel) {
        initVx = initialVel.vx;
        initVy = initialVel.vy;
        initVz = initialVel.vz;
    } else {
        let fx = dx || 0;
        let fy = dy || 0;
        let len = Math.hypot(fx, fy);
        if (len > 0) {
            fx /= len;
            fy /= len;
        }
        const hitForce = 7.0; 
        initVx = fx * hitForce;
        initVy = fy * hitForce;
    }
    
    const parts = {};
    
    function addPart(name, lx, ly, lz, w, d, h, mass, color, active) {
        if (!active) return null;
        
        let sx = lx * scale;
        let sy = ly * scale;
        let sz = lz * scale;
        let wx = sx * cosH - sy * sinH;
        let wy = sx * sinH + sy * cosH;
        let wz = sz;
        
        const body = new CANNON.Body({
            mass: mass,
            position: new CANNON.Vec3(e.x + wx, e.y + wy, e.z + wz),
            linearDamping: 0.1,
            angularDamping: 0.1
        });
        
        const shape = new CANNON.Box(new CANNON.Vec3((w * scale) / 2, (d * scale) / 2, (h * scale) / 2));
        body.addShape(shape);
        
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), rotAngle);
        
        let spinStr = initialVel ? 6.0 : 2.0;
        body.velocity.set(
            initVx + (Math.random() - 0.5) * 0.5,
            initVy + (Math.random() - 0.5) * 0.5,
            initVz + (Math.random() - 0.5) * 0.5
        );
        body.angularVelocity.set(
            (Math.random() - 0.5) * spinStr,
            (Math.random() - 0.5) * spinStr,
            (Math.random() - 0.5) * spinStr
        );
        
        body.partName = name;
        body.partColor = color;
        body.partWidth = w;
        body.partDepth = d;
        body.partHeight = h;
        body.scale = scale;
        
        cannonWorld.addBody(body);
        parts[name] = body;
        return body;
    }
    
    const torsoColor = e.isSuperZombie ? { r: 180, g: 30, b: 30 } : { r: 60, g: 156, b: 156 };
    const torso = addPart('torso', 0, 0, 18, 8, 4, 12, 2.0, torsoColor, true);
    const head = addPart('head', 0, 0, 28, 8, 8, 8, 0.6, { r: 90, g: 140, b: 90 }, e.hasHead !== false);
    const leftUpperArm = addPart('leftUpperArm', -6, 0, 21, 4, 4, 6, 0.4, { r: 90, g: 140, b: 90 }, e.hasLeftUpperArm !== false);
    const leftLowerArm = addPart('leftLowerArm', -6, 0, 15, 4, 4, 6, 0.3, { r: 90, g: 140, b: 90 }, e.hasLeftLowerArm !== false);
    const rightUpperArm = addPart('rightUpperArm', 6, 0, 21, 4, 4, 6, 0.4, { r: 90, g: 140, b: 90 }, e.hasRightUpperArm !== false);
    const rightLowerArm = addPart('rightLowerArm', 6, 0, 15, 4, 4, 6, 0.3, { r: 90, g: 140, b: 90 }, e.hasRightLowerArm !== false);
    const leftUpperLeg = addPart('leftUpperLeg', -2, 0, 9, 4, 4, 6, 0.4, { r: 64, g: 64, b: 144 }, e.hasLeftUpperLeg !== false);
    const leftLowerLeg = addPart('leftLowerLeg', -2, 0, 3, 4, 4, 6, 0.3, { r: 64, g: 64, b: 144 }, e.hasLeftLowerLeg !== false);
    const rightUpperLeg = addPart('rightUpperLeg', 2, 0, 9, 4, 4, 6, 0.4, { r: 64, g: 64, b: 144 }, e.hasRightUpperLeg !== false);
    const rightLowerLeg = addPart('rightLowerLeg', 2, 0, 3, 4, 4, 6, 0.3, { r: 64, g: 64, b: 144 }, e.hasRightLowerLeg !== false);
    
    function addJoint(bodyA, pivotA, bodyB, pivotB) {
        if (!bodyA || !bodyB) return;
        const c = new CANNON.PointToPointConstraint(
            bodyA, 
            new CANNON.Vec3(pivotA.x * scale, pivotA.y * scale, pivotA.z * scale), 
            bodyB, 
            new CANNON.Vec3(pivotB.x * scale, pivotB.y * scale, pivotB.z * scale)
        );
        c.collideConnected = false;
        cannonWorld.addConstraint(c);
    }
    
    addJoint(torso, { x: 0, y: 0, z: 6 }, head, { x: 0, y: 0, z: -4 });
    addJoint(torso, { x: -6, y: 0, z: 6 }, leftUpperArm, { x: 0, y: 0, z: 3 });
    addJoint(torso, { x: 6, y: 0, z: 6 }, rightUpperArm, { x: 0, y: 0, z: 3 });
    addJoint(leftUpperArm, { x: 0, y: 0, z: -3 }, leftLowerArm, { x: 0, y: 0, z: 3 });
    addJoint(rightUpperArm, { x: 0, y: 0, z: -3 }, rightLowerArm, { x: 0, y: 0, z: 3 });
    addJoint(torso, { x: -2, y: 0, z: -6 }, leftUpperLeg, { x: 0, y: 0, z: 3 });
    addJoint(torso, { x: 2, y: 0, z: -6 }, rightUpperLeg, { x: 0, y: 0, z: 3 });
    addJoint(leftUpperLeg, { x: 0, y: 0, z: -3 }, leftLowerLeg, { x: 0, y: 0, z: 3 });
    addJoint(rightUpperLeg, { x: 0, y: 0, z: -3 }, rightLowerLeg, { x: 0, y: 0, z: 3 });
    
    const ragdollObj = {
        parts: parts,
        scale: scale,
        isAlive: !!isAlive,
        isSuperZombie: !!e.isSuperZombie,
        hp: hp !== null ? hp : (e.hp !== undefined ? e.hp : (e.isSuperZombie ? 1500 : 15)),
        maxHp: e.maxHp || (e.isSuperZombie ? 1500 : 15),
        type: e.type || 'zombie3d',
        hasHead: e.hasHead !== false,
        hasLeftUpperArm: e.hasLeftUpperArm !== false,
        hasLeftLowerArm: e.hasLeftLowerArm !== false,
        hasRightUpperArm: e.hasRightUpperArm !== false,
        hasRightLowerArm: e.hasRightLowerArm !== false,
        hasLeftUpperLeg: e.hasLeftUpperLeg !== false,
        hasLeftLowerLeg: e.hasLeftLowerLeg !== false,
        hasRightUpperLeg: e.hasRightUpperLeg !== false,
        hasRightLowerLeg: e.hasRightLowerLeg !== false,
        limbsHP: e.limbsHP,
        settleTimer: 0,
        dragDamageTimer: 0,
        isGettingUp: false,
        getUpTimer: 0,
        flailOffset: Math.random() * 100
    };

    activeRagdolls.push(ragdollObj);
    return ragdollObj;
}

