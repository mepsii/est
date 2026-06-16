const fs = require('fs');

function analyzeObj(filename) {
    const text = fs.readFileSync(filename, 'utf-8');
    let vCount = 0;
    let fCount = 0;
    const lines = text.split('\n');
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('v ')) vCount++;
        else if (line.startsWith('f ')) fCount++;
    }
    console.log(`${filename}: ${vCount} vertices, ${fCount} faces`);
}

analyzeObj('models/pistol.obj');
analyzeObj('models/shotgun.obj');
analyzeObj('models/smg.obj');
