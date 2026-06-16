const fs = require('fs');

function inspectGlbAccessors(filename) {
    const buffer = fs.readFileSync(filename);
    const chunkLength = buffer.readUInt32LE(12);
    const jsonText = buffer.toString('utf8', 20, 20 + chunkLength);
    const gltf = JSON.parse(jsonText);

    console.log('Accessors:');
    if (gltf.accessors) {
        gltf.accessors.forEach((acc, idx) => {
            console.log(`  Accessor ${idx}: type = ${acc.type}, componentType = ${acc.componentType}, count = ${acc.count}, bufferView = ${acc.bufferView}`);
        });
    }

    console.log('\nMesh Primitives:');
    if (gltf.meshes) {
        gltf.meshes.forEach((mesh, idx) => {
            console.log(`  Mesh ${idx}: ${mesh.name}`);
            mesh.primitives.forEach((prim, pIdx) => {
                console.log(`    Primitive ${pIdx}:`);
                console.log(`      Indices accessor: ${prim.indices}`);
                console.log(`      Attributes:`);
                for (let attr in prim.attributes) {
                    console.log(`        ${attr}: accessor ${prim.attributes[attr]}`);
                }
            });
        });
    }
}

inspectGlbAccessors('models/pistol.glb');
