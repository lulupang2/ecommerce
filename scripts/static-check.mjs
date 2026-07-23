import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
async function files(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  }));
  return nested.flat();
}
const candidates = (await Promise.all(['backend', 'scripts', 'tests'].map(files))).flat()
  .filter(file => /\.(c?js|mjs)$/.test(file));
for (const file of candidates) {
  await exec(process.execPath, ['--check', file]);
}
console.log(`Checked ${candidates.length} Node files.`);
