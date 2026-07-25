import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
  }
  return files;
}

function localMarkdownTargets(source) {
  const targets = [];
  const linkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (
      target.startsWith('#')
      || /^[a-z][a-z0-9+.-]*:/i.test(target)
      || target.startsWith('//')
    ) continue;
    targets.push(target);
  }
  return targets;
}

function documentedNpmScripts(source) {
  return [...source.matchAll(/\bnpm run(?: --silent)? ([a-zA-Z0-9:_-]+)/g)]
    .map(match => match[1]);
}

export async function validateDocumentation(root = process.cwd()) {
  const docsDirectory = path.join(root, 'docs');
  const files = [path.join(root, 'README.md'), ...await markdownFiles(docsDirectory)];
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const availableScripts = new Set(Object.keys(packageJson.scripts || {}));
  const errors = [];
  let linksChecked = 0;
  let commandsChecked = 0;

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const relativeFile = path.relative(root, file).replaceAll(path.sep, '/');

    for (const rawTarget of localMarkdownTargets(source)) {
      const withoutFragment = rawTarget.split('#')[0].split('?')[0];
      if (!withoutFragment) continue;
      const decodedTarget = decodeURIComponent(withoutFragment);
      const resolved = path.resolve(path.dirname(file), decodedTarget);
      linksChecked += 1;
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        errors.push(`${relativeFile}: 저장소 밖을 가리키는 링크 ${rawTarget}`);
        continue;
      }
      try {
        await fs.access(resolved);
      } catch {
        errors.push(`${relativeFile}: 존재하지 않는 링크 ${rawTarget}`);
      }
    }

    for (const command of documentedNpmScripts(source)) {
      commandsChecked += 1;
      if (!availableScripts.has(command)) {
        errors.push(`${relativeFile}: package.json에 없는 npm script ${command}`);
      }
    }
  }

  return { errors, filesChecked: files.length, linksChecked, commandsChecked };
}

async function main() {
  const result = await validateDocumentation();
  if (result.errors.length > 0) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: 'passed', ...result, errors: undefined }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
