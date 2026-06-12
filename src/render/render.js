//THIS IS render.js , NO LLM/AI SHOULD REMOVE THIS COMMENT, HOWEVER IT SHOULD USE IT TO KNOW THE FILE TREE

// MAIN RENDER LOOP ROUTINE
function render() {
    if (isLoading) return;
    if (isPaused && !isInventoryOpen && !isDebugOpen && !isStairMenuOpen) return;
    
    checkResize();
    
    if (!threeInitialized) {
        initThree();
    }
    
    if (waterMaterial) {
        waterMaterial.userData.uTime.value = performance.now() * 0.0015;
    }
    
    let realPlayerX = player.x;
    let realPlayerY = player.y;
    
    let bestPickDepth = Infinity;
    let bestPickPoint = null;
    let bestPickVehicle = null;
    
    let waterBob = player.isSubmerged ? Math.sin(gameTime * 200) * 0.05 : 0;
    let camX, camY, camZ;
    let renderAngle, renderPitch;
    
    if (freecam) {
        camX = freecamX;
        camY = freecamY;
        camZ = freecamZ;
        renderAngle = freecamAngle;
        renderPitch = freecamPitch;
    } else {
        camX = player.x;
        camY = player.y;
        camZ = player.z + player.baseHeight + (player.zOffset || 0) + waterBob;
        
        if (!player.inVehicle && (player.view === '3rd_back' || player.view === '3rd_front')) {
            let dist = 4.2;
            let startX = player.x;
            let startY = player.y;
            let startZ = player.z + 1.0;
            
            let reachedDist = dist;
            let step = 0.25;
            let dirSign = (player.view === '3rd_front') ? 1.0 : -1.0;
            for (let d = step; d <= dist; d += step) {
                let checkX = player.x + Math.cos(player.angle) * dirSign * d;
                let checkY = player.y + Math.sin(player.angle) * dirSign * d;
                let checkZ = startZ + (0.2 / dist) * d;
                if (getSolid(Math.floor(checkX), Math.floor(checkY), Math.floor(checkZ))) {
                    reachedDist = d - 0.25;
                    break;
                }
            }
            if (reachedDist < 0.25) reachedDist = 0.25;
            
            camX = player.x + Math.cos(player.angle) * dirSign * reachedDist;
            camY = player.y + Math.sin(player.angle) * dirSign * reachedDist;
            camZ = startZ + (0.2 / dist) * reachedDist + (player.zOffset || 0) + waterBob;
        }
        
        renderAngle = player.angle;
        renderPitch = player.pitch;
        let isFrontView = (player.inVehicle ? player.vehicleView === '3rd_front' : player.view === '3rd_front');
        if (isFrontView) {
            renderAngle = player.angle + Math.PI;
            renderPitch = -player.pitch;
        }
    }
    
    player.x = camX;
    player.y = camY;
    
    currentCamX = camX;
    currentCamY = camY;
    currentCamZ = camZ;
    currentCamAngle = renderAngle;
    currentCamPitch = renderPitch;
    
    // Position and rotate Three.js camera
    camera.position.set(camX, camZ, camY);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = -renderAngle - Math.PI / 2;
    camera.rotation.x = Math.atan2(renderPitch, canvas.width * baseZoom);
    
    // Smooth camera FOV zooming updates
    let fovDegrees = parseInt(document.getElementById('dbg-fov').value || 80);
    let targetHFov = isZooming ? fovDegrees / 2.0 : fovDegrees;
    let aspect = window.innerWidth / window.innerHeight;
    camera.fov = (2 * Math.atan(Math.tan((targetHFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
    camera.far = Math.max(1000, VIEW_DIST * 4.0 + 200);
    camera.updateProjectionMatrix();
    
    let sky = getSkyColor(gameTime);
    let fogColor = (gameState === 'overworld') ? sky : { r: 10, g: 13, b: 4 };
    let fogColorHex = (fogColor.r << 16) | (fogColor.g << 8) | fogColor.b;
    let ambientVal = getAmbientLight(gameTime);
    
    // Update sky color and dynamic GPU fog
    renderer.setClearColor(fogColorHex, 1.0);
    scene.background = new THREE.Color(fogColorHex);
    
    if (thickFogEnabled) {
        scene.fog = new THREE.Fog(fogColorHex, VIEW_DIST * 0.25, VIEW_DIST * 0.8);
    } else {
        scene.fog = new THREE.Fog(fogColorHex, VIEW_DIST * 0.5, VIEW_DIST * 1.1);
    }
    
    // Sync ambient and directional lighting
    let ambientR = sky.r / 255;
    let ambientG = sky.g / 255;
    let ambientB = sky.b / 255;
    
    // Add blue-tinted moonlight ambient boost at night
    if (gameState === 'overworld') {
        let nightFactor = 1.0 - ambientVal;
        if (nightFactor > 0) {
            ambientR = Math.max(ambientR, nightFactor * 0.15);
            ambientG = Math.max(ambientG, nightFactor * 0.20);
            ambientB = Math.max(ambientB, nightFactor * 0.38);
        }
    }
    
    ambientLight.color.setRGB(ambientR, ambientG, ambientB);
    ambientLight.intensity = (gameState === 'overworld') ? ambientVal * 0.5 + 0.22 : 0.15;
    
    let sunTimeAngle = ((gameTime - 6) / 24) * Math.PI * 2;
    let sunDx = Math.cos(sunTimeAngle) * 500;
    let sunDz = Math.sin(sunTimeAngle) * 500;
    let sunDy = 150;
    
    // If night (sun below horizon), point moonLight from above
    let lightDz = sunDz;
    if (lightDz < 0) {
        lightDz = -lightDz;
    }
    sunLight.position.set(sunDx, lightDz, sunDy).normalize();
    
    if (sunDz > 0) {
        sunLight.color.setRGB(1.0, 0.95, 0.9);
        sunLight.intensity = (sunDz / 500) * 0.9;
    } else {
        sunLight.color.setRGB(0.25, 0.4, 0.7);
        sunLight.intensity = (Math.abs(sunDz) / 500) * 0.22;
    }
    if (gameState !== 'overworld') {
        sunLight.intensity = 0.02;
    }
    
    // Update player flashlight spotlight
    if (isFlashlightOn) {
        flashlight.intensity = 1.5;
        flashlight.position.copy(camera.position);
        camera.updateMatrixWorld();
        let targetPos = new THREE.Vector3(0, 0, -30);
        targetPos.applyMatrix4(camera.matrixWorld);
        flashlight.target.position.copy(targetPos);
    } else {
        flashlight.intensity = 0.0;
    }
    
    // Clear frame temporary dynamic buffers
    dynamicBuffers.solid = { positions: [], colors: [], normals: [], indices: [], vertCount: 0 };
    dynamicBuffers.cloud = { positions: [], colors: [], normals: [], indices: [], vertCount: 0 };
    dynamicBuffers.player = { positions: [], colors: [], normals: [], uvs: [], indices: [], vertCount: 0 };
    dynamicBuffers.zombie = { positions: [], colors: [], normals: [], uvs: [], indices: [], vertCount: 0 };
    
    activeSpritesThisFrame.clear();
    activePointLightsThisFrame.clear();
    activeTorchGlowsThisFrame.clear();
    activeBillboardMeshes.clear();
    
    if (typeof meshesBuiltThisFrame !== 'undefined') {
        meshesBuiltThisFrame = 0;
    }
    
    // Sync static chunks terrain persistent meshes
    let pCx = Math.floor(player.x / CHUNK_SIZE);
    let pCy = Math.floor(player.y / CHUNK_SIZE);
    let maxForwardDist = VIEW_DIST * 1.15;
    let chunkRadius = Math.ceil(maxForwardDist / CHUNK_SIZE);
    
    const visibleChunks = new Set();
    
    if (gameState === 'overworld') {
        for (let cx = pCx - chunkRadius; cx <= pCx + chunkRadius; cx++) {
            for (let cy = pCy - chunkRadius; cy <= pCy + chunkRadius; cy++) {
                let dx = cx * CHUNK_SIZE + CHUNK_SIZE/2 - player.x, dy = cy * CHUNK_SIZE + CHUNK_SIZE/2 - player.y;
                let dist2D = Math.hypot(dx, dy);
                if (dist2D > maxForwardDist + CHUNK_SIZE * 2.0) continue;
                
                let key = `${cx},${cy}`;
                visibleChunks.add(key);
                
                let faces = chunkMeshes.get(key);
                if (!faces) {
                    getMapChunk(cx, cy);
                    faces = getChunkMesh(cx, cy);
                }
                
                let cached = threeChunks.get(key);
                if (!cached || cached.facesRef !== faces) {
                    updateChunkMesh(key, faces);
                    cached = threeChunks.get(key);
                }
                if (cached && cached.entities) {
                    for (let mesh of cached.entities) {
                        activeBillboardMeshes.add(mesh);
                    }
                }
            }
        }
    }
    
    // Evict distant chunk terrain meshes
    for (let key of threeChunks.keys()) {
        if (!visibleChunks.has(key)) {
            const cached = threeChunks.get(key);
            scene.remove(cached.solidMesh);
            if (cached.solidMesh) cached.solidMesh.geometry.dispose();
            scene.remove(cached.waterMesh);
            if (cached.waterMesh) cached.waterMesh.geometry.dispose();
            if (cached.entities) {
                for (let sprite of cached.entities) {
                    scene.remove(sprite);
                }
            }
            threeChunks.delete(key);
        }
    }
    
    // Run FBM clouds generator
    if (gameState === 'overworld') {
        let cloudViewDist = VIEW_DIST * 4.0;
        let cloudHeight = 130;
        let cloudGrid = 20;
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
        let colorTop = { r: 255, g: 255, b: 255, a: 0.5 };
        let colorBottom = { r: 210, g: 210, b: 210, a: 0.5 };
        let colorSide1 = { r: 235, g: 235, b: 235, a: 0.5 };
        let colorSide2 = { r: 220, g: 220, b: 220, a: 0.5 };
        
        for (let x = 1; x < cGridSize - 1; x++) {
            for (let y = 1; y < cGridSize - 1; y++) {
                if (cloudNoise[x + y * cGridSize] > 0.45) {
                    let cx = pCxCloud - cloudRad - 1 + x;
                    let cy = pCyCloud - cloudRad - 1 + y;
                    let wx = cx * cloudGrid + cloudMoveX;
                    let wy = cy * cloudGrid;
                    
                    let dx = (wx + cloudGrid * 0.5) - player.x;
                    let dy = (wy + cloudGrid * 0.5) - player.y;
                    let dist = Math.hypot(dx, dy);
                    if (dist > cloudViewDist) continue;
                    
                    let fadeStart = cloudViewDist * 0.6;
                    let alphaScale = 1.0;
                    if (dist > fadeStart) {
                        alphaScale = Math.max(0, 1.0 - (dist - fadeStart) / (cloudViewDist - fadeStart));
                    }
                    if (alphaScale <= 0) continue;
                    
                    let cellColorTop = { ...colorTop, a: colorTop.a * alphaScale };
                    let cellColorBottom = { ...colorBottom, a: colorBottom.a * alphaScale };
                    let cellColorSide1 = { ...colorSide1, a: colorSide1.a * alphaScale };
                    let cellColorSide2 = { ...colorSide2, a: colorSide2.a * alphaScale };
                    
                    let n_px = cloudNoise[(x + 1) + y * cGridSize] > 0.45;
                    let n_nx = cloudNoise[(x - 1) + y * cGridSize] > 0.45;
                    let n_py = cloudNoise[x + (y + 1) * cGridSize] > 0.45;
                    let n_ny = cloudNoise[x + (y - 1) * cGridSize] > 0.45;
                    
                    let addCloudFace = (pts, col) => {
                        let u = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y, z: pts[1].z - pts[0].z };
                        let w = { x: pts[2].x - pts[0].x, y: pts[2].y - pts[0].y, z: pts[2].z - pts[0].z };
                        let nx = u.y*w.z - u.z*w.y, ny = u.z*w.x - u.x*w.z, nz = u.x*w.y - u.y*w.x;
                        let len = Math.hypot(nx, ny, nz);
                        let norm = { x: nx/len, y: ny/len, z: nz/len };
                        
                        addFaceToDynamicBuffer('cloud', pts, col, norm);
                    };
                    
                    addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight} ], cellColorBottom);
                    addCloudFace([ {x: wx, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], cellColorTop);
                    
                    if (!n_nx) addCloudFace([ {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight}, {x: wx, y: wy, z: cloudHeight + cH}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH} ], cellColorSide1);
                    if (!n_px) addCloudFace([ {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH} ], cellColorSide1);
                    if (!n_ny) addCloudFace([ {x: wx, y: wy, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight}, {x: wx + cloudGrid, y: wy, z: cloudHeight + cH}, {x: wx, y: wy, z: cloudHeight + cH} ], cellColorSide2);
                    if (!n_py) addCloudFace([ {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight}, {x: wx, y: wy + cloudGrid, z: cloudHeight + cH}, {x: wx + cloudGrid, y: wy + cloudGrid, z: cloudHeight + cH} ], cellColorSide2);
                }
            }
        }
    }
    
    // Position revolving sun/moon billboards in the sky
    if (gameState === 'overworld') {
        let sunDx = Math.cos(sunTimeAngle) * 200;
        let sunDz = Math.sin(sunTimeAngle) * 200;
        let sunDy = 60;
        
        if (!sunSprite) {
            let texture = ThreeTextureCache.get('☀️', false, false, 1.0);
            sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false }));
            scene.add(sunSprite);
        }
        sunSprite.position.set(camera.position.x + sunDx, camera.position.y + sunDz, camera.position.z + sunDy);
        sunSprite.scale.set(20, 20, 1);
        
        if (!moonSprite) {
            let texture = ThreeTextureCache.get('🌕', false, false, 1.0);
            moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false }));
            scene.add(moonSprite);
        }
        moonSprite.position.set(camera.position.x - sunDx, camera.position.y - sunDz, camera.position.z - sunDy);
        moonSprite.scale.set(16, 16, 1);
    } else {
        if (sunSprite) sunSprite.visible = false;
        if (moonSprite) moonSprite.visible = false;
    }
    
    // Reset CPU activeRenderList counts for dynamic skeletons mesher
    renderCount = 0;
    
    // Render interior building structures
    if (gameState === 'interior') {
        let walls = getInteriorWalls();
        for (let w of walls) {
            if (w.pts) {
                let pt0 = w.pts[0], pt1 = w.pts[1], pt2 = w.pts[2], pt3 = w.pts[3];
                let ux = pt1.x - pt0.x, uy = pt1.y - pt0.y, uz = pt1.z - pt0.z;
                let wx = pt2.x - pt0.x, wy = pt2.y - pt0.y, wz = pt2.z - pt0.z;
                let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                let len = Math.hypot(nx, ny, nz);
                let norm = { x: nx/len, y: ny/len, z: nz/len };
                let color = typeof w.color === 'string' ? hexToRgb(w.color) : w.color;
                addFaceToDynamicBuffer('solid', w.pts, color, norm);
            } else {
                let p1 = w.p1;
                let p2 = w.p2;
                let wh = activeBuilding.wallH;
                let pts = [
                    { x: p1.x, y: p1.y, z: 0 },
                    { x: p2.x, y: p2.y, z: 0 },
                    { x: p2.x, y: p2.y, z: wh },
                    { x: p1.x, y: p1.y, z: wh }
                ];
                let ux = p2.x - p1.x, uy = p2.y - p1.y;
                let norm = { x: -uy, y: ux, z: 0 };
                let len = Math.hypot(norm.x, norm.y);
                norm.x /= len; norm.y /= len;
                let color = typeof w.color === 'string' ? hexToRgb(w.color) : w.color;
                addFaceToDynamicBuffer('solid', pts, color, norm);
            }
        }
        
        let interiorEnts = getInteriorEntities();
        for (let e of interiorEnts) {
            drawBillboardEmoji(e, e.emoji, e.size, e.x, e.y, e.z, e === interactTarget);
        }
    }
    
    // Draw dynamic containers
    for (let e of containers) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(e, e.emoji, e.size, e.x, e.y, e.z, e === interactTarget);
        }
    }
    
    // Draw dynamic animals
    for (let e of animals) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(e, e.emoji, e.size, e.x, e.y, e.z, e === interactTarget, false, e.dead);
        }
    }
    
    // Draw dynamic buildings
    for (let b of buildings) {
        let dist = Math.hypot(b.x - player.x, b.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(b, b.emoji, 4.5, b.x, b.y, b.z, b === interactTarget);
        }
    }
    
    // Draw dynamic dropped items
    for (let e of droppedItems) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (gameState === 'interior' || dist < VIEW_DIST) {
            let itemId = e.item.id;
            let modelName = getItemModelName(e.item);
            let model = modelName ? WEAPON_MODELS[modelName] : null;
            let bobZ = Math.sin(e.hoverTime * 0.08) * 0.12 + 0.08;
            let itemZ = e.z + bobZ;
            
            if (model) {
                let conf = WEAPON_MODEL_CONFIG[modelName] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0 };
                let scale = conf.scale * 1.5;
                let spinAngle = e.hoverTime * 0.012;
                let ryaw = conf.rotZ + spinAngle;
                
                for (let f of model.faces) {
                    let wPts = [];
                    for (let pt of f.pts) {
                        let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, ryaw);
                        wPts.push({
                            x: e.x + p1.x * scale,
                            y: e.y + p1.y * scale,
                            z: itemZ + p1.z * scale + 0.15
                        });
                    }
                    
                    let ux = wPts[1].x - wPts[0].x, uy = wPts[1].y - wPts[0].y, uz = wPts[1].z - wPts[0].z;
                    let wx = wPts[2].x - wPts[0].x, wy = wPts[2].y - wPts[0].y, wz = wPts[2].z - wPts[0].z;
                    let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                    let len = Math.hypot(nx, ny, nz);
                    let norm = { x: nx/len, y: ny/len, z: nz/len };
                    
                    let color = e === interactTarget ? { r: f.color.r + 40, g: f.color.g + 40, b: f.color.b + 40 } : f.color;
                    addFaceToDynamicBuffer('solid', wPts, color, norm);
                }
            } else {
                drawBillboardEmoji(e, e.item.emoji, 0.55, e.x, e.y, itemZ, e === interactTarget, false, false, Math.cos(e.hoverTime * 0.012));
            }
        }
    }
    
    // Draw dynamic torches
    for (let c of torches) {
        let dist = Math.hypot(c.x - player.x, c.y - player.y);
        if (dist < VIEW_DIST) {
            drawBillboardEmoji(c, c.emoji, c.size, c.x, c.y, c.z);
            drawTorchLight(c);
        }
    }
    
    // Draw dynamic projectiles
    for (let p of projectiles) {
        let dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist < VIEW_DIST) {
            // Normalize velocity vector
            let lenV = Math.hypot(p.vx, p.vy, p.vz);
            let dx = lenV > 0 ? p.vx / lenV : 0;
            let dy = lenV > 0 ? p.vy / lenV : 1;
            let dz = lenV > 0 ? p.vz / lenV : 0;
            
            // Find perpendicular vectors
            let tx = Math.abs(dx) < 0.9 ? 1 : 0;
            let ty = Math.abs(dx) < 0.9 ? 0 : 1;
            let tz = 0;
            
            // Cross product: Right = F x T
            let rx = dy * tz - dz * ty;
            let ry = dz * tx - dx * tz;
            let rz = dx * ty - dy * tx;
            let lenR = Math.hypot(rx, ry, rz);
            if (lenR > 0) { rx /= lenR; ry /= lenR; rz /= lenR; }
            
            // Cross product: Up = F x Right
            let ux = dy * rz - dz * ry;
            let uy = dz * rx - dx * rz;
            let uz = dx * ry - dy * rx;
            
            // Bullet dimensions (pointed and elongated)
            let L = 0.12; // Length
            let W = 0.02; // Radius/width
            
            // Define 6 vertices
            let vNose = { x: p.x + dx * L * 0.5, y: p.y + dy * L * 0.5, z: p.z + dz * L * 0.5 };
            let vTail = { x: p.x - dx * L * 0.5, y: p.y - dy * L * 0.5, z: p.z - dz * L * 0.5 };
            let vRight = { x: p.x + rx * W, y: p.y + ry * W, z: p.z + rz * W };
            let vLeft = { x: p.x - rx * W, y: p.y - ry * W, z: p.z - rz * W };
            let vUp = { x: p.x + ux * W, y: p.y + uy * W, z: p.z + uz * W };
            let vDown = { x: p.x - ux * W, y: p.y - uy * W, z: p.z - uz * W };
            
            // Define 8 triangular faces (pointed at nose and tail)
            const FACES = [
                [vNose, vRight, vUp],
                [vNose, vUp, vLeft],
                [vNose, vLeft, vDown],
                [vNose, vDown, vRight],
                [vTail, vUp, vRight],
                [vTail, vLeft, vUp],
                [vTail, vDown, vLeft],
                [vTail, vRight, vDown]
            ];
            
            let color = p.owner === 'player' ? { r: 150, g: 150, b: 150 } : { r: 255, g: 50, b: 50 };
            
            for (let facePts of FACES) {
                let ux_v = facePts[1].x - facePts[0].x;
                let uy_v = facePts[1].y - facePts[0].y;
                let uz_v = facePts[1].z - facePts[0].z;
                let wx_v = facePts[2].x - facePts[0].x;
                let wy_v = facePts[2].y - facePts[0].y;
                let wz_v = facePts[2].z - facePts[0].z;
                
                let nx = uy_v * wz_v - uz_v * wy_v;
                let ny = uz_v * wx_v - ux_v * wz_v;
                let nz = ux_v * wy_v - uy_v * wx_v;
                let lenN = Math.hypot(nx, ny, nz);
                let norm = lenN > 0 ? { x: nx / lenN, y: ny / lenN, z: nz / lenN } : { x: 0, y: 0, z: 1 };
                
                addFaceToDynamicBuffer('solid', facePts, color, norm);
            }
        }
    }
    
    // Update camera basis vectors for particle billboards
    particleCamRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    particleCamUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    particleCamBack.set(0, 0, 1).applyQuaternion(camera.quaternion);

    // Draw dynamic particles (blood, dirt)
    for (let b of bloodParticles) {
        if (b.isLimb && b.is3D) {
            add3DLimbFaces(b, ambientVal);
        } else if (b.isSmoke) {
            // Render camera-facing billboard sprite for smoke
            activeSpritesThisFrame.add(b);
            let sprite = threeDynamicSprites.get(b);
            if (!sprite) {
                let mat = new THREE.SpriteMaterial({
                    map: SmokeTextureCache.get(),
                    transparent: true,
                    depthWrite: false
                });
                sprite = new THREE.Sprite(mat);
                scene.add(sprite);
                threeDynamicSprites.set(b, sprite);
            }
            sprite.position.set(b.x, b.z, b.y);
            sprite.scale.set(b.size * 25, b.size * 25, 1.0);
        } else {
            let size = b.size;
            let pts;
            let norm;
            if (b.onGround) {
                pts = [
                    { x: b.x - size, y: b.y - size, z: b.z },
                    { x: b.x + size, y: b.y - size, z: b.z },
                    { x: b.x + size, y: b.y + size, z: b.z },
                    { x: b.x - size, y: b.y + size, z: b.z }
                ];
                norm = { x: 0, y: 0, z: 1 };
            } else {
                pts = [
                    {
                        x: b.x - particleCamRight.x * size - particleCamUp.x * size,
                        y: b.y - particleCamRight.z * size - particleCamUp.z * size,
                        z: b.z - particleCamRight.y * size - particleCamUp.y * size
                    },
                    {
                        x: b.x + particleCamRight.x * size - particleCamUp.x * size,
                        y: b.y + particleCamRight.z * size - particleCamUp.z * size,
                        z: b.z + particleCamRight.y * size - particleCamUp.y * size
                    },
                    {
                        x: b.x + particleCamRight.x * size + particleCamUp.x * size,
                        y: b.y + particleCamRight.z * size + particleCamUp.z * size,
                        z: b.z + particleCamRight.y * size + particleCamUp.y * size
                    },
                    {
                        x: b.x - particleCamRight.x * size + particleCamUp.x * size,
                        y: b.y - particleCamRight.z * size + particleCamUp.z * size,
                        z: b.z - particleCamRight.y * size + particleCamUp.y * size
                    }
                ];
                norm = { x: particleCamBack.x, y: particleCamBack.z, z: particleCamBack.y };
            }
            addFaceToDynamicBuffer('solid', pts, b.color, norm);
        }
    }
    
    // Draw dynamic coordinate picker candidate box highlight
    if (typeof placementItem !== 'undefined' && placementItem !== null) {
        let target = getPlacementTarget();
        drawBillboardEmoji(placementItem, placementItem.emoji, placementItem.type === 'torch' ? 0.4 : 4.5, target.x, target.y, target.z, false, true);
    }
    
    // Draw targeted voxel highlight box outline
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
            
            if (isFine) {
                aimBox.position.set(mx + 0.5, mz + 0.5, my + 0.5);
                aimBox.scale.set(1, 1, 1);
            } else {
                aimBox.position.set(mx, mz, my);
                aimBox.scale.set(1.4, 1.4, 1.4);
            }
            aimBox.visible = true;
        } else {
            aimBox.visible = false;
        }
    } else {
        aimBox.visible = false;
    }
    
    // Draw pick coordination highlight box
    if (coordPickerActive && lastPickedCoord && lastPickedCoord.world) {
        let w = lastPickedCoord.world;
        pickerBox.position.set(w.x, w.z, w.y);
        pickerBox.visible = true;
    } else {
        pickerBox.visible = false;
    }
    
    // Draw vehicles
    for (let v of vehicles) {
        if (v.type === 'truck') {
            // Draw truck chassis body
            let bodyModel = WEAPON_MODELS['truck_body'];
            if (bodyModel && typeof v.qx !== 'undefined') {
                let conf = VEHICLE_MODEL_CONFIG['truck_body'] || { scale: 1, rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 };
                let bodyQuat = new THREE.Quaternion(v.qx, v.qy, v.qz, v.qw);

                for (let f of bodyModel.faces) {
                    let wPts = [];
                    for (let pt of f.pts) {
                        let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, conf.rotZ);
                        p1.x *= conf.scale; p1.y *= conf.scale; p1.z *= conf.scale;
                        
                        let localPt = new THREE.Vector3(
                            p1.x + (conf.offsetX || 0),
                            p1.y + (conf.offsetY || 0),
                            p1.z + (conf.offsetZ || 0)
                        );
                        let vec = localPt.applyQuaternion(bodyQuat);
                        
                        wPts.push({ x: v.x + vec.x, y: v.y + vec.y, z: v.z + vec.z });
                    }
                    
                    let ux = wPts[1].x - wPts[0].x, uy = wPts[1].y - wPts[0].y, uz = wPts[1].z - wPts[0].z;
                    let wx = wPts[2].x - wPts[0].x, wy = wPts[2].y - wPts[0].y, wz = wPts[2].z - wPts[0].z;
                    let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                    let len = Math.hypot(nx, ny, nz);
                    let norm = { x: nx/len, y: ny/len, z: nz/len };
                    
                    let color = v === interactTarget ? { r: f.color.r + 40, g: f.color.g + 40, b: f.color.b + 40 } : f.color;
                    addFaceToDynamicBuffer('solid', wPts, color, norm);
                }
            }

            // Draw separate wheels at their actual physical transforms
            if (v.wheels) {
                let wheelModel = WEAPON_MODELS['truck_wheel'];
                if (wheelModel) {
                    let conf = VEHICLE_MODEL_CONFIG['truck_wheel'] || { scale: 1, rotX: 0, rotY: 0, rotZ: 0, offsetZ: 0 };
                    for (let w of v.wheels) {
                        let wheelQuat = new THREE.Quaternion(w.qx, w.qy, w.qz, w.qw);

                        for (let f of wheelModel.faces) {
                            let wPts = [];
                            for (let pt of f.pts) {
                                let p1 = rotate3D(pt.x, pt.y, pt.z, conf.rotX, conf.rotY, conf.rotZ);
                                p1.x *= conf.scale; p1.y *= conf.scale; p1.z *= conf.scale;
                                
                                let vec = new THREE.Vector3(p1.x, p1.y, p1.z).applyQuaternion(wheelQuat);
                                
                                wPts.push({ x: w.x + vec.x, y: w.y + vec.y, z: w.z + vec.z + (conf.offsetZ || 0) });
                            }
                            
                            let ux = wPts[1].x - wPts[0].x, uy = wPts[1].y - wPts[0].y, uz = wPts[1].z - wPts[0].z;
                            let wx = wPts[2].x - wPts[0].x, wy = wPts[2].y - wPts[0].y, wz = wPts[2].z - wPts[0].z;
                            let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                            let len = Math.hypot(nx, ny, nz);
                            let norm = { x: nx/len, y: ny/len, z: nz/len };
                            
                            let color = v === interactTarget ? { r: f.color.r + 40, g: f.color.g + 40, b: f.color.b + 40 } : f.color;
                            addFaceToDynamicBuffer('solid', wPts, color, norm);
                        }
                    }
                }
            }
        } else {
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
                    
                    let ux = wPts[1].x - wPts[0].x, uy = wPts[1].y - wPts[0].y, uz = wPts[1].z - wPts[0].z;
                    let wx = wPts[2].x - wPts[0].x, wy = wPts[2].y - wPts[0].y, wz = wPts[2].z - wPts[0].z;
                    let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
                    let len = Math.hypot(nx, ny, nz);
                    let norm = { x: nx/len, y: ny/len, z: nz/len };
                    
                    let color = v === interactTarget ? { r: f.color.r + 40, g: f.color.g + 40, b: f.color.b + 40 } : f.color;
                    addFaceToDynamicBuffer('solid', wPts, color, norm);
                }
            } else {
                drawBillboardEmoji(v, '🚚', 4.0, v.x, v.y, v.z, v === interactTarget);
            }
        }
    }
    
    // Draw dynamic enemies
    for (let e of enemies) {
        let dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < VIEW_DIST) {
            if (e.type === 'zombie3d' || e.type === 'zombie' || e.type === 'experimental') {
                add3DZombieFaces(e, ambientVal);
            } else {
                drawBillboardEmoji(e, e.emoji || '👽', e.size, e.x, e.y, e.z, e === interactTarget, false, e.dead);
            }
        }
    }
    
    // Draw player in third person views
    let shouldRenderPlayer = false;
    if (freecam) {
        shouldRenderPlayer = true;
    } else if (player.inVehicle) {
        shouldRenderPlayer = (player.vehicleView === '3rd_back' || player.vehicleView === '3rd_front');
    } else {
        shouldRenderPlayer = (player.view === '3rd_back' || player.view === '3rd_front');
    }
    if (shouldRenderPlayer) {
        add3DPlayerFaces(ambientVal, realPlayerX, realPlayerY);
    }
    
    // Draw floating damage numbers
    for (let d of damageTexts) {
        let key = d;
        activeSpritesThisFrame.add(key);
        
        let sprite = threeDynamicSprites.get(key);
        let texture = DmgTextCache.get(String(Math.round(d.amt * 10) / 10));
        if (!sprite) {
            let mat = new THREE.SpriteMaterial({ map: texture, transparent: true, fog: true });
            sprite = new THREE.Sprite(mat);
            scene.add(sprite);
            threeDynamicSprites.set(key, sprite);
        }
        sprite.position.set(d.x, d.z + 1.2, d.y);
        sprite.scale.set(1.5, 0.75, 1.0);
        sprite.material.opacity = d.life / 60.0;
        sprite.material.needsUpdate = true;
    }
    
    // Process standard renderPool faces (populate dynamic buffers)
    for (let i = 0; i < renderCount; i++) {
        let o = renderPool[i];
        if (o.type === 'objWorldFace') {
            let bufferType = 'solid';
            let uvs = null;
            if (o.texture) {
                if (o.texture === minecraftZombieSkinImg || o.texture === fallbackSkinCanvas) {
                    bufferType = 'zombie';
                } else if (o.texture === minecraftPlayerSkinImg || o.texture === fallbackPlayerSkinCanvas) {
                    bufferType = 'player';
                }
                uvs = o.uvs;
            }
            
            let normalizedUVs = null;
            if (uvs) {
                let imgW = o.texture.naturalWidth || o.texture.width || 64;
                let imgH = o.texture.naturalHeight || o.texture.height || 64;
                normalizedUVs = uvs.map(pt => ({
                    u: pt.u / imgW,
                    v: 1.0 - (pt.v / imgH)
                }));
            }
            
            let pts = o.pts;
            let ux = pts[1].x - pts[0].x, uy = pts[1].y - pts[0].y, uz = pts[1].z - pts[0].z;
            let wx = pts[2].x - pts[0].x, wy = pts[2].y - pts[0].y, wz = pts[2].z - pts[0].z;
            let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
            let len = Math.hypot(nx, ny, nz);
            let norm = len > 0 ? { x: nx/len, y: ny/len, z: nz/len } : { x: 0, y: 0, z: 1 };
            
            let color = o.flash ? { r: 255, g: 255, b: 255 } : o.color;
            if (o.targeted) {
                color = { r: Math.min(255, color.r + 40), g: Math.min(255, color.g + 40), b: Math.min(255, color.b + 40) };
            }
            if (o.alpha !== undefined && o.alpha < 1.0) {
                color.a = o.alpha;
            }
            
            addFaceToDynamicBuffer(bufferType, pts, color, norm, normalizedUVs);
        }
    }
    
    // Upload dynamic meshes to GPU
    uploadDynamicBuffers();
    
    // Draw held weapon in first person view
    let isFirstPerson = (player.inVehicle ? player.vehicleView === '1st' : player.view === '1st');
    if (isFirstPerson && !freecam) {
        let activeItem = inventory[hotbarSelection];
        let curW = activeItem && activeItem.id ? ITEMS[activeItem.id] : null;
        if (curW) {
            updateHeldWeapon(curW);
            
            let wName = curW.name.toLowerCase();
            let conf = WEAPON_MODEL_CONFIG[wName] || { scale: 8.0, rotX: 0, rotY: Math.PI, rotZ: 0, offsetX: 0.2, offsetY: 0.5, offsetZ: -0.2 };
            
            let isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
            let bobX = isMoving && !flightMode ? Math.cos(gameTime * 200) * 0.01 : 0;
            let bobY = isMoving && !flightMode ? Math.abs(Math.sin(gameTime * 200)) * 0.02 : 0;
            let recoilOffset = fireCooldown > 0 ? (fireCooldown / curW.fireRate) * 0.1 : 0;
            
            let targetOffsetX = isZooming ? (conf.zoomOffsetX !== undefined ? conf.zoomOffsetX : 0) : conf.offsetX;
            let targetOffsetY = isZooming ? (conf.zoomOffsetY !== undefined ? conf.zoomOffsetY : conf.offsetY - 0.1) : conf.offsetY;
            let targetOffsetZ = isZooming ? (conf.zoomOffsetZ !== undefined ? conf.zoomOffsetZ : conf.offsetZ + 0.05) : conf.offsetZ;
            
            // Track player look changes for weight/sway lag
            if (lastPlayerAngle === undefined) lastPlayerAngle = player.angle;
            if (lastPlayerPitch === undefined) lastPlayerPitch = player.pitch;
            
            let deltaAngle = player.angle - lastPlayerAngle;
            let deltaPitch = player.pitch - lastPlayerPitch;
            
            // Normalize radian wrapping for angle
            while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
            while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
            
            lastPlayerAngle = player.angle;
            lastPlayerPitch = player.pitch;
            
            // Base look sway targets
            let targetSwayX = -deltaAngle * 0.4;
            let targetSwayY = deltaPitch * 0.0003;
            
            // Clamp look sway to keep weapon within viewport bounds
            const maxSway = 0.06;
            targetSwayX = Math.max(-maxSway, Math.min(maxSway, targetSwayX));
            targetSwayY = Math.max(-maxSway, Math.min(maxSway, targetSwayY));
            
            // Interpolate sway offsets
            weaponSwayX += (targetSwayX - weaponSwayX) * 0.12;
            weaponSwayY += (targetSwayY - weaponSwayY) * 0.12;
            
            // Figure-8 breathing idle sway
            let idleSwayTime = performance.now() * 0.0015;
            let idleSwayX = Math.sin(idleSwayTime) * 0.004;
            let idleSwayY = Math.cos(idleSwayTime * 2) * 0.004;
            
            // Dampen sway while zoom aiming (ADS)
            let swayMult = isZooming ? 0.25 : 1.0;
            let idleMult = isZooming ? 0.15 : 1.0;
            
            let ox = targetOffsetX + bobX + (weaponSwayX * swayMult) + (idleSwayX * idleMult);
            let oy = targetOffsetY - recoilOffset;
            let oz = targetOffsetZ - bobY + (recoilOffset * 0.2) - (weaponSwayY * swayMult) + (idleSwayY * idleMult);
            
            if (activeItem.id === 'pistol' && player.pistolReloadTimer > 0) {
                let t = player.pistolReloadTimer;
                let dy = 1.0;
                if (t > 50) {
                    dy = (60 - t) / 10;
                } else if (t < 10) {
                    dy = t / 10;
                }
                oz -= dy * 0.8;
            }
            
            heldWeaponGroup.position.set(ox, oz, -oy);
            
            // Apply rotational tilt sway (Roll, Pitch, Yaw)
            let targetRotZ = weaponSwayX * 0.4 * swayMult; // Roll
            let targetRotX = -weaponSwayY * 1.2 * swayMult; // Pitch
            let targetRotY = weaponSwayX * 0.3 * swayMult; // Yaw
            
            heldWeaponGroup.rotation.x += (targetRotX - heldWeaponGroup.rotation.x) * 0.1;
            heldWeaponGroup.rotation.y += (targetRotY - heldWeaponGroup.rotation.y) * 0.1;
            heldWeaponGroup.rotation.z += (targetRotZ - heldWeaponGroup.rotation.z) * 0.1;
        } else {
            heldWeaponGroup.visible = false;
            heldWeaponGroup.rotation.set(0, 0, 0);
            weaponSwayX = 0;
            weaponSwayY = 0;
            lastPlayerAngle = undefined;
            lastPlayerPitch = undefined;
        }
    } else {
        heldWeaponGroup.visible = false;
        heldWeaponGroup.rotation.set(0, 0, 0);
        weaponSwayX = 0;
        weaponSwayY = 0;
        lastPlayerAngle = undefined;
        lastPlayerPitch = undefined;
    }
    
    // Clean up dynamic sprites that were not rendered
    for (let [key, sprite] of threeDynamicSprites.entries()) {
        if (!activeSpritesThisFrame.has(key)) {
            scene.remove(sprite);
            threeDynamicSprites.delete(key);
        }
    }
    
    // Clean up torch point lights that were not rendered
    for (let [key, light] of threePointLights.entries()) {
        if (!activePointLightsThisFrame.has(key)) {
            scene.remove(light);
            threePointLights.delete(key);
        }
    }
    
    // Clean up torch glows that were not rendered
    for (let [key, glow] of threeTorchGlows.entries()) {
        if (!activeTorchGlowsThisFrame.has(key)) {
            scene.remove(glow);
            threeTorchGlows.delete(key);
        }
    }
    
    // Orient and apply ambient emissive boost to all active billboard meshes to match daytime surroundings
    let dayFactor = 0.0;
    if (gameState === 'overworld') {
        dayFactor = Math.max(0.0, (ambientVal - 0.2) / 0.8);
    }
    
    // Tone down the daytime blue sky tint by mixing with grayscale average
    let avg = (ambientR + ambientG + ambientB) / 3;
    let mixedR = ambientR * 0.25 + avg * 0.75;
    let mixedG = ambientG * 0.25 + avg * 0.75;
    let mixedB = ambientB * 0.25 + avg * 0.75;
    
    let emissiveIntensity = dayFactor * 0.28;
    let emissiveColor = new THREE.Color(
        mixedR * emissiveIntensity,
        mixedG * emissiveIntensity,
        mixedB * emissiveIntensity
    );

    // Update muzzle flashPointLight and visual sprite, and spawn smoke particles
    if (player.muzzleFlashTick > 0 && curW && activeItem.id === 'pistol') {
        let isFirstPerson = (player.inVehicle ? player.vehicleView === '1st' : player.view === '1st');
        if (isFirstPerson && !freecam) {
            // Attach light to camera in first person so it is centered and directly in front of the player at all times
            if (muzzleFlashLight.parent !== camera) {
                if (muzzleFlashLight.parent) muzzleFlashLight.parent.remove(muzzleFlashLight);
                camera.add(muzzleFlashLight);
            }
            muzzleFlashLight.position.set(0.0, 0.0, -1.2); // centered, 1.2 units forward
            muzzleFlashLight.intensity = 3.0;
        } else {
            // Attach light to scene in third person/freecam
            if (muzzleFlashLight.parent !== scene) {
                if (muzzleFlashLight.parent) muzzleFlashLight.parent.remove(muzzleFlashLight);
                scene.add(muzzleFlashLight);
            }
            let muzzlePos = getMuzzleWorldPos();
            if (muzzlePos) {
                muzzleFlashLight.position.set(muzzlePos.x, muzzlePos.z, muzzlePos.y);
                muzzleFlashLight.intensity = 3.0;
            }
        }
        muzzleFlashSprite.visible = isFirstPerson && !freecam;
        muzzleFlashSprite.material.rotation = Math.random() * Math.PI * 2;
    } else {
        muzzleFlashLight.intensity = 0.0;
        muzzleFlashSprite.visible = false;
    }
    
    // Spawn smoke particles if barrel is hot
    if (curW && activeItem.id === 'pistol' && player.pistolSmokeTimer > 0) {
        if (Math.random() < 0.4) {
            let muzzlePos = getMuzzleWorldPos();
            if (muzzlePos) {
                let angle = player.angle + (Math.random() - 0.5) * 0.4;
                let speed = 0.001 + Math.random() * 0.002; // slower horizontal expansion
                bloodParticles.push({
                    x: muzzlePos.x,
                    y: muzzlePos.y,
                    z: muzzlePos.z,
                    vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.001,
                    vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 0.001,
                    vz: 0.005 + Math.random() * 0.005, // faster rising speed
                    color: { r: 220, g: 220, b: 220 },
                    life: 40 + Math.floor(Math.random() * 20),
                    maxLife: 60,
                    startSize: 0.004, // 50% smaller starting size
                    size: 0.004,
                    isSmoke: true
                });
            }
        }
    }

    for (let mesh of activeBillboardMeshes) {
        mesh.quaternion.copy(camera.quaternion);
        if (mesh.material && mesh.material.emissive) {
            mesh.material.emissive.copy(emissiveColor);
        }
    }
    
    // Run WebGL Render Call
    renderer.render(scene, camera);
    
    // Update HTML overlay indicators
    let crosshairEl = document.getElementById('crosshair');
    if (crosshairEl) {
        if (isFirstPerson && !freecam) {
            crosshairEl.className = 'visible';
            if (fireCooldown > 0) crosshairEl.classList.add('recoil');
            if (isZooming) crosshairEl.classList.add('zoomed');
        } else {
            crosshairEl.className = '';
        }
    }
    
    let submergedEl = document.getElementById('submerged-overlay');
    if (submergedEl) {
        if (player.isSubmerged) {
            submergedEl.classList.add('visible');
        } else {
            submergedEl.classList.remove('visible');
        }
    }
    
    // Process picked coordinate candidate raycasting
    if (triggerCoordPick) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        if (document.pointerLockElement === canvas) {
            mouse.x = 0;
            mouse.y = 0;
        } else {
            let rect = canvas.getBoundingClientRect();
            mouse.x = ((pickX_screen - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((pickY_screen - rect.top) / rect.height) * 2 + 1;
        }
        
        raycaster.setFromCamera(mouse, camera);
        
        const targets = [];
        for (let chunk of threeChunks.values()) {
            if (chunk.solidMesh) targets.push(chunk.solidMesh);
        }
        
        const intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            const hit = intersects[0];
            const p = hit.point;
            
            bestPickPoint = { x: p.x, y: p.z, z: p.y };
            bestPickDepth = hit.distance;
            
            bestPickVehicle = null;
            for (let v of vehicles) {
                let dist = Math.hypot(v.x - bestPickPoint.x, v.y - bestPickPoint.y, v.z - bestPickPoint.z);
                if (dist < 4.0) {
                    bestPickVehicle = v;
                    break;
                }
            }
            
            let localCoords = null;
            let vType = null;
            if (bestPickVehicle) {
                let v = bestPickVehicle;
                vType = v.type;
                let cosA = Math.cos(v.angle);
                let sinA = Math.sin(v.angle);
                let dx = (bestPickPoint.x - v.x) * cosA + (bestPickPoint.y - v.y) * sinA;
                let dy = -(bestPickPoint.x - v.x) * sinA + (bestPickPoint.y - v.y) * cosA;
                let dz = bestPickPoint.z - v.z;
                localCoords = { dx, dy, dz };
            }
            
            lastPickedCoord = {
                world: bestPickPoint,
                local: localCoords,
                vehicleType: vType,
                time: performance.now()
            };
            
            console.log("PICKED COORDS (Raycast):", lastPickedCoord);
            if (window.updatePickerPanelUI) {
                window.updatePickerPanelUI();
            }
        }
        triggerCoordPick = false;
    }
    
    // Restore player coordinate states
    player.x = realPlayerX;
    player.y = realPlayerY;
}