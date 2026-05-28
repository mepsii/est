//THIS IS render.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

const zombieHeadImg = new Image();
zombieHeadImg.src = 'textures/zombiehead.png';

const ZombieHeadCache = {
    sprites: new Map(),
    get(flash, ambient) {
        let ambStep = ambient >= 1.0 ? 1.0 : Math.max(0.1, Math.round(ambient * 20) / 20);
        const key = `${flash}_${ambStep}`;
        if (this.sprites.has(key)) return this.sprites.get(key);
        
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 128;
        const cx = c.getContext('2d');
        
        if (zombieHeadImg.complete && zombieHeadImg.naturalWidth !== 0) {
            cx.drawImage(zombieHeadImg, 0, 0, 128, 128);
            
            // Remove checkerboard background (flood-fill from borders/corners)
            const imgData = cx.getImageData(0, 0, 128, 128);
            const data = imgData.data;
            const visited = new Uint8Array(128 * 128);
            const queue = [];
            
            function isBg(r, g, b, a) {
                if (a === 0) return true;
                // Detect white (r,g,b > 230) or light grey checkerboard
                let isWhite = (r > 230 && g > 230 && b > 230);
                let isGrey = (Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && Math.abs(r - b) < 8 && r > 180 && r < 220);
                return isWhite || isGrey;
            }
            
            // Push borders to queue
            for (let x = 0; x < 128; x++) {
                for (let y of [0, 127]) {
                    let idx = (y * 128 + x) * 4;
                    if (isBg(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
                        queue.push(x, y);
                        visited[y * 128 + x] = 1;
                    }
                }
            }
            for (let y = 0; y < 128; y++) {
                for (let x of [0, 127]) {
                    let idx = (y * 128 + x) * 4;
                    if (!visited[y * 128 + x] && isBg(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
                        queue.push(x, y);
                        visited[y * 128 + x] = 1;
                    }
                }
            }
            
            let head = 0;
            const dirs = [-1, 0, 1, 0, 0, -1, 0, 1];
            while (head < queue.length) {
                let qx = queue[head++];
                let qy = queue[head++];
                let idx = (qy * 128 + qx) * 4;
                data[idx+3] = 0; // Transparent
                
                for (let d = 0; d < 8; d += 2) {
                    let nx = qx + dirs[d];
                    let ny = qy + dirs[d+1];
                    if (nx >= 0 && nx < 128 && ny >= 0 && ny < 128) {
                        let nidx = ny * 128 + nx;
                        if (!visited[nidx]) {
                            let pidx = nidx * 4;
                            if (isBg(data[pidx], data[pidx+1], data[pidx+2], data[pidx+3])) {
                                queue.push(nx, ny);
                                visited[nidx] = 1;
                            }
                        }
                    }
                }
            }
            cx.putImageData(imgData, 0, 0);
        } else {
            // Fallback while texture loads
            cx.font = '96px sans-serif';
            cx.textAlign = 'center';
            cx.textBaseline = 'middle';
            cx.fillText('🧟', 64, 64);
        }
        
        if (flash) {
            cx.globalCompositeOperation = 'source-atop';
            cx.fillStyle = 'white';
            cx.fillRect(0, 0, 128, 128);
            cx.globalCompositeOperation = 'source-over';
        } else if (ambStep < 1.0) {
            cx.globalCompositeOperation = 'source-atop';
            cx.fillStyle = `rgba(15, 20, 35, ${1.0 - ambStep})`;
            cx.fillRect(0, 0, 128, 128);
            cx.globalCompositeOperation = 'source-over';
        }
        
        if (zombieHeadImg.complete && zombieHeadImg.naturalWidth !== 0) {
            this.sprites.set(key, c);
        }
        return c;
    }
};

function render() {
    if (isPaused && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) return;

    meshesBuiltThisFrame = 0;

    let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
    let camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;

    const fov = canvas.width * currentZoom, hY = canvas.height/2 + player.pitch;
    const cosA = Math.cos(player.angle), sinA = Math.sin(player.angle);
    const pitchAngle = Math.atan2(player.pitch, fov);
    const aimX = cosA * Math.cos(pitchAngle), aimY = sinA * Math.cos(pitchAngle), aimZ = Math.sin(pitchAngle);

    renderCount = 0; 
    let sky = getSkyColor(gameTime);
    let ambient = getAmbientLight(gameTime);
    let visibleTorches = torches.filter(c => Math.hypot(c.x - player.x, c.y - player.y) < VIEW_DIST);

    ctx.fillStyle = `rgb(${sky.r|0}, ${sky.g|0}, ${sky.b|0})`; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    function project3D(px, py, pz) {
        let dx = px - player.x, dy = py - player.y, dz = pz - camZ;
        let rotX = dx * cosA + dy * sinA;
        if (rotX < 0.1) return null; 
        let rotY = dx * -sinA + dy * cosA;
        let sx = canvas.width/2 + (rotY / rotX) * fov;
        let sy = hY - (dz / rotX) * fov;
        return { sx, sy, depth: rotX };
    }

    let fovMult = 0.7 / currentZoom; 

    if (gameState === 'overworld') {
        let sunTimeAngle = ((gameTime - 6) / 24) * Math.PI * 2;
        let sunDx = Math.cos(sunTimeAngle) * 50000;
        let sunDz = Math.sin(sunTimeAngle) * 50000;
        let sunDy = 15000; 
        let distSqCel = sunDx*sunDx + sunDy*sunDy + sunDz*sunDz;
        
        let sunRotX = sunDx * cosA + sunDy * sinA;
        if (sunRotX > 0) {
            let o = getRenderItem(); o.type = 'celestial'; o.emoji = '☀️'; o.depthSq = distSqCel;
            o.wX = player.x + sunDx; o.wY = player.y + sunDy; o.h = camZ + sunDz; o.size = 6000;
        }
        
        let moonDx = -sunDx, moonDy = -sunDy, moonDz = -sunDz;
        let moonRotX = moonDx * cosA + moonDy * sinA;
        if (moonRotX > 0) {
            let o = getRenderItem(); o.type = 'celestial'; o.emoji = '🌕'; o.depthSq = distSqCel;
            o.wX = player.x + moonDx; o.wY = player.y + moonDy; o.h = camZ + moonDz; o.size = 5000;
        }

        let cloudHeight = 130;
        let cloudGrid = 20;
        let cloudViewDist = 200;
        let cloudRad = Math.ceil(cloudViewDist / cloudGrid);
        let cloudSpeed = 25;
        let cloudMoveX = gameTime * cloudSpeed;
        let pCxCloud = Math.floor((player.x - cloudMoveX) / cloudGrid);
        let pCyCloud = Math.floor(player.y / cloudGrid);
        
        let cGridSize = cloudRad * 2 + 3;
        let cloudNoise = new Float32Array(cGridSize * cGridSize);
        for (let x = 0; x < cGridSize; x++) {
            for (let y = 0; y < cGridSize; y++) {
                let cx = pCxCloud - cloudRad - 1 + x;
                let cy = pCyCloud - cloudRad - 1 + y;
                cloudNoise[x + y * cGridSize] = fbm2D(cx * cloudGrid * 0.012, cy * cloudGrid * 0.012, 2);
            }
        }

        let cH = 12; 
        let colorTop = 'rgba(255, 255, 255, 0.5)';
        let colorBottom = 'rgba(210, 210, 210, 0.5)';
        let colorSide1 = 'rgba(235, 235, 235, 0.5)';
        let colorSide2 = 'rgba(220, 220, 220, 0.5)';

        for (let x = 1; x < cGridSize - 1; x++) {
            for (let y = 1; y < cGridSize - 1; y++) {
                if (cloudNoise[x + y * cGridSize] > 0.45) {
                    let cx = pCxCloud - cloudRad - 1 + x;
                    let cy = pCyCloud - cloudRad - 1 + y;
                    let wx = cx * cloudGrid + cloudMoveX;
                    let wy = cy * cloudGrid;
                    
                    let n_px = cloudNoise[(x + 1) + y * cGridSize] > 0.45;
                    let n_nx = cloudNoise[(x - 1) + y * cGridSize] > 0.45;
                    let n_py = cloudNoise[x + (y + 1) * cGridSize] > 0.45;
                    let n_ny = cloudNoise[x + (y - 1) * cGridSize] > 0.45;
                    
                    let addCloudFace = (pts, col) => {
                        let cX = (pts[0].x + pts[2].x)/2, cY = (pts[0].y + pts[2].y)/2, cZ = (pts[0].z + pts[2].z)/2;
                        let dX = cX - player.x, dY = cY - player.y, dZ = cZ - camZ;
                        let rotX = dX * cosA + dY * sinA;
                        if (rotX > -cloudGrid && rotX < cloudViewDist) {
                            let fRotY = dX * -sinA + dY * cosA;
                            if (Math.abs(fRotY) <= Math.max(0, rotX) * fovMult + cloudGrid * 2) {
                                let o = getRenderItem();
                                o.type = 'cloudPoly'; o.pts = pts; o.color = col;
                                o.depthSq = rotX * rotX;
                            }
                        }
                    };

                    addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight} ], colorBottom);
                    addCloudFace([ {x: wx, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], colorTop);
                    
                    if (!n_nx) addCloudFace([ {x: wx, y: wy, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy, z: cloudHeight + cH} ], colorSide1);
                    if (!n_px) addCloudFace([ {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH} ], colorSide1);
                    if (!n_ny) addCloudFace([ {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH} ], colorSide2);
                    if (!n_py) addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], colorSide2);
                }
            }
        }

        let pCx = Math.floor(player.x / CHUNK_SIZE), pCy = Math.floor(player.y / CHUNK_SIZE);
        let chunkRadius = Math.ceil(VIEW_DIST / CHUNK_SIZE);
        
        for (let cx = pCx - chunkRadius; cx <= pCx + chunkRadius; cx++) {
            for (let cy = pCy - chunkRadius; cy <= pCy + chunkRadius; cy++) {
                let dx = cx * CHUNK_SIZE + CHUNK_SIZE/2 - player.x, dy = cy * CHUNK_SIZE + CHUNK_SIZE/2 - player.y;
                let cRotX = dx * cosA + dy * sinA;
                let cRotY = dx * -sinA + dy * cosA;
                
                if (cRotX < -CHUNK_SIZE * 1.5) continue; 
                if (Math.abs(cRotY) > cRotX * fovMult + CHUNK_SIZE * 1.5) continue;
                
                let faces = getChunkMesh(cx, cy);
                if (faces.length > 0) {
                    let o = getRenderItem();
                    o.type = 'chunk_mesh';
                    o.cx = cx; o.cy = cy;
                    // depthSq is the distance from the player to the chunk center
                    o.depthSq = cRotX * cRotX;
                    o.wX = cx * CHUNK_SIZE + CHUNK_SIZE/2;
                    o.wY = cy * CHUNK_SIZE + CHUNK_SIZE/2;
                    o.h = 48; // mid height of chunk
                    o.faces = faces;
                }
                
                let chunk = getMapChunk(cx, cy);
                for (let i = 0; i < chunk.length; i++) {
                    let obj = chunk[i], dX = obj.wx - player.x, dY = obj.wy - player.y, rotX = dX * cosA + dY * sinA;
                    if (rotX > 0.2 && rotX < VIEW_DIST) {
                        let fRotY = dX * -sinA + dY * cosA;
                        if (Math.abs(fRotY) > rotX * fovMult + 3.0) continue;
                        let o = getRenderItem(); o.type = obj.type; o.emoji = obj.emoji; o.size = obj.size; o.hp = obj.hp; o.depthSq = rotX*rotX; o.h = obj.h; o.wX = obj.wx; o.wY = obj.wy;
                    }
                }
            }
        }

        for (let v of vehicles) {
            let dx = v.x - player.x, dy = v.y - player.y;
            let rotX = dx * cosA + dy * sinA;
            if (rotX < -10 || rotX > VIEW_DIST * 1.5) continue;
            let rotY = dx * -sinA + dy * cosA;
            if (Math.abs(rotY) > Math.max(0, rotX) * fovMult + 10.0) continue;
            if (player.inVehicle === v && player.vehicleView === '1st') continue; 
            
            let model = WEAPON_MODELS[v.type];
            if (model) {
                let conf = VEHICLE_MODEL_CONFIG[v.type] || { scale: 1, rotX: 0, rotY: 0, rotZ: 0, offsetZ: 0 };
                let vcx = Math.cos(v.angle), vsx = Math.sin(v.angle);
                
                for (let f of model.faces) {
                    let wPts = [];
                    for (let pt of f.pts) {
                        let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, conf.rotZ);
                        p1.x *= conf.scale; p1.y *= conf.scale; p1.z *= conf.scale;
                        
                        let cp = Math.cos(v.pitch), sp = Math.sin(v.pitch); 
                        let cr = Math.cos(v.roll), sr = Math.sin(v.roll);
                        
                        let p2x = p1.x * cp - p1.z * sp;
                        let p2y = p1.y;
                        let p2z = p1.x * sp + p1.z * cp;
                        
                        let p3x = p2x;
                        let p3y = p2y * cr - p2z * sr;
                        let p3z = p2y * sr + p2z * cr;
                        
                        let wx = p3x * vcx - p3y * vsx;
                        let wy = p3x * vsx + p3y * vcx;
                        
                        wPts.push({ x: v.x + wx, y: v.y + wy, z: v.z + p3z + (conf.offsetZ || 0) });
                    }
                    
                    let u = { x: wPts[1].x - wPts[0].x, y: wPts[1].y - wPts[0].y, z: wPts[1].z - wPts[0].z };
                    let w = { x: wPts[2].x - wPts[0].x, y: wPts[2].y - wPts[0].y, z: wPts[2].z - wPts[0].z };
                    let nx = u.y*w.z - u.z*w.y, ny = u.z*w.x - u.x*w.z, nz = u.x*w.y - u.y*w.x;
                    
                    if (nx*(wPts[0].x - player.x) + ny*(wPts[0].y - player.y) + nz*(wPts[0].z - camZ) > 0) continue;
                    
                    let cX = (wPts[0].x+wPts[1].x+wPts[2].x)/3, cY = (wPts[0].y+wPts[1].y+wPts[2].y)/3, cZ = (wPts[0].z+wPts[1].z+wPts[2].z)/3;
                    let fRotX = (cX - player.x) * cosA + (cY - player.y) * sinA;
                    
                    let o = getRenderItem();
                    o.type = 'objWorldFace'; o.pts = wPts; o.color = f.color; o.depthSq = fRotX * fRotX;
                    o.wX = cX; o.wY = cY; o.h = cZ; o.norm = {x: nx, y: ny, z: nz};
                }
            } else {
                let o = getRenderItem(); o.type = 'emoji'; o.emoji = '🚚'; o.size = 4; o.depthSq = rotX*rotX; o.h = v.z; o.wX = v.x; o.wY = v.y; o.targeted = (v === interactTarget);
            }
        }
        
        for (let e of enemies) { let dx=e.x-player.x, dy=e.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.hp = e.hp; o.flash = e.flash; o.depthSq = rotX*rotX; o.size = e.size; o.h = e.z; o.wX = e.x; o.wY = e.y; if (e.type === 'experimental' || e.type === 'zombie') { o.type = 'locationalEnemy'; o.obj = e; } else { o.type = 'emoji'; o.emoji = e.emoji || '👽'; } } }
        for (let c of torches) { let dx=c.x-player.x, dy=c.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = c.emoji; o.size = c.size; o.depthSq = rotX*rotX; o.h = c.z; o.wX = c.x; o.wY = c.y; if (ambient < 1.0) { let g = getRenderItem(); g.type = 'torchBloom'; g.depthSq = rotX*rotX - 0.1; g.h = c.z; g.flicker = c.flicker; g.size = c.size; g.wX = c.x; g.wY = c.y;} } }
        for (let e of containers) { let dx=e.x-player.x, dy=e.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y; } }
        for (let e of animals) { let dx=e.x-player.x, dy=e.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.type = 'animal'; o.emoji = e.emoji; o.size = e.size; o.hp = (!e.dead ? e.hp : undefined); o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.dead = e.dead; o.wX = e.x; o.wY = e.y; } }
        for (let b of buildings) { let dx=b.x-player.x, dy=b.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 8.0) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = b.emoji; o.size = 4.5; o.depthSq = rotX*rotX; o.h = b.z; o.targeted = b === interactTarget; o.wX = b.x; o.wY = b.y; } }
        for (let d of damageTexts) { let dx=d.x-player.x, dy=d.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 2.0) { let o = getRenderItem(); o.type = 'dmgText'; o.text = Math.round(d.amt*10)/10; o.depthSq = rotX*rotX; o.h = d.z; o.life = d.life; o.wX = d.x; o.wY = d.y;} }
        for (let b of bloodParticles) { let dx=b.x-player.x, dy=b.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.1 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 2.0) { let o = getRenderItem(); o.type = 'blood'; o.color = b.color; o.size = b.size; o.depthSq = rotX*rotX; o.h = b.z; o.life = b.life; o.wX = b.x; o.wY = b.y;} }
        
        if (typeof placementItem !== 'undefined' && placementItem !== null) {
            let target = getPlacementTarget();
            let dx = target.x - player.x, dy = target.y - player.y, rotX = dx*cosA + dy*sinA;
            if (rotX > 0.1 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) {
                let o = getRenderItem(); 
                o.type = 'emoji'; 
                o.emoji = placementItem.emoji; 
                o.size = placementItem.type === 'torch' ? 0.4 : 4.5; 
                o.depthSq = rotX*rotX; 
                o.h = target.z; 
                o.wX = target.x; 
                o.wY = target.y; 
                o.ghost = true;
            }
        }

        let activeItem = inventory[hotbarSelection];
        let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;

        if (curW && (curW.type === 'block' || curW.toolType === 'pickaxe' || curW.toolType === 'shovel')) {
            let aim = getAimVoxel(curW.range);
            if (aim) {
                let isPlace = (curW.type === 'block');
                let targetX = isPlace ? aim.placeX : aim.hitX;
                let targetY = isPlace ? aim.placeY : aim.hitY;
                let targetZ = isPlace ? aim.placeZ : aim.hitZ;
                let isFine = (curW.type === 'block' && isVoxelCube(curW.blockId)) || curW.toolType === 'pickaxe';
                
                let mx = isFine ? Math.floor(targetX) : targetX;
                let my = isFine ? Math.floor(targetY) : targetY;
                let mz = isFine ? Math.floor(targetZ) : targetZ;
                
                let cx = mx, cy = my, cz = mz;
                let sz = isFine ? 1.0 : 1.4;
                if (!isFine) {
                    cx -= sz/2; cy -= sz/2; cz -= sz/2;
                }

                let p000 = {x:cx, y:cy, z:cz}, p100 = {x:cx+sz, y:cy, z:cz}, p110 = {x:cx+sz, y:cy+sz, z:cz}, p010 = {x:cx, y:cy+sz, z:cz};
                let p001 = {x:cx, y:cy, z:cz+sz}, p101 = {x:cx+sz, y:cy, z:cz+sz}, p111 = {x:cx+sz, y:cy+sz, z:cz+sz}, p011 = {x:cx, y:cy+sz, z:cz+sz};
                
                let col;
                if (curW.type === 'block') {
                    if (isVoxelCube(curW.blockId)) {
                        let vCol = getVoxelColor(0, 0, 0, curW.blockId);
                        col = { r: vCol.r, g: vCol.g, b: vCol.b, a: 0.35 };
                    } else {
                        col = { r: 120, g: 255, b: 120, a: 0.35 };
                    }
                } else {
                    col = { r: 255, g: 80, b: 80, a: 0.35 };
                } 

                let addPF = (p1, p2, p3, p4) => {
                    let tCx = (p1.x+p3.x)/2, tCy = (p1.y+p3.y)/2, tCz = (p1.z+p3.z)/2;
                    let dx = tCx - player.x, dy = tCy - player.y, dz = tCz - camZ;
                    let rotX = dx * cosA + dy * sinA;
                    if (rotX > 0.1 && rotX < VIEW_DIST) {
                        let o = getRenderItem(); o.type = 'face'; 
                        o.face = { pts: [p1,p2,p3,p4], col: col, shade: 1.0, isWater: false };
                        o.depthSq = rotX * rotX;
                        o.wX = tCx; o.wY = tCy; o.h = tCz;
                    }
                };
                addPF(p001, p101, p111, p011);
                addPF(p010, p110, p100, p000);
                addPF(p000, p100, p101, p001);
                addPF(p110, p010, p011, p111);
                addPF(p100, p110, p111, p101);
                addPF(p010, p000, p001, p011);
            }
        }
    } else {
        ctx.fillStyle = '#0a0d04'; ctx.fillRect(0, 0, canvas.width, hY); ctx.fillStyle = patternArmyGreenFloor; ctx.fillRect(0, Math.max(0, hY), canvas.width, canvas.height - Math.max(0, hY));
        let interiorEnts = getInteriorEntities();
        for (let e of interiorEnts) { let dx=e.x-player.x, dy=e.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y; } }
        let walls = getInteriorWalls();
        for (let w of walls) {
            if (w.pts) {
                let dx=w.pts[0].x-player.x, dy=w.pts[0].y-player.y, rotX = dx*cosA + dy*sinA; 
                if (rotX > 0.1) { let o = getRenderItem(); o.type = 'wallPoly'; o.pts = w.pts; o.color = w.color; o.depthSq = rotX*rotX; }
            } else {
                let r1 = (w.p1.x-player.x)*cosA + (w.p1.y-player.y)*sinA, r2 = (w.p2.x-player.x)*cosA + (w.p2.y-player.y)*sinA;
                if (r1 > 0.1 || r2 > 0.1) { let o = getRenderItem(); o.type = 'wall'; o.p1 = w.p1; o.p2 = w.p2; o.color = w.color; o.depthSq = Math.min(r1, r2)**2; }
            }
        }
    }

    // Render Dropped Items (in both overworld & interior states)
    for (let e of droppedItems) {
        let dx = e.x - player.x, dy = e.y - player.y, rotX = dx*cosA + dy*sinA;
        if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) {
            let itemId = e.item.id;
            let model = itemId ? WEAPON_MODELS[itemId] : null;
            
            // Bobbing hover effect
            let bobZ = Math.sin(e.hoverTime * 0.08) * 0.12 + 0.08;
            let itemZ = e.z + bobZ;

            if (model) {
                // Render as 3D Model
                let conf = WEAPON_MODEL_CONFIG[itemId] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0 };
                let scale = conf.scale * 1.5;
                let spinAngle = e.hoverTime * 0.012;
                
                // Spin around vertical axis (yaw)
                let ryaw = conf.rotZ + spinAngle;

                for (let f of model.faces) {
                    let wPts = [];
                    for (let pt of f.pts) {
                        let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, ryaw);
                        
                        let wx = p1.x * scale;
                        let wy = p1.y * scale;
                        let wz = p1.z * scale;
                        
                        wPts.push({ x: e.x + wx, y: e.y + wy, z: itemZ + wz + 0.15 });
                    }
                    
                    let u = { x: wPts[1].x - wPts[0].x, y: wPts[1].y - wPts[0].y, z: wPts[1].z - wPts[0].z };
                    let w = { x: wPts[2].x - wPts[0].x, y: wPts[2].y - wPts[0].y, z: wPts[2].z - wPts[0].z };
                    let nx = u.y*w.z - u.z*w.y, ny = u.z*w.x - u.x*w.z, nz = u.x*w.y - u.y*w.x;
                    
                    if (nx*(wPts[0].x - player.x) + ny*(wPts[0].y - player.y) + nz*(wPts[0].z - camZ) > 0) continue;
                    
                    let cX = (wPts[0].x+wPts[1].x+wPts[2].x)/3, cY = (wPts[0].y+wPts[1].y+wPts[2].y)/3, cZ = (wPts[0].z+wPts[1].z+wPts[2].z)/3;
                    let fRotX = (cX - player.x) * cosA + (cY - player.y) * sinA;
                    
                    let o = getRenderItem();
                    o.type = 'objWorldFace'; 
                    o.pts = wPts; 
                    o.color = f.color; 
                    o.depthSq = fRotX * fRotX;
                    o.wX = cX; 
                    o.wY = cY; 
                    o.h = cZ; 
                    o.norm = {x: nx, y: ny, z: nz};
                    o.targeted = (e === interactTarget);
                }
            } else {
                // Fallback to Emoji Sprite
                let o = getRenderItem();
                o.type = 'droppedItem';
                o.emoji = e.item.emoji;
                o.size = 0.55;
                o.depthSq = rotX*rotX;
                o.h = itemZ;
                o.targeted = (e === interactTarget);
                o.wX = e.x;
                o.wY = e.y;
                o.spinScaleX = Math.cos(e.hoverTime * 0.012);
            }
        }
    }

    for (let p of projectiles) { let dx=p.x-player.x, dy=p.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.1 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 2.0) { let o = getRenderItem(); o.type = 'bullet'; o.owner = p.owner; o.depthSq = rotX*rotX; o.h = p.z; o.wX = p.x; o.wY = p.y;} }

    activeRenderList.length = renderCount;
    for(let i=0; i < renderCount; i++) activeRenderList[i] = renderPool[i];
    activeRenderList.sort((a,b) => b.depthSq - a.depthSq); 
    
    // Draw Budgeting: Scale budget dynamically from 5,000 at VIEW_DIST=80 up to 30,000 at VIEW_DIST=600
    let drawBudget = Math.max(5000, Math.floor(5000 + (VIEW_DIST - 80) * 100));
    if (activeRenderList.length > drawBudget) {
        activeRenderList = activeRenderList.slice(activeRenderList.length - drawBudget);
    }

    if (_lastAlign !== 'center') { ctx.textAlign = 'center'; _lastAlign = 'center'; }
    ctx.lineJoin = 'round'; 

    for (let i = 0; i < activeRenderList.length; i++) {
        let o = activeRenderList[i];
        
        let objLight = gameState === 'overworld' ? ambient : 1.0;
        
        let depth = Math.max(0.1, Math.sqrt(Math.max(0, o.depthSq))); 
        
        let isUnderground = o.type === 'face' && !o.face.isWater && o.face.underground;
        if (isUnderground) objLight = 0.05; 

        if (objLight < 1.0 && o.type !== 'torchBloom') {
            let lightIntensity = 0;
            let cx = o.wX, cy = o.wY, cz = o.type === 'face' || o.type === 'objWorldFace' ? o.h : o.h + (o.size?o.size/2:0);
            
            if (isFlashlightOn) {
                let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ; 
                let lDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (lDist > 0.1 && lDist < 45) {
                    let dot = (dx/lDist)*aimX + (dy/lDist)*aimY + (dz/lDist)*aimZ; 
                    if (dot > 0.90) { 
                        let att = (Math.max(0, (dot - 0.98) / 0.02) * 0.6 + Math.pow(Math.max(0, (dot - 0.90) / 0.08), 2.0) * 0.4) * Math.pow(1 - lDist/45, 2);
                        lightIntensity += att * 1.5;
                    }
                }
            }
            for (let c of visibleTorches) {
                let dist = Math.hypot(cx - c.x, cy - c.y, cz - c.z); 
                if (dist < 22) { lightIntensity += Math.pow(1 - dist/22, 2.5) * c.flicker * 1.5; }
            }
            objLight = Math.min(1.0, objLight + lightIntensity);
        }

        if (o.type === 'chunk_mesh') {
            let faces = o.faces;
            let visibleFaces = [];
            
            for (let i = 0; i < faces.length; i++) {
                let f = faces[i];
                let cX = f.cx, cY = f.cy, cZ = f.cz;
                let dX = cX - player.x, dY = cY - player.y, dZ = cZ - camZ;
                let rotX = dX * cosA + dY * sinA;
                
                if (rotX > -2 && rotX < VIEW_DIST) {
                    let fRotY = dX * -sinA + dY * cosA;
                    if (Math.abs(fRotY) > rotX * fovMult + 3.0) continue;
                    
                    let nx = f.norm.x, ny = f.norm.y, nz = f.norm.z;
                    if (dX * nx + dY * ny + dZ * nz > 0 && !f.isWater) continue;
                    
                    let distSq = dX*dX + dY*dY + dZ*dZ;
                    if (distSq >= VIEW_DIST * VIEW_DIST * 0.90) continue;
                    
                    let ptsArray = f.pts;
                    let camPts = [];
                    for (let k = 0; k < ptsArray.length; k++) {
                        let dx_pt = ptsArray[k].x - player.x, dy_pt = ptsArray[k].y - player.y, dz_pt = ptsArray[k].z - camZ;
                        camPts.push({ cx: dx_pt * -sinA + dy_pt * cosA, cy: dz_pt, cz: dx_pt * cosA + dy_pt * sinA });
                    }
                    
                    let clipped = [];
                    let zNear = 0.1;
                    for (let j = 0; j < camPts.length; j++) {
                        let p1 = camPts[j], p2 = camPts[(j + 1) % camPts.length];
                        if (p1.cz >= zNear) clipped.push(p1);
                        if ((p1.cz >= zNear) !== (p2.cz >= zNear)) {
                            let t = (zNear - p1.cz) / (p2.cz - p1.cz);
                            clipped.push({ cx: p1.cx + t * (p2.cx - p1.cx), cy: p1.cy + t * (p2.cy - p1.cy), cz: zNear });
                        }
                    }
                    
                    if (clipped.length < 3) continue;
                    
                    let depth = Math.max(0.1, rotX);
                    let objLightVal = objLight;
                    let isUnderground = !f.isWater && f.underground;
                    if (isUnderground) objLightVal = 0.05;
                    
                    if (objLightVal < 1.0) {
                        let lightIntensity = 0;
                        let cz_val = f.cz + 0.5;
                        if (isFlashlightOn) {
                            let dx = cX - player.x, dy = cY - player.y, dz = cz_val - camZ;
                            let lDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                            if (lDist > 0.1 && lDist < 45) {
                                let dot = (dx/lDist)*aimX + (dy/lDist)*aimY + (dz/lDist)*aimZ;
                                if (dot > 0.90) {
                                    let att = (Math.max(0, (dot - 0.98) / 0.02) * 0.6 + Math.pow(Math.max(0, (dot - 0.90) / 0.08), 2.0) * 0.4) * Math.pow(1 - lDist/45, 2);
                                    lightIntensity += att * 1.5;
                                }
                            }
                        }
                        for (let c of visibleTorches) {
                            let dist = Math.hypot(cX - c.x, cY - c.y, cz_val - c.z);
                            if (dist < 22) { lightIntensity += Math.pow(1 - dist/22, 2.5) * c.flicker * 1.5; }
                        }
                        objLightVal = Math.min(1.0, objLightVal + lightIntensity);
                    }
                    
                    let shade = f.shade * objLightVal;
                    let fr = f.col.r * shade | 0, fg = f.col.g * shade | 0, fb = f.col.b * shade | 0;
                    
                    if (player.isSubmerged) {
                        let wFog = Math.min(1, depth / (VIEW_DIST * 0.6));
                        fr = fr * (1 - wFog) + 15 * wFog | 0;
                        fg = fg * (1 - wFog) + 50 * wFog | 0;
                        fb = fb * (1 - wFog) + 120 * wFog | 0;
                    } else {
                        let fog = Math.min(1, depth / VIEW_DIST);
                        fr = fr * (1 - fog) + sky.r * fog | 0;
                        fg = fg * (1 - fog) + sky.g * fog | 0;
                        fb = fb * (1 - fog) + sky.b * fog | 0;
                    }
                    
                    let colorKey;
                    if (f.col.a !== undefined) {
                        colorKey = `rgba(${fr}, ${fg}, ${fb}, ${f.col.a})`;
                    } else {
                        colorKey = `rgb(${fr}, ${fg}, ${fb})`;
                    }
                    
                    visibleFaces.push({
                        clipped: clipped,
                        depth: depth,
                        colorKey: colorKey,
                        isWater: f.isWater
                    });
                }
            }
            
            // Sort visible faces of this chunk back-to-front
            visibleFaces.sort((a, b) => b.depth - a.depth);
            
            // Draw faces (batching consecutive solid faces of the same color, drawing water individually)
            ctx.lineWidth = 2.0;
            let currentStyle = null;
            
            let drawPoly = (poly) => {
                let sx = canvas.width/2 + (poly[0].cx / poly[0].cz) * fov;
                let sy = hY - (poly[0].cy / poly[0].cz) * fov;
                ctx.moveTo(sx, sy);
                for (let j = 1; j < poly.length; j++) {
                    let sx_pt = canvas.width/2 + (poly[j].cx / poly[j].cz) * fov;
                    let sy_pt = hY - (poly[j].cy / poly[j].cz) * fov;
                    ctx.lineTo(sx_pt, sy_pt);
                }
                ctx.closePath();
            };
            
            for (let i = 0; i < visibleFaces.length; i++) {
                let vf = visibleFaces[i];
                
                if (vf.isWater) {
                    // Flush current batch
                    if (currentStyle !== null) {
                        ctx.fillStyle = currentStyle;
                        ctx.strokeStyle = currentStyle;
                        ctx.fill();
                        ctx.stroke();
                        currentStyle = null;
                    }
                    // Draw water face individually
                    ctx.fillStyle = vf.colorKey;
                    ctx.beginPath();
                    drawPoly(vf.clipped);
                    ctx.fill();
                    continue;
                }
                
                if (vf.colorKey !== currentStyle) {
                    // Flush current batch
                    if (currentStyle !== null) {
                        ctx.fillStyle = currentStyle;
                        ctx.strokeStyle = currentStyle;
                        ctx.fill();
                        ctx.stroke();
                    }
                    currentStyle = vf.colorKey;
                    ctx.beginPath();
                }
                
                drawPoly(vf.clipped);
            }
            
            // Flush final batch
            if (currentStyle !== null) {
                ctx.fillStyle = currentStyle;
                ctx.strokeStyle = currentStyle;
                ctx.fill();
                ctx.stroke();
            }
        } else if (o.type === 'face' || o.type === 'wallPoly' || o.type === 'objWorldFace' || o.type === 'cloudPoly') {
            let ptsArray = (o.type === 'objWorldFace') ? o.pts : (o.type === 'face' ? o.face.pts : o.pts);
            let camPts = [];
            for (let k = 0; k < ptsArray.length; k++) {
                let dx = ptsArray[k].x - player.x, dy = ptsArray[k].y - player.y, dz = ptsArray[k].z - camZ;
                camPts.push({ cx: dx * -sinA + dy * cosA, cy: dz, cz: dx * cosA + dy * sinA });
            }

            let clipped = [];
            let zNear = 0.1;
            for(let j=0; j<camPts.length; j++) {
                let p1 = camPts[j], p2 = camPts[(j+1)%camPts.length];
                if(p1.cz >= zNear) clipped.push(p1);
                if((p1.cz >= zNear) !== (p2.cz >= zNear)) {
                    let t = (zNear - p1.cz) / (p2.cz - p1.cz);
                    clipped.push({ cx: p1.cx + t * (p2.cx - p1.cx), cy: p1.cy + t * (p2.cy - p1.cy), cz: zNear });
                }
            }
            
            if (clipped.length < 3) continue; 

            if (o.type === 'face') {
                let shade = o.face.shade * objLight;
                let fr = o.face.col.r * shade | 0, fg = o.face.col.g * shade | 0, fb = o.face.col.b * shade | 0;

                if (player.isSubmerged) {
                    let wFog = Math.min(1, depth / (VIEW_DIST * 0.6));
                    fr = fr * (1 - wFog) + 15 * wFog | 0; 
                    fg = fg * (1 - wFog) + 50 * wFog | 0; 
                    fb = fb * (1 - wFog) + 120 * wFog | 0;
                } else {
                    let fog = Math.min(1, depth / VIEW_DIST);
                    fr = fr * (1 - fog) + sky.r * fog | 0; 
                    fg = fg * (1 - fog) + sky.g * fog | 0; 
                    fb = fb * (1 - fog) + sky.b * fog | 0;
                }
                if (o.face.col.a !== undefined) {
                    ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${o.face.col.a})`;
                    ctx.strokeStyle = ctx.fillStyle; 
                } else {
                    ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`; ctx.strokeStyle = ctx.fillStyle; 
                }
            } else if (o.type === 'objWorldFace') {
                let len = Math.hypot(o.norm.x, o.norm.y, o.norm.z);
                let nx = o.norm.x/len, ny = o.norm.y/len, nz = o.norm.z/len;
                let sunDot = Math.max(0, nx*0.3 + ny*0.5 + nz*0.8);
                let shade = (0.4 + sunDot * 0.6) * objLight;
                let fog = Math.min(1, depth / VIEW_DIST);
                let fr = o.color.r * shade * (1-fog) + sky.r * fog | 0;
                let fg = o.color.g * shade * (1-fog) + sky.g * fog | 0;
                let fb = o.color.b * shade * (1-fog) + sky.b * fog | 0;
                if (o.targeted) {
                    fr = Math.min(255, fr + 40);
                    fg = Math.min(255, fg + 40);
                    fb = Math.min(255, fb + 40);
                }
                ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`;
                ctx.strokeStyle = o.targeted ? 'rgba(255, 255, 255, 0.8)' : ctx.fillStyle;
            } else if (o.type === 'cloudPoly') {
                ctx.fillStyle = o.color;
                ctx.strokeStyle = o.color;
                ctx.lineWidth = 1.0;
            } else {
                ctx.fillStyle = o.color; ctx.strokeStyle = '#000';
            }
            
            ctx.lineWidth = 2.0; 
            ctx.beginPath();
            for (let j = 0; j < clipped.length; j++) {
                let sx = canvas.width/2 + (clipped[j].cx / clipped[j].cz) * fov;
                let sy = hY - (clipped[j].cy / clipped[j].cz) * fov;
                if (j===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            }
            ctx.closePath(); 
            ctx.fill(); 
            // Stroke Culling: Avoid expensive strokes on far-away faces since seams are invisible at distance.
            if (depth <= 35.0 || o.targeted) {
                ctx.stroke();
            }
            
        } else if (o.type === 'wall') {
            let p1 = project3D(o.p1.x, o.p1.y, 0), p2 = project3D(o.p2.x, o.p2.y, 0), p3 = project3D(o.p2.x, o.p2.y, activeBuilding.wallH), p4 = project3D(o.p1.x, o.p1.y, activeBuilding.wallH);
            if (p1 && p2 && p3 && p4) { ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        } else {
            let p = project3D(o.wX, o.wY, o.h);
            if (!p) continue;
            let sx = p.sx, sy = p.sy, sz = (fov/depth)*o.size; 
            
            if (o.type === 'torchBloom') {
                let f = o.flicker, flameCenterY = sy - (0.4 * o.size / depth) * fov; 
                let distFade = Math.min(1, 40 / depth); 
                ctx.globalCompositeOperation = 'lighter';
                let airRad = (15.0 * o.size / depth) * fov;
                ctx.save(); ctx.translate(sx, flameCenterY); 
                let aGrad = ctx.createRadialGradient(0,0,0, 0,0, airRad);
                let aAlpha = 0.15 * f * (1 - objLight) * distFade; 
                aGrad.addColorStop(0, `rgba(255, 140, 50, ${aAlpha})`); aGrad.addColorStop(0.3, `rgba(255, 80, 20, ${aAlpha * 0.5})`); aGrad.addColorStop(1, `rgba(150, 10, 0, 0)`);
                ctx.fillStyle = aGrad; ctx.fillRect(-airRad, -airRad, airRad*2, airRad*2); ctx.restore();
                ctx.globalCompositeOperation = 'source-over';
            } else if (o.type === 'celestial') {
                ctx.font = sz + 'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillText(o.emoji, sx, sy);
                _lastFont = ''; _lastBaseline = ''; _lastAlign = '';
            } else if (o.type === 'locationalEnemy') {
                let e = o.obj, isFlash = e.flash > 0, isZombie = e.type === 'zombie';
                let legH = sz * 0.44, abdH = sz * 0.28, chestH = sz * 0.16, headR = sz * 0.12;
                
                let topLegs = sy - legH;
                let topChest = topLegs - abdH - chestH;
                
                let color1 = isFlash ? 'white' : (isZombie ? `rgb(${30*objLight|0},${86*objLight|0},${34*objLight|0})` : `rgb(${100*objLight|0},${100*objLight|0},${100*objLight|0})`);
                let color2 = isFlash ? 'white' : (isZombie ? `rgb(${46*objLight|0},${125*objLight|0},${50*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                
                // Draw Legs block
                ctx.fillStyle = color1;
                ctx.fillRect(sx - (sz * 0.20)/2, topLegs, sz * 0.20, legH);
                
                // Draw Torso block (abdomen + chest)
                ctx.fillStyle = color2;
                ctx.fillRect(sx - (sz * 0.18)/2, topChest, sz * 0.18, abdH + chestH);
                
                // Draw Head
                const headSprite = isZombie ? ZombieHeadCache.get(isFlash, objLight) : SpriteCache.get('👽', isFlash, false, objLight);
                let headScale = (headR * 2) / 128;
                let headW = headSprite.width * headScale;
                let headH = headSprite.height * headScale;
                let headX = sx - headW / 2;
                let headY = topChest - (headSprite.height - 20) * headScale;
                ctx.drawImage(headSprite, headX, headY, headW, headH);
            } else if (o.type === 'dmgText') {
                ctx.fillStyle = `rgba(255, 50, 50, ${o.life/60})`; let df = 'bold ' + Math.max(12, 24/depth) + 'px sans-serif';
                if (_lastFont !== df) { ctx.font = df; _lastFont = df; } if (_lastBaseline !== 'middle') { ctx.textBaseline = 'middle'; _lastBaseline = 'middle'; }
                ctx.fillText(o.text, sx, sy);
            } else if (o.type === 'blood') {
                let bsz = Math.max(2, (fov/depth) * o.size);
                ctx.fillStyle = `rgba(${o.color.r * objLight | 0}, ${o.color.g * objLight | 0}, ${o.color.b * objLight | 0}, ${Math.min(1.0, o.life / 20.0)})`;
                ctx.fillRect(sx - bsz/2, sy - bsz/2, bsz, bsz);
            } else if (o.type === 'emoji' || o.type === 'animal' || o.type === 'droppedItem') {
                const sprite = SpriteCache.get(o.emoji, o.targeted || (o.flash > 0), o.dead, objLight);
                let scale = sz / 128;
                
                ctx.save();
                if (o.ghost) ctx.globalAlpha = 0.5;
                
                if (o.spinScaleX !== undefined) {
                    let drawW = sprite.width * scale;
                    let drawH = sprite.height * scale;
                    ctx.translate(sx, sy - drawH / 2 + 10 * scale);
                    ctx.scale(o.spinScaleX, 1.0);
                    ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
                } else {
                    ctx.drawImage(sprite, sx - (sprite.width/2)*scale, sy - (sprite.height - 20)*scale, sprite.width * scale, sprite.height * scale);
                }
                
                if (o.ghost) ctx.globalAlpha = 1.0;
                ctx.restore();
            } else {
                ctx.fillStyle = o.owner==='player'?'#ff0':'#f33'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, 15/depth), 0, 7); ctx.fill();
            }
        }
    }

    if (!player.inVehicle || player.vehicleView === '1st') {
        renderWeaponModel();
        ctx.strokeStyle = fireCooldown > 0 ? 'red' : 'white'; ctx.lineWidth = isZooming?1:2; ctx.beginPath(); let cs = isZooming?4:8;
        ctx.moveTo(canvas.width/2-cs, hY-player.pitch); ctx.lineTo(canvas.width/2+cs, hY-player.pitch);
        ctx.moveTo(canvas.width/2, hY-player.pitch-cs); ctx.lineTo(canvas.width/2, hY-player.pitch+cs); ctx.stroke();
    }

    if (player.isSubmerged) {
        ctx.fillStyle = 'rgba(10, 50, 130, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}
