import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publicDir = resolve('apps/web/public');
const configPath = resolve(publicDir, 'config.local.js');
const required = ['CHAT2_BOOTSTRAP_WORKSPACE_ID', 'CHAT2_BOOTSTRAP_USER_ID', 'CHAT2_API_KEY'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing frontend configuration: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(
  configPath,
  `globalThis.__CHAT2_CONFIG__ = ${JSON.stringify({
    workspaceId: process.env.CHAT2_BOOTSTRAP_WORKSPACE_ID,
    userId: process.env.CHAT2_BOOTSTRAP_USER_ID,
    apiKey: process.env.CHAT2_API_KEY,
  })};\n`,
  'utf8',
);

const server = spawn('python3', ['-m', 'http.server', process.env.PORT || '3000', '--directory', publicDir], {
  stdio: 'inherit',
});

const shutdown = (signal) => {
  server.kill(signal);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

console.log(`Frontend available at http://localhost:${process.env.PORT || '3000'}`);
  
