//THIS IS main.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

document.addEventListener('mousemove', (e) => { 
    if (!isPaused) { 
        if (freecam) {
            freecamAngle += e.movementX * (isZooming ? 0.001 : 0.003); 
            
            let maxPitch = canvas.height * 2.5; 
            freecamPitch -= e.movementY * (isZooming ? 0.5 : 1.5); 
            freecamPitch = Math.max(-maxPitch, Math.min(maxPitch, freecamPitch));
        } else {
            player.angle += e.movementX * (isZooming ? 0.001 : 0.003); 
            
            let maxPitch = canvas.height * 2.5; 
            player.pitch -= e.movementY * (isZooming ? 0.5 : 1.5); 
            player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch)); 
        }
    } 
});

let lastTime = performance.now();
let frames = 0;
let physicsAccumulator = 0;
const physicsTickRate = 1000 / 60; // 60 updates per second (16.67ms)
let lastLoopTime = performance.now();

// Rendering throttle helper
let lastRenderTime = performance.now();
const targetRenderInterval = 1000 / 30; // 33.33ms
const pacingTolerance = 6; // 6ms tolerance window to align with display refresh boundaries

function loop(timestamp) { 
    requestAnimationFrame(loop); 
    
    const now = timestamp || performance.now();
    let dt = now - lastLoopTime;
    if (dt > 250) dt = 250; // Cap dt to avoid "spiral of death" during lag spikes
    lastLoopTime = now;

    // Fixed timestep physics update
    physicsAccumulator += dt;
    while (physicsAccumulator >= physicsTickRate) {
        update(); 
        physicsAccumulator -= physicsTickRate;
    }

    // Render throttling with pacing tolerance
    const elapsedRender = now - lastRenderTime;
    if (lockFps30) {
        if (elapsedRender >= (targetRenderInterval - pacingTolerance)) {
            render(); 
            if (elapsedRender > targetRenderInterval * 2) {
                lastRenderTime = now;
            } else {
                lastRenderTime += targetRenderInterval;
            }
            frames++;
        }
    } else {
        render(); 
        lastRenderTime = now;
        frames++;
    }
    
    if (now >= lastTime + 500) {
        const fps = Math.round((frames * 1000) / (now - lastTime));
        if (fpsValEl) fpsValEl.innerText = fps;
        frames = 0;
        lastTime = now;
    }
}
loop();

// Chunk preloading manager
let preloadedCount = 0;
let chunksToPreload = [];
let totalChunksToPreload = 0;
let preloadStarted = false;

function startPreloading() {
    if (preloadStarted) return;
    preloadStarted = true;
    
    const chunkRadius = Math.ceil(VIEW_DIST / CHUNK_SIZE);
    chunksToPreload = [];
    
    for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
        for (let cy = -chunkRadius; cy <= chunkRadius; cy++) {
            const dist = Math.hypot((cx + 0.5) * CHUNK_SIZE, (cy + 0.5) * CHUNK_SIZE);
            if (dist <= VIEW_DIST + CHUNK_SIZE) {
                chunksToPreload.push({ cx, cy });
            }
        }
    }
    totalChunksToPreload = chunksToPreload.length;
    preloadedCount = 0;
    
    processPreload();
}

function processPreload() {
    if (!wasmLoaded) {
        requestAnimationFrame(processPreload);
        return;
    }
    
    const progress = preloadedCount / totalChunksToPreload;
    
    const bar = document.getElementById('loading-bar');
    if (bar) {
        bar.style.width = `${progress * 100}%`;
    }
    
    if (preloadedCount < totalChunksToPreload) {
        const batchSize = 45; 
        const end = Math.min(preloadedCount + batchSize, totalChunksToPreload);
        for (let i = preloadedCount; i < end; i++) {
            const { cx, cy } = chunksToPreload[i];
            getMapChunk(cx, cy);
            
            const mesh = buildChunkMesh(cx, cy);
            chunkMeshes.set(`${cx},${cy}`, mesh);
        }
        preloadedCount = end;
        requestAnimationFrame(processPreload);
    } else {
        let startZ = MAX_Z - 1;
        while (startZ > 0 && getVoxel(0, 0, startZ) !== 1) startZ--;
        player.z = startZ + 1.5;
        
        if (bar) {
            bar.style.width = "100%";
        }
        
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('fade-out');
        
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            isLoading = false;
            hasLoaded = true;
        }, 500);
    }
}