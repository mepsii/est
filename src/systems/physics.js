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

    // Cleanup ragdolls that fall below Z < -20 to prevent memory leaks and physics bugs
    for (let i = activeRagdolls.length - 1; i >= 0; i--) {
        let r = activeRagdolls[i];
        let torso = r.parts.torso;
        if (torso && torso.position.z < -20) {
            for (let name in r.parts) {
                cannonWorld.removeBody(r.parts[name]);
            }
            for (let c of [...cannonWorld.constraints]) {
                if (Object.values(r.parts).includes(c.bodyA) || Object.values(r.parts).includes(c.bodyB)) {
                    cannonWorld.removeConstraint(c);
                }
            }
            activeRagdolls.splice(i, 1);
        }
    }

    // Dragging logic: pull draggingBody toward the player in full 3D
    if (draggingBody) {
        let body = draggingBody;
        
        // Find the ragdoll object to wake up all its parts
        let parentRagdoll = activeRagdolls.find(r => Object.values(r.parts).includes(body));
        if (parentRagdoll) {
            for (let name in parentRagdoll.parts) {
                if (parentRagdoll.parts[name]) {
                    parentRagdoll.parts[name].wakeUp();
                }
            }
        } else {
            body.wakeUp();
        }

        // Target position: 2.5 units in front of player's eye level, following look angles
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
        
        // Snappier pull
        let vx = dx * 18;
        let vy = dy * 18;
        let vz = dz * 18;
        
        // Clamp maximum velocity to avoid extreme speeds
        let maxV = 16.0;
        let vLen = Math.hypot(vx, vy, vz);
        if (vLen > maxV) {
            vx = (vx / vLen) * maxV;
            vy = (vy / vLen) * maxV;
            vz = (vz / vLen) * maxV;
        }
        
        body.velocity.set(vx, vy, vz);
        body.angularVelocity.set(body.angularVelocity.x * 0.9, body.angularVelocity.y * 0.9, body.angularVelocity.z * 0.9);
        
        // Auto-release if too far
        let dist = Math.hypot(body.position.x - player.x, body.position.y - player.y);
        if (dist > 5.0) {
            draggingBody = null;
        }
    }

    // Vehicle pushing: manually collide moving vehicles with ragdoll parts
    for (let v of vehicles) {
        if (!v.chassisBody) continue;
        const vVel = v.chassisBody.velocity;
        const vSpeed = vVel.norm();
        if (vSpeed < 0.05) continue;
        
        for (let r of activeRagdolls) {
            for (let name in r.parts) {
                let body = r.parts[name];
                if (!body) continue;
                let dx = body.position.x - v.x;
                let dy = body.position.y - v.y;
                let dz = body.position.z - v.z;
                let dist = Math.hypot(dx, dy);
                if (dist < 2.2 && Math.abs(dz) < 1.2) {
                    body.wakeUp();
                    let pushAngle = Math.atan2(dy, dx);
                    let radialPushX = Math.cos(pushAngle) * 0.4;
                    let radialPushY = Math.sin(pushAngle) * 0.4;
                    
                    body.velocity.x = vVel.x * 1.1 + radialPushX;
                    body.velocity.y = vVel.y * 1.1 + radialPushY;
                    body.velocity.z = Math.max(body.velocity.z, vVel.z + 1.2);
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

function spawnCannonRagdoll(e, dx, dy, hitZ) {
    const scale = e.size / 32.0;
    const rotAngle = e.angle - Math.PI / 2;
    const cosH = Math.cos(rotAngle);
    const sinH = Math.sin(rotAngle);
    
    // Calculate direction of shot/hit for impulse
    let fx = dx || 0;
    let fy = dy || 0;
    let len = Math.hypot(fx, fy);
    if (len > 0) {
        fx /= len;
        fy /= len;
    }
    // Base force of the hit
    const hitForce = 7.0; 
    const initVx = fx * hitForce;
    const initVy = fy * hitForce;
    const initVz = 3.0; // small pop upwards
    
    const parts = {};
    
    // Function to create a part body
    function addPart(name, lx, ly, lz, w, d, h, mass, color, active) {
        if (!active) return null;
        
        // Calculate initial world position
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
        
        // Rotate body to match zombie orientation
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), rotAngle);
        
        // Apply initial velocity/impulse
        body.velocity.set(initVx, initVy, initVz);
        
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
    
    // Create bodies
    // Torso: center at (0, 0, 18), size 8x4x12
    const torso = addPart('torso', 0, 0, 18, 8, 4, 12, 2.0, { r: 60, g: 156, b: 156 }, true);
    
    // Head: center at (0, 0, 28), size 8x8x8
    const head = addPart('head', 0, 0, 28, 8, 8, 8, 0.6, { r: 90, g: 140, b: 90 }, e.hasHead !== false);
    
    // Left Upper Arm: center at (-6, 0, 21), size 4x4x6
    const leftUpperArm = addPart('leftUpperArm', -6, 0, 21, 4, 4, 6, 0.4, { r: 90, g: 140, b: 90 }, e.hasLeftUpperArm !== false);
    
    // Left Lower Arm: center at (-6, 0, 15), size 4x4x6
    const leftLowerArm = addPart('leftLowerArm', -6, 0, 15, 4, 4, 6, 0.3, { r: 90, g: 140, b: 90 }, e.hasLeftLowerArm !== false);
    
    // Right Upper Arm: center at (6, 0, 21), size 4x4x6
    const rightUpperArm = addPart('rightUpperArm', 6, 0, 21, 4, 4, 6, 0.4, { r: 90, g: 140, b: 90 }, e.hasRightUpperArm !== false);
    
    // Right Lower Arm: center at (6, 0, 15), size 4x4x6
    const rightLowerArm = addPart('rightLowerArm', 6, 0, 15, 4, 4, 6, 0.3, { r: 90, g: 140, b: 90 }, e.hasRightLowerArm !== false);
    
    // Left Upper Leg: center at (-2, 0, 9), size 4x4x6
    const leftUpperLeg = addPart('leftUpperLeg', -2, 0, 9, 4, 4, 6, 0.4, { r: 64, g: 64, b: 144 }, e.hasLeftUpperLeg !== false);
    
    // Left Lower Leg: center at (-2, 0, 3), size 4x4x6
    const leftLowerLeg = addPart('leftLowerLeg', -2, 0, 3, 4, 4, 6, 0.3, { r: 64, g: 64, b: 144 }, e.hasLeftLowerLeg !== false);
    
    // Right Upper Leg: center at (2, 0, 9), size 4x4x6
    const rightUpperLeg = addPart('rightUpperLeg', 2, 0, 9, 4, 4, 6, 0.4, { r: 64, g: 64, b: 144 }, e.hasRightUpperLeg !== false);
    
    // Right Lower Leg: center at (2, 0, 3), size 4x4x6
    const rightLowerLeg = addPart('rightLowerLeg', 2, 0, 3, 4, 4, 6, 0.3, { r: 64, g: 64, b: 144 }, e.hasRightLowerLeg !== false);
    
    // Helper to add constraint with collideConnected = false
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
    
    // Connect Head to Torso
    addJoint(torso, { x: 0, y: 0, z: 6 }, head, { x: 0, y: 0, z: -4 });
    
    // Connect Arms to Torso
    addJoint(torso, { x: -6, y: 0, z: 6 }, leftUpperArm, { x: 0, y: 0, z: 3 });
    addJoint(torso, { x: 6, y: 0, z: 6 }, rightUpperArm, { x: 0, y: 0, z: 3 });
    
    // Connect Elbows
    addJoint(leftUpperArm, { x: 0, y: 0, z: -3 }, leftLowerArm, { x: 0, y: 0, z: 3 });
    addJoint(rightUpperArm, { x: 0, y: 0, z: -3 }, rightLowerArm, { x: 0, y: 0, z: 3 });
    
    // Connect Legs to Torso
    addJoint(torso, { x: -2, y: 0, z: -6 }, leftUpperLeg, { x: 0, y: 0, z: 3 });
    addJoint(torso, { x: 2, y: 0, z: -6 }, rightUpperLeg, { x: 0, y: 0, z: 3 });
    
    // Connect Knees
    addJoint(leftUpperLeg, { x: 0, y: 0, z: -3 }, leftLowerLeg, { x: 0, y: 0, z: 3 });
    addJoint(rightUpperLeg, { x: 0, y: 0, z: -3 }, rightLowerLeg, { x: 0, y: 0, z: 3 });
    
    // Store in active ragdolls array
    activeRagdolls.push({
        parts: parts,
        scale: scale
    });
}
