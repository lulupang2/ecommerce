import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  generateDeploymentEnv,
  serializeEnv,
  validateDeploymentEnv,
} from './config.mjs';

const root = process.cwd();
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'techzone-deployment-'));
const envPath = path.join(temporaryDirectory, '.env.demo');
const values = generateDeploymentEnv({
  domain: 'demo.techzone.kr',
  email: 'owner@techzone.kr',
});
const errors = validateDeploymentEnv(values);
if (errors.length) throw new Error(`Generated deployment environment is invalid: ${errors.join(' ')}`);

await fs.writeFile(envPath, serializeEnv(values), { encoding: 'utf8', mode: 0o600 });

const compose = spawnSync(process.platform === 'win32' ? 'docker.exe' : 'docker', [
  'compose',
  '--env-file', envPath,
  '-f', path.join(root, 'docker-compose.yml'),
  '-f', path.join(root, 'infra', 'docker', 'compose.demo.yml'),
  'config',
  '--quiet',
], { cwd: root, encoding: 'utf8' });

if (compose.error) throw compose.error;
if (compose.status !== 0) {
  throw new Error(`Demo Compose configuration is invalid: ${(compose.stderr || compose.stdout).trim()}`);
}

const releaseScript = await fs.readFile(
  path.join(root, 'tools', 'deployment', 'remote-release.sh'),
  'utf8',
);
const shell = spawnSync('bash', ['-n'], {
  cwd: root,
  encoding: 'utf8',
  input: releaseScript.replace(/\r\n/g, '\n'),
});

if (shell.error) throw shell.error;
if (shell.status !== 0) {
  throw new Error(`Remote release script is invalid: ${(shell.stderr || shell.stdout).trim()}`);
}

console.log(JSON.stringify({
  status: 'passed',
  checks: ['generated_secrets', 'rsa_key', 'private_bindings', 'compose_merge', 'remote_release_shell'],
  secretValuesPrinted: false,
}));
