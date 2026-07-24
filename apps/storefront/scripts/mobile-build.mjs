import { spawn } from 'node:child_process';
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(command, ['exec', 'next', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CAPACITOR_BUILD: '1', NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://10.0.2.2:18080/api' },
});
child.on('exit', code => process.exit(code ?? 1));
