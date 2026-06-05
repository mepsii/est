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
    
    // Check if player crossed chunk boundary or rotated significantly to update background preload queue
    if (!isLoading && hasLoaded) {
        const pCx = Math.floor(player.x / CHUNK_SIZE);
        const pCy = Math.floor(player.y / CHUNK_SIZE);
        const angleDiff = Math.abs(player.angle - (lastPreloadPlayerAngle || 0));
        
        let shouldRebuild = false;
        if (pCx !== lastPreloadPlayerChunkX || pCy !== lastPreloadPlayerChunkY) {
            lastPreloadPlayerChunkX = pCx;
            lastPreloadPlayerChunkY = pCy;
            shouldRebuild = true;
            evictDistantChunks(pCx, pCy);
        } else if (angleDiff > 0.35) { // ~20 degrees rotation
            lastPreloadPlayerAngle = player.angle;
            shouldRebuild = true;
        }
        
        if (shouldRebuild) {
            rebuildPreloadQueue(pCx, pCy);
        }
    }
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

    // Background preloader processing
    if (!isLoading && hasLoaded && backgroundPreloadQueue.length > 0) {
        let loopElapsed = performance.now() - now;
        const frameBudget = lockFps30 ? 20 : 6;
        if (loopElapsed < frameBudget) {
            const chunk = backgroundPreloadQueue.shift();
            if (chunk && !chunkMeshes.has(`${chunk.cx},${chunk.cy}`)) {
                getMapChunk(chunk.cx, chunk.cy);
                const mesh = buildChunkMesh(chunk.cx, chunk.cy);
                chunkMeshes.set(`${chunk.cx},${chunk.cy}`, mesh);
            }
        }
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
    
    const chunkRadius = Math.ceil((VIEW_DIST * 3.0) / CHUNK_SIZE);
    chunksToPreload = [];
    
    for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
        for (let cy = -chunkRadius; cy <= chunkRadius; cy++) {
            const dist = Math.hypot((cx + 0.5) * CHUNK_SIZE, (cy + 0.5) * CHUNK_SIZE);
            if (dist <= VIEW_DIST * 3.0 + CHUNK_SIZE) {
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

// --- Background Chunk Preloading System ---
let lastPreloadPlayerChunkX = null;
let lastPreloadPlayerChunkY = null;
let lastPreloadPlayerAngle = null;
let backgroundPreloadQueue = [];

function rebuildPreloadQueue(pCx, pCy) {
    backgroundPreloadQueue = [];
    const preloadRadius = Math.ceil((VIEW_DIST * 3.0) / CHUNK_SIZE);
    const lookAngle = player.angle;
    
    for (let cx = pCx - preloadRadius; cx <= pCx + preloadRadius; cx++) {
        for (let cy = pCy - preloadRadius; cy <= pCy + preloadRadius; cy++) {
            const dx = cx - pCx;
            const dy = cy - pCy;
            const dist = Math.hypot(dx, dy);
            if (dist <= preloadRadius) {
                const key = `${cx},${cy}`;
                if (!chunkMeshes.has(key)) {
                    // Calculate direction to chunk from player's chunk coordinates
                    const chunkAngle = Math.atan2(dy, dx);
                    let angleDiff = Math.abs(lookAngle - chunkAngle);
                    
                    // Normalize angle difference to [0, PI]
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    angleDiff = Math.abs(angleDiff);
                    
                    // Priority Score: closer chunks in player's FOV get priority
                    const priorityScore = dist + angleDiff * 6.0;
                    backgroundPreloadQueue.push({ cx, cy, dist, priorityScore });
                }
            }
        }
    }
    
    // Sort closest and look-aligned chunks first
    backgroundPreloadQueue.sort((a, b) => a.priorityScore - b.priorityScore);
}

function evictDistantChunks(pCx, pCy) {
    const evictRadius = Math.ceil((VIEW_DIST * 4.0) / CHUNK_SIZE);
    
    for (let key of chunkMeshes.keys()) {
        const [cx, cy] = key.split(',').map(Number);
        if (Math.hypot(cx - pCx, cy - pCy) > evictRadius) {
            chunkMeshes.delete(key);
        }
    }
    
    for (let key of mapChunks.keys()) {
        const [cx, cy] = key.split(',').map(Number);
        if (Math.hypot(cx - pCx, cy - pCy) > evictRadius) {
            mapChunks.delete(key);
        }
    }
}