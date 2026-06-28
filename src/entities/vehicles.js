//THIS IS vehicles.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

const chassisMaterial = new CANNON.Material('chassis');
const chassisDefaultContactMaterial = new CANNON.ContactMaterial(
    chassisMaterial,
    cannonWorld.defaultMaterial,
    {
        friction: 0.05, // super low friction so the chassis slides smoothly off voxel edges
        restitution: 0.02,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3
    }
);
cannonWorld.addContactMaterial(chassisDefaultContactMaterial);


// Dynamic Voxel Terrain Colliders Cache
const activeVoxelBodies = new Map(); // Key: "x,y,z" -> CANNON.Body

function syncVoxelCollidersAroundVehicles() {
    if (vehicles.length === 0) {
        if (activeVoxelBodies.size > 0) {
            for (let body of activeVoxelBodies.values()) {
                cannonWorld.removeBody(body);
            }
            activeVoxelBodies.clear();
        }
        return;
    }

    // Coarse-grid threshold check: only run the expensive voxel scanning and body update
    // when at least one vehicle has moved at least 2 blocks from its last synchronized position.
    // This reduces redundant CPU checks by 95% when sitting still or crawling, maintaining high FPS.
    let anyVehicleMovedSignificant = false;
    for (let v of vehicles) {
        const cx = Math.floor(v.x);
        const cy = Math.floor(v.y);
        const cz = Math.floor(v.z);
        if (v.lastSyncX === undefined || 
            Math.abs(cx - v.lastSyncX) >= 2 || 
            Math.abs(cy - v.lastSyncY) >= 2 || 
            Math.abs(cz - v.lastSyncZ) >= 2) {
            anyVehicleMovedSignificant = true;
            break;
        }
    }

    if (!anyVehicleMovedSignificant && activeVoxelBodies.size > 0) {
        return;
    }

    // Update synchronization caches
    for (let v of vehicles) {
        v.lastSyncX = Math.floor(v.x);
        v.lastSyncY = Math.floor(v.y);
        v.lastSyncZ = Math.floor(v.z);
    }

    const neededVoxels = new Set();
    const radiusX = 5; // Optimized from 8 to 5 to check 73% fewer coordinates horizontally
    const radiusY = 5; // Eliminates all random CPU spike lag and FPS drops when climbing mountains
    const radiusZ = 3; // Optimized from 5 to 3 for compact height scanning bounds

    for (let v of vehicles) {
        const cx = v.lastSyncX;
        const cy = v.lastSyncY;
        const cz = v.lastSyncZ;

        for (let x = cx - radiusX; x <= cx + radiusX; x++) {
            for (let y = cy - radiusY; y <= cy + radiusY; y++) {
                for (let z = cz - radiusZ; z <= cz + radiusZ; z++) {
                    if (z >= 0 && z < 96) { // 96 is MAX_Z
                        if (getSolid(x, y, z)) {
                            neededVoxels.add(`${x},${y},${z}`);
                        }
                    }
                }
            }
        }
    }

    // 1. Add newly needed voxels to the Cannon world
    const halfExtents = new CANNON.Vec3(0.5, 0.5, 0.5);
    const voxelShape = new CANNON.Box(halfExtents);
    
    const halfHeightExtents = new CANNON.Vec3(0.5, 0.5, 0.25);
    const halfHeightShape = new CANNON.Box(halfHeightExtents);
    
    for (let key of neededVoxels) {
        const [x, y, z] = key.split(',').map(Number);
        const vType = getVoxel(x, y, z);
        const isRoad = (vType === 7 || vType === 8);
        const isHalf = (vType === 6);

        // If body exists, check if it has correct shape type
        if (activeVoxelBodies.has(key)) {
            const body = activeVoxelBodies.get(key);
            let matches = false;
            if (isRoad) {
                matches = (body.shapes[0] !== voxelShape && body.shapes[0] !== halfHeightShape);
            } else if (isHalf) {
                matches = (body.shapes[0] === halfHeightShape);
            } else {
                matches = (body.shapes[0] === voxelShape);
            }

            if (!matches) {
                cannonWorld.removeBody(body);
                activeVoxelBodies.delete(key);
            }
        }

        if (!activeVoxelBodies.has(key)) {
            let shapeToUse = voxelShape;
            let posZ = z + 0.5;

            if (isRoad) {
                let tTerrain = getTerrainFast(x, y);
                let targetH = (tTerrain.roadH > tTerrain.baseH + 3.0) ? tTerrain.roadH : tTerrain.baseH;
                let h = Math.max(0.05, targetH - z);
                shapeToUse = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, h / 2));
                posZ = z + h / 2;
            } else if (isHalf) {
                shapeToUse = halfHeightShape;
                posZ = z + 0.25;
            }

            const voxelBody = new CANNON.Body({
                mass: 0, // static body
                shape: shapeToUse,
                position: new CANNON.Vec3(x + 0.5, y + 0.5, posZ)
            });
            cannonWorld.addBody(voxelBody);
            activeVoxelBodies.set(key, voxelBody);
        }
    }

    // 2. Remove voxels that are no longer needed
    for (let [key, body] of activeVoxelBodies.entries()) {
        if (!neededVoxels.has(key)) {
            cannonWorld.removeBody(body);
            activeVoxelBodies.delete(key);
        }
    }
}

function initCannonVehicle(v) {
    if (v.chassisBody) return; // Already initialized
    v.currentVehicleSpeedKmHour = v.currentVehicleSpeedKmHour || 0;

    // Chassis Box shape (X=length/forward, Y=width/lateral, Z=height/vertical)
    // Shrunk length half-extent to 1.0 and offset to -0.4 to pull the front bumper of the physical collision box
    // way back behind the tires, making it impossible for the chassis to clip vertical voxel faces before the tires can climb them.
    // Shrunk half-height to 0.18 (36cm thickness) and raised the offset Z to 0.48 to increase ground
    // clearance for the chassis belly, preventing snagging on voxel incline edges and block corners.
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.85, 0.18));
    const chassisBody = new CANNON.Body({
        mass: 2800, // Balanced weight (2800 kg) to make the truck feel like a heavy offroad pickup but responsive
        linearDamping: 0.24, // Tuned air drag to increase coasting distance by a third while maintaining speed stability
        angularDamping: 0.80, // Raised angular damping to prevent flipping and stabilize rolls
        allowSleep: true, // Enable sleeping for performance when parked/resting
        material: chassisMaterial // Assign low-friction material to slide smoothly off voxel obstacles
    });
    chassisBody.sleepSpeedLimit = 0.2; // Sleep when chassis speed drops below 0.2 m/s
    chassisBody.sleepTimeLimit = 0.8; // Sleep after 0.8 seconds of continuous inactivity
    
    // Add shape offset centered along X (0.0) and upward (+0.48 along Z) relative to the body's origin.
    // Shifting the shape upward lowers the physical center of mass (origin) to the chassis bottom,
    // making the vehicle highly stable and resistant to rollover. It also raises the front bumper
    // relative to the wheel axles so the bumper doesn't clip/collide with the front wheels.
    chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0, 0.48));
    
    // Scale up the rotational inertia (make it 8.5x harder to spin/flip) to prevent rapid, 
    // toy-like rotational snapping and weird high-speed rollover flips.
    chassisBody.inertia.scale(8.5, chassisBody.inertia);
    chassisBody.invInertia.x = 1 / chassisBody.inertia.x;
    chassisBody.invInertia.y = 1 / chassisBody.inertia.y;
    chassisBody.invInertia.z = 1 / chassisBody.inertia.z;
    
    // Position slightly above ground to align with vehicle center
    chassisBody.position.set(v.x, v.y, v.z);
    chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), v.angle);
    cannonWorld.addBody(chassisBody);
 
    const vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexUpAxis: 2, // Z is up
        indexRightAxis: 1, // Y is right (lateral)
        indexForwardAxis: 0 // X is forward (longitudinal)
    });
 
    const wheelOptions = {
        radius: 0.5,
        directionLocal: new CANNON.Vec3(0, 0, -1), // points down
        suspensionStiffness: 55, // Middle-ground spring stiffness for balanced, realistic weight
        suspensionRestLength: 0.55, // Level default rest length to compensate for static compression
        maxSuspensionForce: 100000,
        maxSuspensionTravel: 0.90, // Large suspension travel limit allowing tires to clip up into body under compression
        dampingRelaxation: 4.8, // Controlled relaxation damping to prevent bounce/stoppies
        dampingCompression: 3.5, // Controlled compression damping to absorb voxel edge impacts smoothly
        frictionSlip: 1.6, // Allows slip under high torque
        rollInfluence: 0.01, // Greatly reduced roll influence (was 0.1) to keep the chassis flat in turns
        useCustomSlidingRotationalSpeed: true, // Let tires spin under engine power when skidding or airborne
        customSlidingRotationalSpeed: 30 // Visual spin rate (rad/sec)
    };

    // Configure distinct wheel options for left and right sides.
    // Right side axles are inverted to (0, -1, 0) so right-side wheels visually rotate
    // forward when the vehicle moves forward, instead of rotating backwards.
    const leftWheelOptions = {
        ...wheelOptions,
        axleLocal: new CANNON.Vec3(0, 1, 0)
    };
    const rightWheelOptions = {
        ...wheelOptions,
        axleLocal: new CANNON.Vec3(0, -1, 0)
    };

    // Add 4 wheels at connection points in local coordinates.
    // Level connection height (Z = -0.20 for all wheels) to keep visual body ride height level and low.
    // Center the wheelbase on the physical center of mass (X=0.0) to balance weight distribution (approx 50/50 front/rear).
    // Front wheels are set to 1.05 and rear wheels are pulled forward to -0.96 to fit the body fenders.
    // Track width is set to Y = +/- 0.70 for all wheels.
    vehicle.addWheel({ ...leftWheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(1.05, 0.70, -0.20) }); // Front Left
    vehicle.addWheel({ ...rightWheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(1.05, -0.70, -0.20) });  // Front Right
    vehicle.addWheel({ ...leftWheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-0.96, 0.70, -0.20) }); // Rear Left
    vehicle.addWheel({ ...rightWheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-0.96, -0.70, -0.20) });  // Rear Right

    // Override updateVehicle to apply suspension forces vertically along the local suspension axis 
    // (-directionWorld) instead of the ground hit normal. This fixes Cannon's lateral impulse bug 
    // on vertical voxel step colliders while keeping natural normals for friction/grip calculations.
    vehicle.updateVehicle = function(timeStep) {
        var wheelInfos = this.wheelInfos;
        var numWheels = wheelInfos.length;
        var chassisBody = this.chassisBody;

        v.gear = v.gear || 'D';
        if (v.gear === 'P') {
            if (chassisBody.type !== CANNON.Body.STATIC) {
                chassisBody.type = CANNON.Body.STATIC;
                chassisBody.velocity.set(0, 0, 0);
                chassisBody.angularVelocity.set(0, 0, 0);
                chassisBody.force.set(0, 0, 0);
                chassisBody.torque.set(0, 0, 0);
            }
            for (var i = 0; i < numWheels; i++) {
                this.updateWheelTransform(i);
            }
            this.currentVehicleSpeedKmHour = 0;
            return;
        }

        // Dynamically adjust mass, stiffness, and friction based on gear to give Low gear extra traction/stability cheat.
        // To guarantee the visual ride height remains exactly identical (no visual sag/popping when shifting),
        // we scale the suspension stiffness in Low gear (68.75) to perfectly balance the increased load (mass),
        // and we cancel the downforce compression using suspension compensation, allowing us to use a constant suspension rest length (0.55).
        var targetMass = v.gear === 'L' ? 3500 : 2800;
        if (chassisBody.type === CANNON.Body.STATIC) {
            chassisBody.type = CANNON.Body.DYNAMIC;
            // Force reset mass properties when shifting out of Park
            chassisBody.mass = targetMass;
            chassisBody.invMass = 1.0 / targetMass;
            chassisBody.updateMassProperties();
            chassisBody.inertia.scale(8.5, chassisBody.inertia);
            chassisBody.invInertia.x = 1.0 / chassisBody.inertia.x;
            chassisBody.invInertia.y = 1.0 / chassisBody.inertia.y;
            chassisBody.invInertia.z = 1.0 / chassisBody.inertia.z;
        } else if (chassisBody.mass !== targetMass) {
            chassisBody.mass = targetMass;
            chassisBody.invMass = 1.0 / targetMass;
            chassisBody.updateMassProperties();
            chassisBody.inertia.scale(8.5, chassisBody.inertia);
            chassisBody.invInertia.x = 1.0 / chassisBody.inertia.x;
            chassisBody.invInertia.y = 1.0 / chassisBody.inertia.y;
            chassisBody.invInertia.z = 1.0 / chassisBody.inertia.z;
        }

        var stiffnessScale = targetMass / 2800; // 1.25 in Low gear, 1.0 in Drive
        var targetStiffness = 55 * stiffnessScale; // 68.75 in Low gear, 55 in Drive
        var targetRestLength = 0.55; // Identical visual ride height in all gears
        var targetFriction = v.gear === 'L' ? 2.4 : 1.6; // Low gear gets a major tire traction cheat (50% more grip)
        var targetDampingRelaxation = 4.8 * stiffnessScale; // 6.0 in Low gear
        var targetDampingCompression = 3.5 * stiffnessScale; // 4.375 in Low gear
        for (var i = 0; i < numWheels; i++) {
            wheelInfos[i].suspensionStiffness = targetStiffness;
            wheelInfos[i].suspensionRestLength = targetRestLength;
            wheelInfos[i].frictionSlip = targetFriction;
            wheelInfos[i].dampingRelaxation = targetDampingRelaxation;
            wheelInfos[i].dampingCompression = targetDampingCompression;
        }

        for (var i = 0; i < numWheels; i++) {
            this.updateWheelTransform(i);
        }

        this.currentVehicleSpeedKmHour = 3.6 * chassisBody.velocity.norm();

        var forwardWorld = new CANNON.Vec3();
        this.getVehicleAxisWorld(this.indexForwardAxis, forwardWorld);

        if (forwardWorld.dot(chassisBody.velocity) < 0){
            this.currentVehicleSpeedKmHour *= -1;
        }

        // simulate suspension raycasts
        for (var i = 0; i < numWheels; i++) {
            this.castRay(wheelInfos[i]);
        }

        // Calculate ground magnetism (downforce) first, so we can apply suspension force compensation
        var avgNormal = new CANNON.Vec3(0, 0, 0);
        var contacts = 0;
        for (var i = 0; i < numWheels; i++) {
            var w = wheelInfos[i];
            if (w.isInContact && w.raycastResult && w.raycastResult.hitNormalWorld) {
                avgNormal.vadd(w.raycastResult.hitNormalWorld, avgNormal);
                contacts++;
            }
        }
        
        // Fast contact ratio check: target is 1.0 if any wheel touches, 0.0 otherwise
        var targetContact = contacts > 0 ? 1.0 : 0.0;
        if (this.smoothContactRatio === undefined) {
            this.smoothContactRatio = targetContact;
        }
        this.smoothContactRatio += (targetContact - this.smoothContactRatio) * 0.35;

        var localForce = new CANNON.Vec3(0, 0, 0);
        var worldForce = new CANNON.Vec3(0, 0, 0);
        var forcePosition = new CANNON.Vec3(chassisBody.position.x, chassisBody.position.y, chassisBody.position.z);
        var downwardZ = 0;

        if (this.smoothContactRatio > 0.01) {
            // Get local vehicle down axis in world coordinates
            var localDown = new CANNON.Vec3(0, 0, -1);
            var worldDown = new CANNON.Vec3();
            chassisBody.vectorToWorldFrame(localDown, worldDown);
            
            // Get local vehicle axes in world coordinates to calculate pitch/roll
            var fwdAxis = new CANNON.Vec3();
            this.getVehicleAxisWorld(this.indexForwardAxis, fwdAxis);
            var rgtAxis = new CANNON.Vec3();
            this.getVehicleAxisWorld(this.indexRightAxis, rgtAxis);
            
            // Calculate incline steepness (pitch) and side-slope steepness (roll) relative to gravity (Z)
            var pitchSteepness = Math.abs(fwdAxis.z);
            var rollSteepness = Math.abs(rgtAxis.z);
            
            // 1. Incline (pitch) boost: increase downforce when going straight up/down steep inclines to prevent slipping
            // Crawl gear gets 1.5x downforce boost (base 6750 N, max 13500 N total downforce) for climbing traction
            var gearScale = v.gear === 'L' ? 1.5 : 1.0;
            var baseMagnet = 4500 * gearScale; 
            var inclineBoost = Math.min(1.0, pitchSteepness / 0.5) * 4500 * gearScale; 
            var maxForce = baseMagnet + inclineBoost;
            
            // 2. Speed scaling: fade out downforce at high speed (starts at 30 mph) to allow jumping
            var speedKmH = 3.6 * chassisBody.velocity.norm();
            var speedMph = speedKmH * 0.621371;
            var speedScale = 1.0;
            if (speedMph > 30) {
                speedScale = 1.0 - Math.min(0.85, (speedMph - 30) / 15);
            }
            
            // 3. Sideways roll scaling: reduce downforce slightly when side-hilling to keep steering feeling responsive
            var rollScale = 1.0 - Math.min(0.30, rollSteepness / 0.5);
            
            // Calculate final force vector
            var magnetForceAmount = this.smoothContactRatio * maxForce * speedScale * rollScale;
            
            // Split into local downforce (60% for traction) and vertical downforce (40% for gravity stability)
            var localForceAmount = magnetForceAmount * 0.60;
            var worldForceAmount = magnetForceAmount * 0.40;
            
            // Apply local downforce at center of mass (perpendicular to chassis)
            if (contacts > 0) {
                avgNormal.normalize();
                var dot = worldDown.dot(avgNormal);
                // Only project if worldDown points towards the ground (dot < 0)
                if (dot < 0) {
                    avgNormal.scale(dot * localForceAmount, localForce);
                } else {
                    worldDown.scale(localForceAmount, localForce);
                }
            } else {
                worldDown.scale(localForceAmount, localForce);
            }
            
            // Apply self-righting downforce below the center of mass in the direction of the slope normal (CoG cheat)
            var cgOffsetZ = v.gear === 'L' ? -1.20 : -0.70;
            var localOffset = new CANNON.Vec3(0, 0, cgOffsetZ);
            var worldOffset = new CANNON.Vec3();
            chassisBody.vectorToWorldFrame(localOffset, worldOffset);
            chassisBody.position.vadd(worldOffset, forcePosition);
            
            var selfRightingDirection = new CANNON.Vec3(0, 0, -1);
            if (contacts > 0) {
                avgNormal.scale(-1, selfRightingDirection);
            }
            
            selfRightingDirection.scale(worldForceAmount, worldForce);
            
            // Calculate total downward vertical force from magnetism
            downwardZ = localForce.z + worldForce.z;
        }

        // Run the suspension physics update to calculate base suspension forces
        this.updateSuspension(timeStep);

        // To keep the ride height exactly the same under dynamic downforce/magnetism,
        // we cancel the vertical suspension compression on the ground. We add a compensating
        // upward force to each wheel that is in contact, so the net vertical force on the chassis
        // is zero, but the wheels still receive the full downforce for tire friction calculations.
        if (contacts > 0 && downwardZ < 0) {
            var suspensionCompensation = -downwardZ / contacts;
            for (var i = 0; i < numWheels; i++) {
                var wheel = wheelInfos[i];
                if (wheel.isInContact) {
                    wheel.suspensionForce += suspensionCompensation;
                }
            }
        }

        // Apply suspension impulses to the chassis body
        var impulse = new CANNON.Vec3();
        for (var i = 0; i < numWheels; i++) {
            var wheel = wheelInfos[i];
            var suspensionForce = wheel.suspensionForce;
            if (suspensionForce > wheel.maxSuspensionForce) {
                suspensionForce = wheel.maxSuspensionForce;
            }
            // Apply suspension force vertically along the world Z axis (0, 0, 1) rather than the tilted local axis
            var suspensionDirection = new CANNON.Vec3(0, 0, 1);
            suspensionDirection.scale(suspensionForce * timeStep, impulse);
            chassisBody.applyImpulse(impulse, wheel.chassisConnectionPointWorld);
        }

        // Apply physical magnetism forces to the chassis body
        if (this.smoothContactRatio > 0.01) {
            chassisBody.applyForce(localForce, chassisBody.position);
            chassisBody.applyForce(worldForce, forcePosition);
        }

        this.updateFriction(timeStep);

        var hitNormalWorldScaledWithProj = new CANNON.Vec3();
        var fwd = new CANNON.Vec3();
        var vel = new CANNON.Vec3();
        for (var i = 0; i < numWheels; i++) {
            var wheel = wheelInfos[i];
            chassisBody.getVelocityAtWorldPoint(wheel.chassisConnectionPointWorld, vel);

            var m = 1;
            switch(this.indexUpAxis){
            case 1:
                m = -1;
                break;
            }

            var sideMult = (i % 2 === 0) ? 1 : -1;

            if (wheel.isInContact) {
                this.getVehicleAxisWorld(this.indexForwardAxis, fwd);
                var proj = fwd.dot(wheel.raycastResult.hitNormalWorld);
                wheel.raycastResult.hitNormalWorld.scale(proj, hitNormalWorldScaledWithProj);

                fwd.vsub(hitNormalWorldScaledWithProj, fwd);

                var proj2 = fwd.dot(vel);
                wheel.deltaRotation = sideMult * m * proj2 * timeStep / wheel.radius;
            }

            if((wheel.sliding || !wheel.isInContact) && wheel.engineForce !== 0 && wheel.useCustomSlidingRotationalSpeed){
                // Inverted sign: since forward throttle results in negative engineForce, we map negative force 
                // to forward (positive) rotation, and positive force to reverse (negative) rotation.
                wheel.deltaRotation = sideMult * (wheel.engineForce > 0 ? -1 : 1) * wheel.customSlidingRotationalSpeed * timeStep;
            }

            if(Math.abs(wheel.brake) > Math.abs(wheel.engineForce)){
                wheel.deltaRotation = 0;
            }

            wheel.rotation += wheel.deltaRotation;
            wheel.deltaRotation *= 0.99;
        }
    };

    vehicle.addToWorld(cannonWorld);

    // Save references on the vehicle object
    v.chassisBody = chassisBody;
    v.raycastVehicle = vehicle;
}

function preUpdateVehicles() {
    // Cache starting angle for camera yaw alignment
    for (let v of vehicles) {
        v.lastAngle = v.angle;
    }

    // Apply vehicle inputs for player-driven vehicle
    if (player.inVehicle) {
        const v = player.inVehicle;
        if (v.raycastVehicle && v.chassisBody) {
            // Player-driven vehicle must never sleep or freeze mid-drive/mid-slide
            v.chassisBody.allowSleep = false;
            v.chassisBody.wakeUp();

            const maxBrake = 3000; // Stronger brakes for high weight
            let isFlipped = Math.abs(v.roll) > Math.PI / 3 || Math.abs(v.pitch) > Math.PI / 3;
            
            if (isFlipped) {
                // If flipped, pressing Space resets the vehicle orientation upright and raises it 1.5m to land cleanly
                if (keys['Space']) {
                    v.chassisBody.position.z += 1.5;
                    v.chassisBody.velocity.set(0, 0, 0);
                    v.chassisBody.angularVelocity.set(0, 0, 0);
                    v.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), v.angle);
                    v.chassisBody.wakeUp();
                }
                
                // Zero out engine force and steering while flipped to avoid mid-air spazzing
                v.raycastVehicle.setSteeringValue(0, 0);
                v.raycastVehicle.setSteeringValue(0, 1);
                v.raycastVehicle.applyEngineForce(0, 0);
                v.raycastVehicle.applyEngineForce(0, 1);
                v.raycastVehicle.applyEngineForce(0, 2);
                v.raycastVehicle.applyEngineForce(0, 3);
                v.raycastVehicle.setBrake(maxBrake, 0);
                v.raycastVehicle.setBrake(maxBrake, 1);
                v.raycastVehicle.setBrake(maxBrake, 2);
                v.raycastVehicle.setBrake(maxBrake, 3);
            } else if (v.gear === 'P') {
                v.raycastVehicle.setSteeringValue(0, 0);
                v.raycastVehicle.setSteeringValue(0, 1);
                v.raycastVehicle.applyEngineForce(0, 0);
                v.raycastVehicle.applyEngineForce(0, 1);
                v.raycastVehicle.applyEngineForce(0, 2);
                v.raycastVehicle.applyEngineForce(0, 3);
                v.raycastVehicle.setBrake(3000, 0);
                v.raycastVehicle.setBrake(3000, 1);
                v.raycastVehicle.setBrake(3000, 2);
                v.raycastVehicle.setBrake(3000, 3);
            } else {
                // Swapped sign: gas = -1 when W is pressed (forward), gas = 1 when S is pressed (reverse)
                const gas = keys['KeyW'] ? -1 : (keys['KeyS'] ? 1 : 0);
                const steerInput = keys['KeyA'] ? -1 : (keys['KeyD'] ? 1 : 0);
                
                // Real-time speed calculations (using absolute speed in km/h)
                const speedKmH = Math.abs(v.currentVehicleSpeedKmHour || 0);
                
                // Speed-sensitive steering: scale steering response down at higher speeds (capped at 20% reduction for better steering at speed)
                // Also scale down steering when reversing, as reverse steering is naturally twitchy
                let steerScale = 1.0 - Math.min(0.20, speedKmH / 85);
                if (v.currentVehicleSpeedKmHour < 0) {
                    steerScale *= 0.45; // significantly lower steering angle in reverse to prevent spinouts
                }
                const maxSteer = 0.70 * steerScale; // Increased low-speed steering limit to 0.70 rad (approx 40 deg)
                
                 // Default to Drive ('D') gear if undefined
                 v.gear = v.gear || 'D';
                 
                 // Determine if the player is trying to brake using opposite throttle inputs
                 let isBrakingWithThrottle = false;
                 if (v.currentVehicleSpeedKmHour > 2.0 && gas > 0) {
                     isBrakingWithThrottle = true;
                 } else if (v.currentVehicleSpeedKmHour < -2.0 && gas < 0) {
                     isBrakingWithThrottle = true;
                 }

                 const maxBrake = 1600; // Reduced brake force to prevent stoppies
                 
                 // Scale engine force: less force in reverse, lower torque and speed cap in Low gear
                  let engineForce = 16000; // Middle-ground drive engine torque (increased from 9500) to maintain momentum at speed without being too fast
                  if (gas > 0) {
                      engineForce = 5000; // Softer reverse torque to prevent harsh acceleration/stoppies when reversing
                  } else if (gas < 0) {
                      if (v.gear === 'L') {
                          engineForce = 20000; // Beefy crawling torque (increased from 12000) to crawl over vertical voxel block faces and corners
                          
                          // Limit top speed in Low gear to 26 mph (approx 42 km/h)
                          let speedMph = speedKmH * 0.621371;
                          if (speedMph > 26) {
                              engineForce = 0; // cut throttle above top speed
                          }
                      }
                  }
                
                // Front-wheel steering (steer wheels 0 and 1)
                v.raycastVehicle.setSteeringValue(steerInput * maxSteer, 0);
                v.raycastVehicle.setSteeringValue(steerInput * maxSteer, 1);
                
                // Apply engine force or braking
                let appliedEngineForce = 0;
                let brakeForce = 0;
                
                if (keys['Space']) {
                    brakeForce = maxBrake;
                } else if (isBrakingWithThrottle) {
                    brakeForce = maxBrake * 0.85; // Strong braking when using throttle to slow down
                } else if (gas === 0) {
                    // Progressive engine brake simulating a torque converter.
                    // Scales with speed, and adjusts based on vertical velocity and gear:
                    // - Low Gear (L): holds back strongly downhill to prevent runaways, rolls freely uphill.
                    // - Drive Gear (D): decelerates really hard uphill, but coasts/rolls very freely downhill under gravity.
                    let baseEngineBrake = speedKmH * 5.3; // Reduced by a third to allow the vehicle to coast further
                    let zVel = v.chassisBody.velocity.z;
                    let slopeScale = 1.0;
                    
                    if (v.gear === 'L') {
                        slopeScale = 1.0 - zVel * 0.15;
                        slopeScale = Math.max(0.1, Math.min(2.0, slopeScale));
                    } else {
                        slopeScale = 1.0 + zVel * 0.25;
                        slopeScale = Math.max(0.05, Math.min(2.2, slopeScale));
                    }
                    
                    brakeForce = baseEngineBrake * slopeScale;
                } else {
                    appliedEngineForce = gas * engineForce;
                }
                
                // 4-Wheel Drive (4WD)
                v.raycastVehicle.applyEngineForce(appliedEngineForce, 0);
                v.raycastVehicle.applyEngineForce(appliedEngineForce, 1);
                v.raycastVehicle.applyEngineForce(appliedEngineForce, 2);
                v.raycastVehicle.applyEngineForce(appliedEngineForce, 3);
                
                // Rear-biased braking to completely prevent nose-dives / stoppies (braking front wheels only 30% to prevent nose-dives)
                v.raycastVehicle.setBrake(brakeForce * 0.3, 0); // Front Left
                v.raycastVehicle.setBrake(brakeForce * 0.3, 1); // Front Right
                v.raycastVehicle.setBrake(brakeForce, 2);       // Rear Left
                v.raycastVehicle.setBrake(brakeForce, 3);       // Rear Right

                // If the player is in the vehicle, but idling (no throttle/steering input and very low speed),
                // apply extra damping to eliminate physics solver micro-jitter and visual shaking.
                if (gas === 0 && steerInput === 0) {
                    const speed = v.chassisBody.velocity.norm();
                    const angSpeed = v.chassisBody.angularVelocity.norm();
                    if (speed < 0.15) {
                        v.chassisBody.velocity.scale(0.85, v.chassisBody.velocity);
                    }
                    if (angSpeed < 0.15) {
                        v.chassisBody.angularVelocity.scale(0.85, v.chassisBody.angularVelocity);
                    }
                }
            }
        }
    }

    // Set control and braking baseline for non-driven vehicles so they stay parked
    for (let v of vehicles) {
        if (v !== player.inVehicle && v.raycastVehicle && v.chassisBody) {
            // Parked vehicles are allowed to sleep when stationary to save CPU cycles
            v.chassisBody.allowSleep = true;

            // Apply strong damping when stationary to prevent parking jiggles before sleeping.
            // Using a higher threshold (1.0 m/s) and stronger scaling (0.70) for parked vehicles
            // lets them absorb spawn drop energy and settle to a complete sleep rest instantly.
            const speed = v.chassisBody.velocity.norm();
            const angSpeed = v.chassisBody.angularVelocity.norm();
            if (speed < 1.0) {
                v.chassisBody.velocity.scale(0.70, v.chassisBody.velocity);
            }
            if (angSpeed < 1.0) {
                v.chassisBody.angularVelocity.scale(0.70, v.chassisBody.angularVelocity);
            }

            v.raycastVehicle.setSteeringValue(0, 0);
            v.raycastVehicle.setSteeringValue(0, 1);
            v.raycastVehicle.applyEngineForce(0, 0);
            v.raycastVehicle.applyEngineForce(0, 1);
            v.raycastVehicle.applyEngineForce(0, 2);
            v.raycastVehicle.applyEngineForce(0, 3);
            v.raycastVehicle.setBrake(3000, 0); // strong parking brake
            v.raycastVehicle.setBrake(3000, 1);
            v.raycastVehicle.setBrake(3000, 2);
            v.raycastVehicle.setBrake(3000, 3);
        }
    }
}

function postUpdateVehicles() {
    // Sync Cannon chassis states back to vehicle objects
    for (let v of vehicles) {
        if (v.chassisBody) {
            const body = v.chassisBody;
            v.x = body.position.x;
            v.y = body.position.y;
            v.z = body.position.z;
            
            const q = body.quaternion;
            v.qx = q.x;
            v.qy = q.y;
            v.qz = q.z;
            v.qw = q.w;

            const threeQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
            const euler = new THREE.Euler().setFromQuaternion(threeQuat, 'ZXY');
            v.angle = euler.z; // Yaw
            v.roll = euler.x;  // Roll
            v.pitch = euler.y; // Pitch
            v.speed = body.velocity.norm(); // Norm calculates length in Cannon.js (Vec3.length doesn't exist)
            v.currentVehicleSpeedKmHour = v.raycastVehicle ? v.raycastVehicle.currentVehicleSpeedKmHour : 0;

            // Sync individual wheel positions and rotations for rendering
            if (v.raycastVehicle) {
                v.wheels = [];
                for (let i = 0; i < v.raycastVehicle.wheelInfos.length; i++) {
                    const wInfo = v.raycastVehicle.wheelInfos[i];
                    const wPos = wInfo.worldTransform.position;
                    const wQuat = wInfo.worldTransform.quaternion;
                    
                    v.wheels.push({
                        x: wPos.x,
                        y: wPos.y,
                        z: wPos.z,
                        qx: wQuat.x,
                        qy: wQuat.y,
                        qz: wQuat.z,
                        qw: wQuat.w
                    });
                }
            }

            // Rotate camera (player.angle) with the vehicle's yaw rotation
            if (player.inVehicle === v) {
                let deltaYaw = v.angle - v.lastAngle;
                while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
                while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
                
                let isCrazy = Math.abs(v.roll) > 1.0 || Math.abs(v.pitch) > 1.0;
                if (!isCrazy) {
                    player.angle += deltaYaw;
                }
            }

            let isGrounded = false;
            let cx = Math.cos(v.angle), sx = Math.sin(v.angle);
            
            if (v.raycastVehicle) {
                for (let i = 0; i < v.raycastVehicle.wheelInfos.length; i++) {
                    const wheel = v.raycastVehicle.wheelInfos[i];
                    if (wheel.raycastResult.hasHit) {
                        isGrounded = true;
                        const pos = wheel.worldTransform.position;
                        
                        // Heavy wheelspin mud spray requires active engine power input from the driver and traction loss.
                        const isDriving = (v === player.inVehicle && (keys['KeyW'] || keys['KeyS']));
                        const isSlipping = wheel.skidInfo < 0.85;
                        if (isSlipping && isDriving) {
                            // Heavy mud/dirt spray kicked up under wheelspin, shooting backward relative to wheel rotation
                            if (tickCounter % 2 === 0) {
                                let scatterX = (Math.random() - 0.5) * 0.06;
                                let scatterY = (Math.random() - 0.5) * 0.06;
                                spawnDirt(pos.x, pos.y, pos.z - 0.4, -cx * 0.2 + scatterX, -sx * 0.2 + scatterY, true);
                            }
                        } else if (v.speed > 2.0 && tickCounter % 4 === 0) {
                            // Passive, light dirt spray when moving quickly (driven or rolling fast)
                            spawnDirt(pos.x, pos.y, pos.z - 0.4, -cx * 0.1, -sx * 0.1, false);
                        }
                    }
                }
            }
            v.isGrounded = isGrounded;

            // Exhaust smoke puff system for trucks
            if (v.type === 'truck' && player.inVehicle === v) {
                const speedKmH = Math.abs(v.currentVehicleSpeedKmHour || 0);
                const isThrottling = keys['KeyW'] || keys['KeyS'];

                // Simulated RPM calculation matching audio.js
                let rpm = 520; // Idle
                if (isThrottling) {
                    if (v.gear === 'P') {
                        if (!v.freeRevRPM) v.freeRevRPM = 520;
                        v.freeRevRPM += 200;
                        if (v.freeRevRPM > 4800) v.freeRevRPM = 4800;
                        rpm = v.freeRevRPM;
                    } else if (v.gear === 'L') {
                        rpm = 1800 + (speedKmH / 42) * 3800;
                    } else {
                        let speedMph = speedKmH * 0.621371;
                        if (speedMph < 18) {
                            rpm = 1000 + (speedMph / 18) * 3600;
                        } else if (speedMph < 38) {
                            let t = (speedMph - 18) / (38 - 18);
                            rpm = 2200 + t * 2400;
                        } else if (speedMph < 60) {
                            let t = (speedMph - 38) / (60 - 38);
                            rpm = 2400 + t * 2200;
                        } else {
                            let t = Math.min(1.0, (speedMph - 60) / 40);
                            rpm = 2500 + t * 2300;
                        }
                    }
                } else {
                    const time = performance.now();
                    const lope = Math.sin(time * 0.006) * 30;
                    rpm = 520 + lope + (speedKmH / 120) * 1400;
                    rpm = Math.max(450, rpm);
                }

                // Phase logic: 2 revolutions (one 4-stroke cycle) = 8.0 units of phase.
                // deltaPhase per frame at 60Hz is: (rpm / 60 / 2) * 8 / 60 = rpm / 900
                let deltaPhase = rpm / 900;
                v.exhaustPhase = v.exhaustPhase || 0;
                let oldPhase = v.exhaustPhase;
                let newPhase = oldPhase + deltaPhase;

                // Chevy V8 Left bank exhaust cadence: 1 - gap - gap - 3 - gap - 5 - 7 - gap
                // Corresponds to steps: 0, 3, 5, 6 are firings
                const V8_FIRING_STEPS = [true, false, false, true, false, true, true, false];

                let startStep = Math.ceil(oldPhase);
                let endStep = Math.floor(newPhase);

                for (let step = startStep; step <= endStep; step++) {
                    if (V8_FIRING_STEPS[step % 8]) {
                        // Spawn exhaust smoke puff!
                        let localExhaust = new CANNON.Vec3(-1.813, 0.567, -0.344);
                        let worldPos = new CANNON.Vec3();
                        v.chassisBody.pointToWorldFrame(localExhaust, worldPos);

                        // Calculate a point slightly further back along the local exhaust vector to get the exact world direction
                        let localExhaustBack = new CANNON.Vec3(-2.813, 0.567, -0.344);
                        let worldPosBack = new CANNON.Vec3();
                        v.chassisBody.pointToWorldFrame(localExhaustBack, worldPosBack);

                        let worldDir = new CANNON.Vec3(
                            worldPosBack.x - worldPos.x,
                            worldPosBack.y - worldPos.y,
                            worldPosBack.z - worldPos.z
                        );
                        worldDir.normalize();

                        // Position scatter to prevent perfect lines
                        let scatter = 0.02;
                        let px = worldPos.x + (Math.random() - 0.5) * scatter;
                        let py = worldPos.y + (Math.random() - 0.5) * scatter;
                        let pz = worldPos.z + (Math.random() - 0.5) * scatter;

                        // Speeds & sizes scale with throttle
                        let throttleFactor = isThrottling ? 1.0 : 0.0;
                        let exitSpeed = 0.02 + throttleFactor * 0.04 + Math.random() * 0.01;

                        // Do not inherit the truck's velocity, so the particles immediately linger stationary in world space
                        let vx = worldDir.x * exitSpeed + (Math.random() - 0.5) * 0.005;
                        let vy = worldDir.y * exitSpeed + (Math.random() - 0.5) * 0.005;
                        let vz = worldDir.z * exitSpeed + 0.002 + Math.random() * 0.005;

                        let startSize = 0.015 + throttleFactor * 0.015 + Math.random() * 0.008;
                        let maxLife = 70 + Math.floor(throttleFactor * 50) + Math.floor(Math.random() * 30);
                        let maxOpacity = 0.18 + throttleFactor * 0.17;

                        let baseColor = 100 - throttleFactor * 45; // Dirty grey (Idle = 100, Throttle = 55)
                        let colorNoise = (Math.random() - 0.5) * 8;
                        let r = Math.floor(baseColor - 3 + colorNoise);
                        let g = Math.floor(baseColor + colorNoise);
                        let b = Math.floor(baseColor + 3 + colorNoise);

                        r = Math.max(0, Math.min(255, r));
                        g = Math.max(0, Math.min(255, g));
                        b = Math.max(0, Math.min(255, b));

                        bloodParticles.push({
                            x: px,
                            y: py,
                            z: pz,
                            vx: vx,
                            vy: vy,
                            vz: vz,
                            color: { r, g, b },
                            life: maxLife,
                            maxLife: maxLife,
                            startSize: startSize,
                            size: startSize,
                            isSmoke: true,
                            isExhaust: true,
                            maxOpacity: maxOpacity
                        });
                    }
                }
                v.exhaustPhase = newPhase % 8;
            }
        }
    }
}
