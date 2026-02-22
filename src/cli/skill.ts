import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG_DIR } from './init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..', '..');

const SKILL_FILES = ['skill.md', 'heartbeat.md', 'skill.json'] as const;

export interface SkillFilesResult {
  status: 'created' | 'exists';
  path: string;
  files: Record<string, 'created' | 'exists'>;
}

export function copySkillFiles(): SkillFilesResult {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

  const files: Record<string, 'created' | 'exists'> = {};
  let anyCreated = false;

  for (const file of SKILL_FILES) {
    const dest = join(CONFIG_DIR, file);
    if (existsSync(dest)) {
      files[file] = 'exists';
    } else {
      copyFileSync(join(PKG_ROOT, file), dest);
      files[file] = 'created';
      anyCreated = true;
    }
  }

  return {
    status: anyCreated ? 'created' : 'exists',
    path: CONFIG_DIR,
    files,
  };
}

export function showSkill(json: boolean): void {
  const content = readFileSync(join(PKG_ROOT, 'skill.md'), 'utf-8');
  if (json) {
    console.log(JSON.stringify({ content }));
  } else {
    console.log(content);
  }
}

export function showHeartbeat(json: boolean): void {
  const content = readFileSync(join(PKG_ROOT, 'heartbeat.md'), 'utf-8');
  if (json) {
    console.log(JSON.stringify({ content }));
  } else {
    console.log(content);
  }
}

export function showSkillJson(): void {
  const content = readFileSync(join(PKG_ROOT, 'skill.json'), 'utf-8');
  console.log(content);
}
