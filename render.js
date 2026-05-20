function render() {
    if (isPaused && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) return;

    let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
    let camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;

    const fov = canvas.width * currentZoom, hY = canvas.height/2 + player.pitch;
    const cosA = Math.cos(player.angle), sinA = Math.sin(player.angle);
    const pitchAngle = Math.atan2(player.pitch, fov);
    const aimX = cosA * Math.cos(pitchAngle), aimY = sinA * Math.cos(pitchAngle), aimZ = Math.sin(pitchAngle);

    renderCount = 0; 
    let sky = getSkyColor(gameTime);
    let ambient = getAmbientLight(gameTime);
    let visibleCampfires = campfires.filter(c => Math.hypot(c.x - player.x, c.y - player.y) < VIEW_DIST);

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

    let fovMult = 0.7 / currentZoom; // FOV multiplier for horizontal frustum culling

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
                                o.depthSq = dX*dX + dY*dY + dZ*dZ;
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
                
                // Chunk-level Frustum Culling
                if (cRotX < -CHUNK_SIZE * 1.5) continue; 
                if (Math.abs(cRotY) > cRotX * fovMult + CHUNK_SIZE * 1.5) continue;
                
                let faces = getChunkMesh(cx, cy);
                for (let i = 0; i < faces.length; i++) {
                    let f = faces[i];

                    let cX = (f.pts[0].x + f.pts[1].x + f.pts[2].x + f.pts[3].x) / 4;
                    let cY = (f.pts[0].y + f.pts[1].y + f.pts[2].y + f.pts[3].y) / 4;
                    let cZ = (f.pts[0].z + f.pts[1].z + f.pts[2].z + f.pts[3].z) / 4;

                    let dX = cX - player.x, dY = cY - player.y, dZ = cZ - camZ;
                    let rotX = dX * cosA + dY * sinA;
                    
                    if (rotX > -2 && rotX < VIEW_DIST) { 
                        // Face-level Frustum Culling
                        let fRotY = dX * -sinA + dY * cosA;
                        if (Math.abs(fRotY) > rotX * fovMult + 3.0) continue;

                        let ux = f.pts[1].x - f.pts[0].x, uy = f.pts[1].y - f.pts[0].y, uz = f.pts[1].z - f.pts[0].z;
                        let wx = f.pts[2].x - f.pts[0].x, wy = f.pts[2].y - f.pts[0].y, wz = f.pts[2].z - f.pts[0].z;
                        let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;

                        if (dX * nx + dY * ny + dZ * nz > 0 && !f.isWater) continue;
                        
                        let distSq = dX*dX + dY*dY + dZ*dZ; 
                        if (distSq < VIEW_DIST*VIEW_DIST) {
                            let o = getRenderItem(); o.type = 'face'; o.face = f; o.depthSq = distSq;
                            o.wX = cX; o.wY = cY; o.h = cZ; 
                        }
                    }
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

        // Render World Model Vehicles (Truck)
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
                    let distSq = (cX-player.x)**2 + (cY-player.y)**2 + (cZ-camZ)**2;
                    
                    let o = getRenderItem();
                    o.type = 'objWorldFace'; o.pts = wPts; o.color = f.color; o.depthSq = distSq;
                    o.wX = cX; o.wY = cY; o.h = cZ; o.norm = {x: nx, y: ny, z: nz};
                }
            } else {
                let o = getRenderItem(); o.type = 'emoji'; o.emoji = '🚚'; o.size = 4; o.depthSq = rotX*rotX; o.h = v.z; o.wX = v.x; o.wY = v.y; o.targeted = (v === interactTarget);
            }
        }
        
        for (let e of enemies) { let dx=e.x-player.x, dy=e.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.hp = e.hp; o.flash = e.flash; o.depthSq = rotX*rotX; o.size = e.size; o.h = e.z; o.wX = e.x; o.wY = e.y; if (e.type === 'experimental' || e.type === 'zombie') { o.type = 'locationalEnemy'; o.obj = e; } else { o.type = 'emoji'; o.emoji = e.emoji || '👽'; } } }
        for (let c of campfires) { let dx=c.x-player.x, dy=c.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = c.emoji; o.size = c.size; o.depthSq = rotX*rotX; o.h = c.z; o.wX = c.x; o.wY = c.y; if (ambient < 1.0) { let g = getRenderItem(); g.type = 'campfireBloom'; g.depthSq = rotX*rotX - 0.1; g.h = c.z; g.flicker = c.flicker; g.size = c.size; g.wX = c.x; g.wY = c.y;} } }
        for (let e of containers) { let dx=e.x-player.x, dy=e.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = e.emoji; o.size = e.size; o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.wX = e.x; o.wY = e.y; } }
        for (let e of animals) { let dx=e.x-player.x, dy=e.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 4.0) { let o = getRenderItem(); o.type = 'animal'; o.emoji = e.emoji; o.size = e.size; o.hp = (!e.dead ? e.hp : undefined); o.depthSq = rotX*rotX; o.h = e.z; o.targeted = e === interactTarget; o.dead = e.dead; o.wX = e.x; o.wY = e.y; } }
        for (let b of buildings) { let dx=b.x-player.x, dy=b.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 8.0) { let o = getRenderItem(); o.type = 'emoji'; o.emoji = b.emoji; o.size = 4.5; o.depthSq = rotX*rotX; o.h = b.z; o.targeted = b === interactTarget; o.wX = b.x; o.wY = b.y; } }
        for (let d of damageTexts) { let dx=d.x-player.x, dy=d.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.2 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 2.0) { let o = getRenderItem(); o.type = 'dmgText'; o.text = Math.round(d.amt*10)/10; o.depthSq = rotX*rotX; o.h = d.z; o.life = d.life; o.wX = d.x; o.wY = d.y;} }
        for (let b of bloodParticles) { let dx=b.x-player.x, dy=b.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.1 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 2.0) { let o = getRenderItem(); o.type = 'blood'; o.color = b.color; o.size = b.size; o.depthSq = rotX*rotX; o.h = b.z; o.life = b.life; o.wX = b.x; o.wY = b.y;} }
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

    for (let p of projectiles) { let dx=p.x-player.x, dy=p.y-player.y, rotX = dx*cosA + dy*sinA; if (rotX > 0.1 && rotX < VIEW_DIST && Math.abs(dx*-sinA + dy*cosA) < rotX*fovMult + 2.0) { let o = getRenderItem(); o.type = 'bullet'; o.owner = p.owner; o.depthSq = rotX*rotX; o.h = p.z; o.wX = p.x; o.wY = p.y;} }

    activeRenderList.length = renderCount;
    for(let i=0; i < renderCount; i++) activeRenderList[i] = renderPool[i];
    activeRenderList.sort((a,b) => b.depthSq - a.depthSq); 

    if (_lastAlign !== 'center') { ctx.textAlign = 'center'; _lastAlign = 'center'; }
    ctx.lineJoin = 'round'; 

    for (let i = 0; i < activeRenderList.length; i++) {
        let o = activeRenderList[i];
        
        let objLight = gameState === 'overworld' ? ambient : 1.0;
        let depth = Math.sqrt(o.depthSq);
        
        let isUnderground = o.type === 'face' && !o.face.isWater && o.face.underground;
        if (isUnderground) objLight = 0.05; 

        if (objLight < 1.0 && o.type !== 'campfireBloom') {
            let lightIntensity = 0;
            let cx = o.wX, cy = o.wY, cz = o.type === 'face' || o.type === 'objWorldFace' ? o.h : o.h + (o.size?o.size/2:0);
            
            if (isFlashlightOn) {
                let dx = cx - player.x, dy = cy - player.y, dz = cz - camZ; 
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (dist > 0.1 && dist < 45) {
                    let dot = (dx/dist)*aimX + (dy/dist)*aimY + (dz/dist)*aimZ; 
                    if (dot > 0.90) { 
                        let att = (Math.max(0, (dot - 0.98) / 0.02) * 0.6 + Math.pow(Math.max(0, (dot - 0.90) / 0.08), 2.0) * 0.4) * Math.pow(1 - dist/45, 2);
                        lightIntensity += att * 1.5;
                    }
                }
            }
            for (let c of visibleCampfires) {
                let dist = Math.hypot(cx - c.x, cy - c.y, cz - c.z); 
                if (dist < 22) { lightIntensity += Math.pow(1 - dist/22, 2.5) * c.flicker * 1.5; }
            }
            objLight = Math.min(1.0, objLight + lightIntensity);
        }

        if (o.type === 'face' || o.type === 'wallPoly' || o.type === 'objWorldFace' || o.type === 'cloudPoly') {
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
                ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`;
                ctx.strokeStyle = ctx.fillStyle;
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
            ctx.closePath(); ctx.fill(); ctx.stroke();
            
        } else if (o.type === 'wall') {
            let p1 = project3D(o.p1.x, o.p1.y, 0), p2 = project3D(o.p2.x, o.p2.y, 0), p3 = project3D(o.p2.x, o.p2.y, activeBuilding.wallH), p4 = project3D(o.p1.x, o.p1.y, activeBuilding.wallH);
            if (p1 && p2 && p3 && p4) { ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        } else {
            let p = project3D(o.wX, o.wY, o.h);
            if (!p) continue;
            let sx = p.sx, sy = p.sy, sz = (fov/depth)*o.size; 
            
            if (o.type === 'campfireBloom') {
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
                let topLegs = sy - legH, topAbd = topLegs - abdH, topChest = topAbd - chestH;
                
                let color1 = isFlash ? 'white' : (isZombie ? `rgb(${30*objLight|0},${86*objLight|0},${34*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                let color2 = isFlash ? 'white' : (isZombie ? `rgb(${46*objLight|0},${125*objLight|0},${50*objLight|0})` : `rgb(${136*objLight|0},${136*objLight|0},${136*objLight|0})`);
                
                ctx.fillStyle = color1; ctx.fillRect(sx - (sz * 0.20)/2, topLegs, sz * 0.20, legH);
                ctx.fillStyle = color2; ctx.fillRect(sx - (sz * 0.18)/2, topAbd, sz * 0.18, abdH + chestH);
                const headSprite = SpriteCache.get(isZombie ? '🧟' : '👽', isFlash, false, objLight);
                let headScale = (headR * 2) / 128;
                ctx.drawImage(headSprite, sx - (headSprite.width*headScale)/2, (topChest - headR/2) - (headSprite.height - 20) * headScale, headSprite.width * headScale, headSprite.height * headScale);
            } else if (o.type === 'dmgText') {
                ctx.fillStyle = `rgba(255, 50, 50, ${o.life/60})`; let df = 'bold ' + Math.max(12, 24/depth) + 'px sans-serif';
                if (_lastFont !== df) { ctx.font = df; _lastFont = df; } if (_lastBaseline !== 'middle') { ctx.textBaseline = 'middle'; _lastBaseline = 'middle'; }
                ctx.fillText(o.text, sx, sy);
            } else if (o.type === 'blood') {
                let bsz = Math.max(2, (fov/depth) * o.size);
                ctx.fillStyle = `rgba(${o.color.r * objLight | 0}, ${o.color.g * objLight | 0}, ${o.color.b * objLight | 0}, ${Math.min(1.0, o.life / 20.0)})`;
                ctx.fillRect(sx - bsz/2, sy - bsz/2, bsz, bsz);
            } else if (o.type === 'emoji' || o.type === 'animal') {
                const sprite = SpriteCache.get(o.emoji, o.targeted || (o.flash > 0), o.dead, objLight);
                let scale = sz / 128;
                ctx.drawImage(sprite, sx - (sprite.width/2)*scale, sy - (sprite.height - 20)*scale, sprite.width * scale, sprite.height * scale);
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
