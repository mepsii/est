// build_wasm.js
const fs = require('fs');
const { execSync } = require('child_process');

// Ensure build directory exists
fs.mkdirSync('build', { recursive: true });

console.log("Compiling AssemblyScript to WASM...");
try {
  execSync('npx -y --package assemblyscript asc assembly/world.ts --outFile build/world.wasm --optimize --exportRuntime', { stdio: 'inherit' });
  console.log("AssemblyScript compilation succeeded!");
} catch (err) {
  console.error("AssemblyScript compilation failed!", err);
  process.exit(1);
}

console.log("Encoding WASM to Base64...");
try {
  const wasmBuffer = fs.readFileSync('build/world.wasm');
  const wasmBase64 = wasmBuffer.toString('base64');
  
  const jsContent = `// Automatically generated from WASM. Do not edit directly.
const WASM_BASE64 = "${wasmBase64}";
`;
  fs.writeFileSync('src/core/world_wasm_binary.js', jsContent);
  console.log("Successfully generated src/core/world_wasm_binary.js!");
} catch (err) {
  console.error("Encoding to Base64 failed!", err);
  process.exit(1);
}
