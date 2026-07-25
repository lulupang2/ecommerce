import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeployableDomain, parseEnv } from './config.mjs';

export function buildSmokeTargets(domain) {
  if (!isDeployableDomain(domain)) throw new Error('스모크 테스트에는 실제 공개 도메인이 필요합니다.');
  return [
    { name: 'gateway', url: `https://${domain}/health/ready` },
    { name: 'storefront', url: `https://${domain}/` },
    { name: 'admin', url: `https://${domain}/admin/` },
    { name: 'media', url: `https://media.${domain}/minio/health/live` },
  ];
}

export async function runSmokeTest({
  domain,
  attempts = 30,
  intervalMs = 10_000,
  timeoutMs = 10_000,
  fetchImpl = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onAttempt = () => {},
}) {
  const targets = buildSmokeTargets(domain);
  let failures = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    failures = [];
    for (const target of targets) {
      try {
        const response = await fetchImpl(target.url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'user-agent': 'techzone-deployment-smoke/1.0' },
        });
        if (!response.ok) failures.push(`${target.name}: HTTP ${response.status}`);
      } catch (error) {
        failures.push(`${target.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    onAttempt({ attempt, attempts, failures: [...failures] });
    if (failures.length === 0) {
      return { status: 'passed', domain, attemptsUsed: attempt, targets: targets.map(target => target.name) };
    }
    if (attempt < attempts) await wait(intervalMs);
  }

  throw new Error(`배포 스모크 테스트 실패: ${failures.join('; ')}`);
}

function argument(name) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const envPath = path.resolve(argument('env') || '.env.demo');
  const values = parseEnv(await fs.readFile(envPath, 'utf8'));
  const attempts = Number(argument('attempts') || 30);
  const intervalMs = Number(argument('interval-ms') || 10_000);

  const result = await runSmokeTest({
    domain: values.DEMO_DOMAIN,
    attempts,
    intervalMs,
    onAttempt({ attempt, failures }) {
      if (failures.length > 0) {
        console.error(JSON.stringify({ status: 'retrying', attempt, failures }));
      }
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
