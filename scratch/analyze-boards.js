// Test script to check all board types and component types
const fs = require('fs');

const boardCatalog = fs.readFileSync('src/features/canvas/boardCatalog.ts', 'utf8');
const boardTypes = [...boardCatalog.matchAll(/board\('([A-Z0-9_]+)'/g)].map(m => m[1]);
console.log('Total board types:', boardTypes.length);

const footprints = {};
for (const match of boardCatalog.matchAll(/board\('([A-Z0-9_]+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/g)) {
  const [_, type, name, family, footprint] = match;
  footprints[footprint] = (footprints[footprint] || 0) + 1;
}
console.log('Footprint distribution:', footprints);
