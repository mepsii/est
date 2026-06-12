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
