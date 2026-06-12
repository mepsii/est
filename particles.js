//THIS IS particles.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

function updateParticles() {
    for(let i = bloodParticles.length - 1; i >= 0; i--) { 
        let b = bloodParticles[i];
        if (b.isSmoke) {
            b.x += b.vx; b.y += b.vy; b.z += b.vz;
            b.vx *= 0.90; b.vy *= 0.90; b.vz *= 0.94;
            b.vz += 0.0012; 
            let lifeRatio = b.life / b.maxLife;
            b.size = b.startSize * lifeRatio;
            if (gameState === 'overworld' && getSolid(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))) {
                b.life = 0;
            }
        } else if (!b.onGround) {
            b.x += b.vx; b.y += b.vy; b.z += b.vz; b.vz -= 0.02; 
            if (b.isWater) {
                let t = getTerrainFast(b.x, b.y);
                let waterSurfaceZ = (t.isLake || t.baseH <= t.oceanSurface) ? (t.isLake ? t.lakeSurface : t.oceanSurface) : 0;
                if (waterSurfaceZ > 0 && b.z <= waterSurfaceZ + 0.45) {
                    b.life = 0; // Dissipate immediately on touching water surface
                }
            }
            if (gameState === 'overworld' && getSolid(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))) { 
                if (b.isBlood || b.isLimb) {
                    b.z = Math.floor(b.z) + 1.02; 
                    b.vx = 0; b.vy = 0; b.vz = 0; 
                    b.onGround = true;
                    if (!b.isLimb) {
                        b.isPooling = true;
                        b.targetPoolSize = b.size * (3.0 + Math.random() * 2.0);
                        b.life = Math.max(b.life, 300 + Math.floor(Math.random() * 150));
                    }
                } else {
                    // Non-blood particles (dirt, block debris, etc.) dissipate instantly on hitting the solid ground
                    b.life = 0;
                }
            } 
        }
        
        if (b.isPooling) {
            b.size += (b.targetPoolSize - b.size) * 0.05;
        }
        
        if (b.isLimb) {
            let zBlood = getBloodColor('zombie') || {r: 92, g: 64, b: 51};
            if (b.onGround) {
                // If it is on the ground, spray blood out the side of it occasionally!
                let limit = (b.maxLife || 3000) * 0.4;
                if (b.life > limit) {
                    let progress = (b.life - limit) / ((b.maxLife || 3000) - limit); // 1.0 down to 0.0
                    if (Math.random() < progress * 0.25) {
                        let angle = b.sprayAngle + (Math.random() - 0.5) * 0.8; // wider, more chaotic angle
                        let speed = Math.random() * 0.12 + 0.05; // faster horizontal spread
                        let vz = Math.random() * 0.10 + 0.06; // higher vertical fountaining
                        bloodParticles.push({
                            x: b.x, y: b.y, z: b.z + 0.05,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            vz: vz,
                            color: zBlood,
                            life: 50 + Math.random() * 25,
                            size: (Math.random() * 0.07 + 0.04) * 0.25,
                            isBlood: true
                        });
                    }
                }
            } else {
                // While flying in the air, leave blood trail
                if (b.life > 10 && Math.random() < 0.45) {
                    spawnBlood(b.x, b.y, b.z, zBlood, 2);
                }
            }
        }
        
        b.life--; if (b.life <= 0) bloodParticles.splice(i, 1); 
    }

    // Safety cap: limit maximum number of active particles to prevent memory leaks and lag
    while (bloodParticles.length > 800) {
        bloodParticles.shift();
    }

}
