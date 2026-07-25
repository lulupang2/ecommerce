import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', 'apps', 'packages'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(existsSync)
  .filter(file => /\.(?:ts|tsx|js|jsx|cjs|mjs)$/.test(file));

const violations = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (/from\s+['"]@techzone\/[^'"]+\/src\//.test(source)) {
    violations.push(`${file}: workspace package src 경로 직접 import`);
  }
  if (/apps\/services\/[^/]+\/src/.test(source)) {
    violations.push(`${file}: 다른 서비스 소스 직접 import`);
  }
  if (/apps\/services\/[^/]+\/drizzle/.test(source)) {
    violations.push(`${file}: 다른 서비스 DB migration 직접 import`);
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`Workspace boundary check passed (${files.length} files).`);
