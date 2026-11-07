// Copies the game into game/ (and its icon into build/) so electron-builder can bundle it into the Mac app.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'glam-bee'), dest = path.join(__dirname, 'game');
const items = ['index.html', 'game.js', 'words.js', 'voice.js', 'manifest.json', 'icons', 'audio'];
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const it of items) fs.cpSync(path.join(src, it), path.join(dest, it), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
fs.copyFileSync(path.join(src, 'icons', 'icon-1024.png'), path.join(__dirname, 'build', 'icon.png'));
console.log('Copied game into', dest);
