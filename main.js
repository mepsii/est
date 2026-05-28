//THIS IS main.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

document.addEventListener('mousemove', (e) => { 
    if (!isPaused) { 
        player.angle += e.movementX * (isZooming ? 0.001 : 0.003); 
        
        let maxPitch = canvas.height * 2.5; 
        player.pitch -= e.movementY * (isZooming ? 0.5 : 1.5); 
        player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch)); 
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