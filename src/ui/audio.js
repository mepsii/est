//THIS IS audio.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// --- Footstep Sound Effects System ---
const stepSoundsPool = [
    Array.from({ length: 3 }, () => {
        const audio = new Audio('sounds/step1.ogg');
        audio.preload = 'auto';
        return audio;
    }),
    Array.from({ length: 3 }, () => {
        const audio = new Audio('sounds/step2.ogg');
        audio.preload = 'auto';
        return audio;
    })
];
const nextStepSoundIdx = [0, 0];

function playStepSound(stepType) {
    try {
        const pool = stepSoundsPool[stepType];
        let idx = nextStepSoundIdx[stepType];
        const sound = pool[idx];
        sound.currentTime = 0;
        
        // Calculate distance from player to camera for volume attenuation
        let camX = typeof currentCamX !== 'undefined' ? currentCamX : player.x;
        let camY = typeof currentCamY !== 'undefined' ? currentCamY : player.y;
        let camZ = typeof currentCamZ !== 'undefined' ? currentCamZ : player.z;
        let dist = Math.hypot(player.x - camX, player.y - camY, player.z - camZ);
        
        // Quiet down base volume and filter by distance
        sound.volume = 0.08 / Math.max(1.0, dist * 0.5);
        
        sound.play().catch(e => {
            // Silence console warning if played before user gesture
        });
        nextStepSoundIdx[stepType] = (idx + 1) % pool.length;
    } catch (e) {
        console.error("Error playing step sound:", e);
    }
}

const mobStepSoundsPool = [
    Array.from({ length: 4 }, () => {
        const audio = new Audio('sounds/step1.ogg');
        audio.preload = 'auto';
        return audio;
    }),
    Array.from({ length: 4 }, () => {
        const audio = new Audio('sounds/step2.ogg');
        audio.preload = 'auto';
        return audio;
    })
];
const nextMobStepSoundIdx = [0, 0];

function playMobStepSound(x, y, z, stepType) {
    try {
        const pool = mobStepSoundsPool[stepType];
        let idx = nextMobStepSoundIdx[stepType];
        const sound = pool[idx];
        sound.currentTime = 0;
        
        let camX = typeof currentCamX !== 'undefined' ? currentCamX : player.x;
        let camY = typeof currentCamY !== 'undefined' ? currentCamY : player.y;
        let camZ = typeof currentCamZ !== 'undefined' ? currentCamZ : player.z;
        let dist = Math.hypot(x - camX, y - camY, z - camZ);
        
        if (dist > 35.0) return; // ignore sounds too far away to optimize
        
        // Attenuate volume based on distance (mobs are slightly quieter than player)
        let finalVolume = 0.05 / Math.max(1.0, dist * 0.7);
        if (finalVolume < 0.005) return;
        
        sound.volume = finalVolume;
        sound.play().catch(e => {
            // Silence console warning
        });
        nextMobStepSoundIdx[stepType] = (idx + 1) % pool.length;
    } catch (e) {
        console.error("Error playing mob step sound:", e);
    }
}

// --- Pistol Sound Effects ---
const pistolShotPool = Array.from({ length: 3 }, () => {
    const audio = new Audio('sounds/pistol/pistolshot1.wav');
    audio.preload = 'auto';
    return audio;
});
let nextPistolShotIdx = 0;

function playPistolShot() {
    try {
        const sound = pistolShotPool[nextPistolShotIdx];
        sound.currentTime = 0;
        sound.play();
        nextPistolShotIdx = (nextPistolShotIdx + 1) % pistolShotPool.length;
    } catch(e) {
        console.error("Error playing pistol shot sound:", e);
    }
}

function startPistolReload() {
    let activeItem = inventory[hotbarSelection];
    if (!activeItem || activeItem.id !== 'pistol') return;
    if (typeof ensurePistolAmmo === 'function') ensurePistolAmmo(activeItem);
    if (activeItem.bullets >= 10) return;
    
    // Check if player has any .45 ACP ammo in inventory
    let totalAmmo = (typeof countPlayerAmmo === 'function') ? countPlayerAmmo('.45acp') : 0;
    if (totalAmmo <= 0) return;
    
    if (player.pistolReloadTimer > 0) return;
    
    player.pistolReloadTimer = 60;
    if (typeof updateBulletCounterUI === 'function') updateBulletCounterUI();
}

// --- Ambient Sound Effects System ---
let ambianceAudio = null;
let waterAudio = null;
let desertAudio = null;
let engineSound = null;

function updateAmbiance() {
    // --- Vehicle Engine Sound Integration ---
    if (gameState === 'overworld' && !isLoading && hasLoaded && !isPaused && player.inVehicle) {
        if (!engineSound) {
            engineSound = new RetroEngineSound();
        }
        engineSound.start();

        const v = player.inVehicle;
        const speedKmH = Math.abs(v.currentVehicleSpeedKmHour || 0);
        const isThrottling = keys['KeyW'] || keys['KeyS'];

        // Simulated Automatic gear shifting (4-speed) for engine pitch
        let targetRPM = 800; // Idle
        if (isThrottling) {
            if (v.gear === 'L') {
                targetRPM = 1800 + (speedKmH / 42) * 3800; // Crawl revs
            } else {
                let speedMph = speedKmH * 0.621371;
                // Gear shifts at specific speeds:
                // 1st: 0 - 18 mph
                // 2nd: 18 - 38 mph
                // 3rd: 38 - 60 mph
                // 4th: 60+ mph
                if (speedMph < 18) {
                    targetRPM = 1000 + (speedMph / 18) * 3600; // 1st gear: 1000 - 4600 RPM
                } else if (speedMph < 38) {
                    let t = (speedMph - 18) / (38 - 18);
                    targetRPM = 2200 + t * 2400; // 2nd gear: 2200 - 4600 RPM
                } else if (speedMph < 60) {
                    let t = (speedMph - 38) / (60 - 38);
                    targetRPM = 2400 + t * 2200; // 3rd gear: 2400 - 4600 RPM
                } else {
                    let t = Math.min(1.0, (speedMph - 60) / 40);
                    targetRPM = 2500 + t * 2300; // 4th gear: 2500 - 4800 RPM
                }
            }
            targetRPM += Math.random() * 40; // light engine noise jitter
        } else {
            // Idle or coasting
            targetRPM = 800 + (speedKmH / 120) * 1200;
        }

        engineSound.update(targetRPM, isThrottling);
    } else {
        if (engineSound) {
            engineSound.stop();
        }
    }
    if (!ambianceAudio) {
        ambianceAudio = new Audio('sounds/ambiance1.wav');
        ambianceAudio.loop = true;
        ambianceAudio.volume = 0;
    }
    if (!waterAudio) {
        waterAudio = new Audio('sounds/water1.wav');
        waterAudio.loop = true;
        waterAudio.volume = 0;
    }
    if (!desertAudio) {
        desertAudio = new Audio('sounds/desert1.wav');
        desertAudio.loop = true;
        desertAudio.volume = 0;
    }
    
    let targetAmbianceVolume = 0;
    let targetWaterVolume = 0;
    let targetDesertVolume = 0;
    
    if (gameState === 'overworld' && !isLoading && hasLoaded && !isPaused) {
        let px = Math.floor(player.x);
        let py = Math.floor(player.y);
        
        // Find distance to nearest water column
        let nearestWaterDist = Infinity;
        let searchRadius = 8;
        for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
            for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
                let tx = px + dx;
                let ty = py + dy;
                let t = getTerrainFast(tx, ty);
                if (t.baseH <= 24.0 || t.isLake) { // 24 is WATER_LEVEL
                    let dist = Math.hypot(dx, dy);
                    if (dist < nearestWaterDist) {
                        nearestWaterDist = dist;
                    }
                }
            }
        }
        
        let moisture = getBiome(player.x, player.y);
        let waterFactor = 0;
        if (nearestWaterDist <= 8.0) {
            waterFactor = 1.0 - (nearestWaterDist / 8.0); // 1.0 at water, 0.0 at 8+ blocks away
        }
        
        targetWaterVolume = 0.30 * waterFactor;
        
        if (moisture >= 0.35) {
            // Player is in a green biome
            targetAmbianceVolume = 0.25 * (1.0 - waterFactor * 0.6); // fade green ambiance down by 60% near water
            targetDesertVolume = 0;
        } else {
            // Player is in desert biome
            targetAmbianceVolume = 0;
            targetDesertVolume = 0.25 * (1.0 - waterFactor * 0.6); // fade desert ambiance down by 60% near water
        }
    }
    
    // Smoothly fade ambiance volume in/out
    if (ambianceAudio.volume !== targetAmbianceVolume) {
        let diff = targetAmbianceVolume - ambianceAudio.volume;
        if (Math.abs(diff) < 0.01) {
            ambianceAudio.volume = targetAmbianceVolume;
        } else {
            ambianceAudio.volume += Math.sign(diff) * 0.005;
        }
    }
    
    // Smoothly fade water volume in/out
    if (waterAudio.volume !== targetWaterVolume) {
        let diff = targetWaterVolume - waterAudio.volume;
        if (Math.abs(diff) < 0.01) {
            waterAudio.volume = targetWaterVolume;
        } else {
            waterAudio.volume += Math.sign(diff) * 0.005;
        }
    }
    
    // Smoothly fade desert volume in/out
    if (desertAudio.volume !== targetDesertVolume) {
        let diff = targetDesertVolume - desertAudio.volume;
        if (Math.abs(diff) < 0.01) {
            desertAudio.volume = targetDesertVolume;
        } else {
            desertAudio.volume += Math.sign(diff) * 0.005;
        }
    }
    
    // Control ambiance playback
    if (targetAmbianceVolume > 0 && ambianceAudio.paused) {
        ambianceAudio.play().catch(e => {});
    } else if (targetAmbianceVolume === 0 && !ambianceAudio.paused && ambianceAudio.volume === 0) {
        ambianceAudio.pause();
    }
    
    // Control water playback
    if (targetWaterVolume > 0 && waterAudio.paused) {
        waterAudio.play().catch(e => {});
    } else if (targetWaterVolume === 0 && !waterAudio.paused && waterAudio.volume === 0) {
        waterAudio.pause();
    }
    
    // Control desert playback
    if (targetDesertVolume > 0 && desertAudio.paused) {
        desertAudio.play().catch(e => {});
    } else if (targetDesertVolume === 0 && !desertAudio.paused && desertAudio.volume === 0) {
        desertAudio.pause();
    }
}

class RetroEngineSound {
    constructor() {
        this.audioCtx = null;
        this.osc1 = null;
        this.osc2 = null;
        this.subOsc = null;
        this.filter = null;
        this.gainNode = null;
        this.distortion = null;
        this.isPlaying = false;
        this.currentRPM = 800;
    }

    init() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API not supported", e);
        }
    }

    start() {
        if (this.isPlaying) return;
        if (!this.audioCtx) this.init();
        if (!this.audioCtx) return;

        this.isPlaying = true;
        
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const ctx = this.audioCtx;

        this.osc1 = ctx.createOscillator();
        this.osc1.type = 'sawtooth';
        
        this.osc2 = ctx.createOscillator();
        this.osc2.type = 'sawtooth';
        
        this.subOsc = ctx.createOscillator();
        this.subOsc.type = 'triangle';

        this.distortion = ctx.createWaveShaper();
        this.distortion.curve = this.makeDistortionCurve(30);
        this.distortion.oversample = '4x';

        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'bandpass';
        this.filter.Q.value = 1.0;

        this.gainNode = ctx.createGain();
        this.gainNode.gain.setValueAtTime(0.0, ctx.currentTime);

        this.osc1.connect(this.distortion);
        this.osc2.connect(this.distortion);
        this.subOsc.connect(this.distortion);
        this.distortion.connect(this.filter);
        this.filter.connect(this.gainNode);
        this.gainNode.connect(ctx.destination);

        this.osc1.start();
        this.osc2.start();
        this.subOsc.start();

        this.gainNode.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.15);
    }

    makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    update(rpm, throttleInput) {
        if (!this.isPlaying) return;
        const ctx = this.audioCtx;
        if (!ctx) return;

        this.currentRPM += (rpm - this.currentRPM) * 0.15;
        const firingFreq = (this.currentRPM / 60) * 4;

        this.osc1.frequency.setTargetAtTime(firingFreq, ctx.currentTime, 0.05);
        this.osc2.frequency.setTargetAtTime(firingFreq + 1.8, ctx.currentTime, 0.05);
        this.subOsc.frequency.setTargetAtTime(firingFreq * 0.5, ctx.currentTime, 0.05);

        const centerFreq = 120 + firingFreq * 1.3;
        this.filter.frequency.setTargetAtTime(centerFreq, ctx.currentTime, 0.05);

        const volumeScale = throttleInput ? 0.14 : 0.07;
        this.gainNode.gain.setTargetAtTime(volumeScale, ctx.currentTime, 0.1);
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        
        if (this.gainNode && this.audioCtx) {
            const ctx = this.audioCtx;
            this.gainNode.gain.cancelScheduledValues(ctx.currentTime);
            this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, ctx.currentTime);
            this.gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            
            setTimeout(() => {
                if (!this.isPlaying) {
                    if (this.osc1) { this.osc1.stop(); this.osc1.disconnect(); }
                    if (this.osc2) { this.osc2.stop(); this.osc2.disconnect(); }
                    if (this.subOsc) { this.subOsc.stop(); this.subOsc.disconnect(); }
                    if (this.distortion) this.distortion.disconnect();
                    if (this.filter) this.filter.disconnect();
                    if (this.gainNode) this.gainNode.disconnect();
                    this.osc1 = this.osc2 = this.subOsc = this.distortion = this.filter = this.gainNode = null;
                }
            }, 200);
        }
    }
}

