import fs from 'node:fs/promises';
import path from 'node:path';
import { generateDeploymentEnv, serializeEnv } from './config.mjs';

function argument(name) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const positional = process.argv.slice(2).filter(value => !value.startsWith('--'));
const domain = argument('domain') || positional[0];
const output = path.resolve(argument('output') || '.env.demo');

if (!domain || positional.length > 1) {
  console.error('사용법: npm run demo:env -- demo.example.kr [--output=.env.demo]');
  process.exit(1);
}

const values = generateDeploymentEnv({ domain: domain.toLowerCase() });

try {
  await fs.writeFile(output, serializeEnv(values), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error.code === 'EEXIST') {
    throw new Error(`${output} 파일이 이미 존재합니다. 기존 비밀값을 보존하기 위해 덮어쓰지 않았습니다.`);
  }
  throw error;
}

console.log(JSON.stringify({
  status: 'created',
  output,
  domain: values.DEMO_DOMAIN,
  secretValuesPrinted: false,
}));
