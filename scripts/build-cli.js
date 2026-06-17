#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building CLI package...');

try {
  const rootDir = path.join(__dirname, '..');
  const sharedDir = path.join(rootDir, 'packages/shared');
  const cliDir = path.join(rootDir, 'packages/cli');
  const serverDir = path.join(rootDir, 'packages/server');
  const uiDir = path.join(rootDir, 'packages/ui');

  // Step 0: Ensure shared package is built first
  console.log('Ensuring shared package is built...');
  const sharedDistDir = path.join(sharedDir, 'dist');
  if (!fs.existsSync(sharedDistDir) || !fs.existsSync(path.join(sharedDistDir, 'index.js'))) {
    console.log('Shared package not found, building it first...');
    execSync('node scripts/build-shared.js', {
      stdio: 'inherit',
      cwd: rootDir
    });
  }

  // Step 1: Build Server package first
  console.log('Building Server package...');
  execSync('node scripts/build-server.js', {
    stdio: 'inherit',
    cwd: rootDir
  });

  // Step 2: Build UI package
  console.log('Building UI package...');
  execSync('pnpm build', {
    stdio: 'inherit',
    cwd: uiDir
  });

  // Step 3: Create CLI dist directory
  const cliDistDir = path.join(cliDir, 'dist');
  if (!fs.existsSync(cliDistDir)) {
    fs.mkdirSync(cliDistDir, { recursive: true });
  }

  // Step 4: Build the CLI application
  console.log('Building CLI application...');
  execSync('esbuild src/cli.ts --bundle --platform=node --minify --tree-shaking=true --outfile=dist/cli.js', {
    stdio: 'inherit',
    cwd: cliDir
  });

  // Step 5: Copy tiktoken WASM file from server dist to CLI dist
  console.log('Copying tiktoken_bg.wasm from server to CLI dist...');
  const tiktokenSource = path.join(serverDir, 'dist/tiktoken_bg.wasm');
  const tiktokenDest = path.join(cliDistDir, 'tiktoken_bg.wasm');

  if (fs.existsSync(tiktokenSource)) {
    fs.copyFileSync(tiktokenSource, tiktokenDest);
    console.log('✓ tiktoken_bg.wasm copied successfully!');
  } else {
    console.warn('⚠ Warning: tiktoken_bg.wasm not found in server dist, skipping...');
  }

  // Step 6: Copy UI index.html from UI dist to CLI dist
  console.log('Copying index.html from UI to CLI dist...');
  const uiSource = path.join(uiDir, 'dist/index.html');
  const uiDest = path.join(cliDistDir, 'index.html');

  if (fs.existsSync(uiSource)) {
    fs.copyFileSync(uiSource, uiDest);
    console.log('✓ index.html copied successfully!');
  } else {
    console.warn('⚠ Warning: index.html not found in UI dist, skipping...');
  }

  // Step 6.5: Copy the full UI dist (index.html + fonts/ + assets/) into the
  // server's dist directory. The server's fastifyStatic is rooted at
  // packages/server/dist/, so the UI must live there for /ui/ to serve
  // index.html. Skipped silently if the UI dist is missing (e.g. someone
  // ran a partial build that only rebuilt the server) — the server will
  // simply 404 on /ui/ in that case, which is the right behavior.
  console.log('Copying UI assets into server dist for fastifyStatic...');
  const uiDistDir = path.join(uiDir, 'dist');
  const serverDistDir = path.join(serverDir, 'dist');
  if (fs.existsSync(uiDistDir)) {
    fs.cpSync(uiDistDir, serverDistDir, { recursive: true });
    console.log('✓ UI assets copied to server dist successfully!');
  } else {
    console.warn('⚠ Warning: UI dist not found, skipping copy to server dist...');
  }

  // Step 7: Copy CLI dist to project root
  console.log('\nCopying CLI dist to project root...');
  const rootDistDir = path.join(rootDir, 'dist');

  // Remove existing dist directory in root if it exists
  if (fs.existsSync(rootDistDir)) {
    fs.rmSync(rootDistDir, { recursive: true, force: true });
  }

  // Copy CLI dist to root
  fs.cpSync(cliDistDir, rootDistDir, { recursive: true });
  console.log('✓ CLI dist copied to project root successfully!');

  console.log('\nCLI build completed successfully!');
  console.log('\nCLI dist contents:');
  const files = fs.readdirSync(cliDistDir);
  files.forEach(file => {
    const filePath = path.join(cliDistDir, file);
    const stats = fs.statSync(filePath);
    const size = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  - ${file} (${size} MB)`);
  });
} catch (error) {
  console.error('CLI build failed:', error.message);
  process.exit(1);
}
