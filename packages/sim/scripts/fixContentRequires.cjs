// Rewrites `require("@midnight-garage/content")` in the compiled CLI output
// to a relative path into the same dist tree's compiled copy of content.
//
// `@midnight-garage/content`'s package.json points its "exports" straight at
// `./src/index.ts` (a live-source export Vite/Vitest can transform on the
// fly) - plain `node`, which the CLI runs under, cannot execute TypeScript
// or resolve that specifier, so any bare-specifier `require()` left in the
// compiled JS fails at runtime with ERR_MODULE_NOT_FOUND. tsconfig.cli.json
// adds `content/src/index.ts` as an explicit compile root so tsc emits a
// real `dist/packages/content/src/index.js` alongside the CLI's own output;
// this script is what points the bare-specifier requires at it.
const fs = require('node:fs')
const path = require('node:path')

const dir = process.argv[2]
if (!dir) {
  throw new Error('usage: node fixContentRequires.cjs <dir>')
}

const SPECIFIER = '@midnight-garage/content'
const target = path.join(dir, 'packages', 'content', 'src', 'index.js')
if (!fs.existsSync(target)) {
  throw new Error(
    `expected a compiled content entry point at ${target} - is content/src/index.ts still an explicit include root in tsconfig.cli.json?`,
  )
}

function walk(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      fixFile(entryPath)
    }
  }
}

function fixFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8')
  if (!source.includes(`require("${SPECIFIER}")`)) return

  let relative = path.relative(path.dirname(filePath), target).replace(/\\/g, '/')
  relative = relative.replace(/\.js$/, '')
  if (!relative.startsWith('.')) relative = './' + relative

  const rewritten = source.split(`require("${SPECIFIER}")`).join(`require("${relative}")`)
  fs.writeFileSync(filePath, rewritten)
}

walk(dir)
