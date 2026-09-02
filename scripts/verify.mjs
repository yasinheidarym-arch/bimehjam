#!/usr/bin/env node
/**
 * Read-only repository guard for local and CI use.
 * It deliberately does not load .env files or execute Docker, Prisma, or database commands.
 */
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'docker-compose.yml',
  'prisma/schema.prisma',
  'AGENTS.md',
  'scripts/ops/deploy.sh',
  'scripts/ops/rollback.sh',
  'scripts/ops/backup-sqlite.sh',
  'scripts/ops/migrate.sh',
];
const failures = [];

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

for (const file of requiredFiles) {
  if (!(await exists(file))) failures.push(`Missing required file: ${file}`);
}

let packageJson;
try {
  packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
} catch {
  failures.push('package.json is not valid JSON.');
}

for (const script of ['dev', 'build', 'start', 'lint', 'verify']) {
  if (!packageJson?.scripts?.[script]) failures.push(`Missing package script: ${script}`);
}

try {
  const schema = await readFile(path.join(root, 'prisma/schema.prisma'), 'utf8');
  if (!/datasource\s+\w+\s*\{/.test(schema)) failures.push('Prisma schema has no datasource block.');
  if (!/generator\s+\w+\s*\{/.test(schema)) failures.push('Prisma schema has no generator block.');
  if (!/model\s+\w+\s*\{/.test(schema)) failures.push('Prisma schema has no model block.');
} catch {
  failures.push('Unable to read prisma/schema.prisma.');
}

try {
  const compose = await readFile(path.join(root, 'docker-compose.yml'), 'utf8');
  if (!/^services:\s*$/m.test(compose)) failures.push('docker-compose.yml has no services section.');
  if (!/^\s{2}app:\s*$/m.test(compose)) failures.push('docker-compose.yml has no app service.');
} catch {
  failures.push('Unable to read docker-compose.yml.');
}

try {
  const entrypoint = await readFile(path.join(root, 'docker-entrypoint.sh'), 'utf8');
  if (/prisma\s+db\s+push/.test(entrypoint)) {
    failures.push('docker-entrypoint.sh must not run prisma db push during normal startup.');
  }
} catch {
  failures.push('Unable to read docker-entrypoint.sh.');
}

if (failures.length) {
  console.error('Verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Verification passed: repository configuration is present and structurally consistent.');
}
