import fs from 'fs';
import path from 'path';

const root = process.cwd();
const srcDir = path.join(root, 'src');

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') walk(p, files);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
  return files;
}

const files = walk(srcDir);
const allContent = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const allText = [...allContent.values()].join('\n');

function getImportPaths(content) {
  const imports = [];
  for (const m of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) imports.push(m[1]);
  for (const m of content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.push(m[1]);
  return imports;
}

function resolveImport(fromFile, imp) {
  if (!imp.startsWith('.') && !imp.startsWith('@/')) return null;
  const base = imp.startsWith('@/') ? path.join(srcDir, imp.slice(2)) : path.join(path.dirname(fromFile), imp);
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return path.normalize(p);
  }
  return null;
}

const importedFiles = new Set();
for (const [f, content] of allContent) {
  for (const imp of getImportPaths(content)) {
    const resolved = resolveImport(f, imp);
    if (resolved) importedFiles.add(resolved);
  }
}

function rel(f) {
  return path.relative(root, f).replace(/\\/g, '/');
}

function getNamedExports(content) {
  const names = new Set();
  for (const m of content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/export\s+class\s+(\w+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/export\s+type\s+(\w+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/export\s+interface\s+(\w+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/export\s+enum\s+(\w+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const asMatch = trimmed.match(/(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?/);
      if (asMatch) names.add(asMatch[2] || asMatch[1]);
    }
  }
  return [...names];
}

function countSymbolUsage(symbol, excludeFile) {
  let count = 0;
  const patterns = [
    new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*\\b${symbol}\\b[^}]*\\}`, 'g'),
    new RegExp(`export\\s*\\{[^}]*\\b${symbol}\\b`, 'g'),
    new RegExp(`\\b${symbol}\\b`, 'g'),
  ];
  for (const [f, content] of allContent) {
    if (f === excludeFile) continue;
    if (patterns[0].test(content) || patterns[1].test(content)) count += 10;
    else {
      patterns[2].lastIndex = 0;
      const matches = content.match(patterns[2]);
      if (matches) count += matches.length;
    }
  }
  return count;
}

function isFileEntryPoint(f) {
  const base = path.basename(f);
  return base === 'main.tsx' || base === 'App.tsx';
}

function categorize(f) {
  if (f.includes('/components/')) return 'component';
  if (f.includes('/hooks/') || path.basename(f).startsWith('use')) return 'hook';
  if (f.includes('/types/') || f.endsWith('/types.ts')) return 'type';
  return 'utility';
}

console.log('=== UNUSED FILES (never imported) ===');
const unusedFiles = [];
for (const f of files) {
  if (isFileEntryPoint(f)) continue;
  if (!importedFiles.has(path.normalize(f))) {
    unusedFiles.push({ file: rel(f), category: categorize(f) });
    console.log(`[${categorize(f)}] ${rel(f)}`);
  }
}

console.log('\n=== UNUSED NAMED EXPORTS (in imported files) ===');
for (const f of files) {
  if (!importedFiles.has(path.normalize(f)) && !isFileEntryPoint(f)) continue;
  const content = allContent.get(f);
  const exports = getNamedExports(content);
  for (const name of exports) {
    const usage = countSymbolUsage(name, f);
    if (usage === 0) {
      console.log(`[${categorize(f)}] ${rel(f)} :: ${name}`);
    }
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Total source files: ${files.length}`);
console.log(`Never imported files: ${unusedFiles.length}`);
