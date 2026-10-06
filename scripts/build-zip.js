#!/usr/bin/env node
/**
 * Builds a clean production zip for the Chrome Web Store.
 * Excludes developer files (.git, node_modules, python scripts, tests, etc.)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const version = manifest.version || '1.0.0';
const zipName = `extension-v${version}.zip`;
const zipPath = path.join(distDir, zipName);

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const includedItems = [
  'manifest.json',
  'background.js',
  'content.js',
  'styles.css',
  'icons'
];

try {
  execSync(`zip -r "${zipPath}" ${includedItems.join(' ')}`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log(`\n Successfully packaged Chrome extension: dist/${zipName}`);
} catch (err) {
  console.error('Failed to create zip package:', err);
  process.exit(1);
}
