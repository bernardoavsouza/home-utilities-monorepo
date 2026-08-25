import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  copyFileSync,
  readFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const useShell = process.platform === 'win32';

function log(step, message) {
  console.log(`→ ${step}${message ? `: ${message}` : ''}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: useShell,
    env: process.env,
  });

  if (result.error) {
    fail(`${label}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${label} failed (exit ${result.status ?? 'unknown'})`);
  }
}

function parseVersion(raw) {
  const match = String(raw).trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function versionInRange(version, minMajor, maxMajorExclusive, minMinor = 0) {
  if (version.major < minMajor || version.major >= maxMajorExclusive)
    return false;
  return version.major > minMajor || version.minor >= minMinor;
}

function checkEngines() {
  log('check engines');

  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
  const engines = packageJson.engines ?? {};

  const nodeVersion = parseVersion(process.versions.node);
  if (!nodeVersion) {
    fail(`Could not parse Node version: ${process.versions.node}`);
  }

  if (!versionInRange(nodeVersion, 24, 25, 19)) {
    fail(
      `Node ${process.versions.node} is outside engines.node (${engines.node ?? '>=24.19 <25'}). Use nvm/fnm/asdf with .nvmrc (Node 24.19.0).`,
    );
  }

  const pnpmResult = spawnSync('pnpm', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    shell: useShell,
    env: process.env,
  });

  if (pnpmResult.error) {
    fail(
      `pnpm not found (${pnpmResult.error.message}). Enable Corepack or install pnpm matching packageManager (${packageJson.packageManager ?? 'pnpm@11'}).`,
    );
  }

  if (pnpmResult.status !== 0) {
    fail(`Could not read pnpm version (exit ${pnpmResult.status ?? 'unknown'})`);
  }

  const pnpmVersion = parseVersion(pnpmResult.stdout || pnpmResult.stderr);
  if (!pnpmVersion) {
    fail(`Could not parse pnpm version: ${pnpmResult.stdout || pnpmResult.stderr}`);
  }

  if (!versionInRange(pnpmVersion, 11, 12)) {
    fail(
      `pnpm ${pnpmVersion.major}.${pnpmVersion.minor}.${pnpmVersion.patch} is outside engines.pnpm (${engines.pnpm ?? '>=11 <12'}). Use Corepack: corepack enable && corepack prepare ${packageJson.packageManager ?? 'pnpm@11.20.0'} --activate`,
    );
  }
}

function pathExists(path) {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function copyEnvTemplates() {
  log('env templates');

  const pairs = [
    ['apps/api/.env.example', 'apps/api/.env'],
    ['apps/web/.env.example', 'apps/web/.env'],
  ];

  for (const [templateRel, targetRel] of pairs) {
    const template = join(root, templateRel);
    const target = join(root, targetRel);

    if (!pathExists(template)) {
      fail(`Missing env template: ${templateRel}`);
    }

    if (pathExists(target)) {
      console.log(`  skip: ${targetRel} already exists`);
      continue;
    }

    copyFileSync(template, target);
    console.log(`  copied: ${templateRel} → ${targetRel}`);
  }
}

function installDeps() {
  log('pnpm install');
  run('pnpm', ['install'], 'pnpm install');
}

function startDocker() {
  log('docker compose');

  const result = spawnSync('docker', ['compose', 'up', '-d', '--wait'], {
    cwd: root,
    stdio: 'inherit',
    shell: useShell,
    env: process.env,
  });

  if (result.error) {
    fail(
      `Docker is unavailable (${result.error.message}). Install Docker Desktop / Docker Engine and ensure the daemon is running, then re-run pnpm bootstrap.`,
    );
  }

  if (result.status !== 0) {
    fail(
      `docker compose up -d --wait failed (exit ${result.status ?? 'unknown'}). Start Docker and ensure docker compose v2 is available, then re-run pnpm bootstrap.`,
    );
  }

  ensurePostgresDatabases();
}

function postgresDatabaseExists(name) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'app',
      '-d',
      'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      shell: useShell,
      env: process.env,
    },
  );

  return result.status === 0 && result.stdout.trim() === '1';
}

function ensurePostgresDatabases() {
  log('postgres databases');

  for (const name of ['app', 'app_test']) {
    if (postgresDatabaseExists(name)) {
      console.log(`  skip: database ${name} already exists`);
      continue;
    }

    run(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'app',
        '-d',
        'postgres',
        '-c',
        `CREATE DATABASE ${name}`,
      ],
      `create database ${name}`,
    );
  }
}

function prismaGenerate() {
  log('prisma generate');
  run('pnpm', ['prisma:generate'], 'pnpm prisma:generate');
}

function main() {
  checkEngines();
  copyEnvTemplates();
  installDeps();
  startDocker();
  prismaGenerate();
  console.log('✓ bootstrap complete');
}

main();
