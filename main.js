//THIS IS main.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

document.addEventListener('mousemove', (e) => { 
    if (!isPaused) { 
        player.angle += e.movementX * (isZooming ? 0.001 : 0.003); 
        
        let maxPitch = canvas.height * 2.5; 
        player.pitch -= e.movementY * (isZooming ? 0.5 : 1.5); 
        player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch)); 
    } 
});

function loop() { update(); render(); requestAnimationFrame(loop); }
loop();