const fs = require('fs');

function inspectGlb(filename) {
    const buffer = fs.readFileSync(filename);
    const magic = buffer.toString('utf8', 0, 4);
    if (magic !== 'glTF') {
        console.error('Not a GLTF file');
        return;
    }
    const version = buffer.readUInt32LE(4);
    const totalLength = buffer.readUInt32LE(8);
    console.log(`GLB file: ${filename}, Version: ${version}, Length: ${totalLength} bytes`);

    // Read first chunk (should be JSON)
    const chunkLength = buffer.readUInt32LE(12);
    const chunkType = buffer.readUInt32LE(16);
    if (chunkType !== 0x4E4F534A) {
        console.error('First chunk is not JSON');
        return;
    }

    const jsonText = buffer.toString('utf8', 20, 20 + chunkLength);
    const gltf = JSON.parse(jsonText);

    console.log('Meshes:');
    if (gltf.meshes) {
        gltf.meshes.forEach((mesh, idx) => {
            console.log(`  Mesh ${idx}: ${mesh.name || 'unnamed'}`);
            mesh.primitives.forEach((prim, pIdx) => {
                console.log(`    Primitive ${pIdx}: mode = ${prim.mode === undefined ? 4 : prim.mode}`);
                if (prim.attributes) {
                    console.log(`      Attributes: ${Object.keys(prim.attributes).join(', ')}`);
                }
            });
        });
    } else {
        console.log('  No meshes found.');
    }

    console.log('Nodes:');
    if (gltf.nodes) {
        gltf.nodes.forEach((node, idx) => {
            console.log(`  Node ${idx}: ${node.name || 'unnamed'} (mesh = ${node.mesh !== undefined ? node.mesh : 'none'}, children = ${node.children ? node.children.join(', ') : 'none'})`);
        });
    }

    if (gltf.animations) {
        console.log(`Animations: ${gltf.animations.length} animations found.`);
    } else {
        console.log('No animations found.');
    }

    if (gltf.skins) {
        console.log(`Skins: ${gltf.skins.length} skins found.`);
    } else {
        console.log('No skins found.');
    }
}

inspectGlb('models/pistol.glb');
