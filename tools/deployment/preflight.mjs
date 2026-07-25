import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv, validateDeploymentEnv } from './config.mjs';

function argument(name) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const root = process.cwd();
const positional = process.argv.slice(2).filter(value => !value.startsWith('--'));
const envPath = path.resolve(argument('env') || positional[0] || '.env.demo');
const source = await fs.readFile(envPath, 'utf8').catch(error => {
  if (error.code === 'ENOENT') throw new Error(`${envPath} 파일이 없습니다. npm run demo:env를 먼저 실행하세요.`);
  throw error;
});
const values = parseEnv(source);
const errors = validateDeploymentEnv(values);

if (!process.argv.includes('--skip-docker')) {
  const compose = spawnSync(process.platform === 'win32' ? 'docker.exe' : 'docker', [
    'compose',
    '--env-file', envPath,
    '-f', path.join(root, 'docker-compose.yml'),
    '-f', path.join(root, 'infra', 'docker', 'compose.demo.yml'),
    'config',
    '--quiet',
  ], { cwd: root, encoding: 'utf8' });

  if (compose.error) {
    errors.push(`Docker Compose: ${compose.error.message}`);
  } else if (compose.status !== 0) {
    errors.push(`Docker Compose: ${(compose.stderr || compose.stdout).trim()}`);
  }
}

if (errors.length) {
  console.error(JSON.stringify({ status: 'failed', envFile: envPath, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'ready',
  envFile: envPath,
  domain: values.DEMO_DOMAIN,
  checks: ['secrets', 'rsa_key', 'origin', 'private_bindings', 'compose_config'],
  secretValuesPrinted: false,
}, null, 2));
