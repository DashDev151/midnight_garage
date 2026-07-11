// Marks a tsc build output directory as CommonJS, overriding the
// package's own "type": "module" for that subtree - Node walks up to the
// nearest package.json to decide how to interpret a .js file, and
// without this, compiled CommonJS `require()` calls would be rejected as
// invalid ES module syntax. Written as a standalone .cjs script (not the
// package.json "scripts" shell) to stay cross-platform (Windows/POSIX)
// without shell-quoting a JSON literal.
const fs = require('node:fs')
const path = require('node:path')

const dir = process.argv[2]
if (!dir) {
  throw new Error('usage: node mark-commonjs.cjs <dir>')
}

fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n')
