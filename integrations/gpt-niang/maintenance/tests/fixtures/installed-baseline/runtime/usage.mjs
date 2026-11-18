import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Minimal atomic JSON writer matching the installed usage.mjs contract.
 */
export function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
