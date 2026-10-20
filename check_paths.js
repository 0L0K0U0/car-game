const fs = require('fs');
const path = require('path');

const files = [
  'index.html', 'style.css', 'main.js', 'config.js',
  'world.js', 'vehicle.js', 'traffic.js', 'adas.js',
  'events.js', 'ui.js', 'camera.js', 'audio.js', 'i18n.js'
];

let issues = 0;
files.forEach(f => {
  const filePath = path.join(__dirname, f);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((l, idx) => {
    // Check for localhost
    if (/localhost/i.test(l)) {
      console.log(`[Issue - localhost] ${f}:${idx + 1}: ${l.trim()}`);
      issues++;
    }
    // Check for absolute href/src/import starting with /
    if (/href\s*=\s*['"]\//i.test(l) || /src\s*=\s*['"]\//i.test(l)) {
      console.log(`[Issue - absolute HTML path] ${f}:${idx + 1}: ${l.trim()}`);
      issues++;
    }
    if (/from\s*['"]\//i.test(l) || /import\s*\(['"]\//i.test(l)) {
      console.log(`[Issue - absolute JS import] ${f}:${idx + 1}: ${l.trim()}`);
      issues++;
    }
    if (/['"]\/libs\//i.test(l)) {
      console.log(`[Issue - /libs/] ${f}:${idx + 1}: ${l.trim()}`);
      issues++;
    }
  });
});

console.log(`Path check finished. Total issues found: ${issues}`);
