import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, openSync, closeSync, appendFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const helper = existsSync(join(root, 'electron-helper')) ? join(root, 'electron-helper') : join(root, 'node_modules', 'dsh-pet', 'runtime', 'electron-helper');
const control = require(join(helper, 'local-control.js'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const isDisconnect = error => ['ECONNRESET','UND_ERR_SOCKET','EPIPE'].includes(error?.cause?.code || error?.code);

export async function runLauncher({ appRoot = root, home = join(process.env.LOCALAPPDATA, 'DeepSeekActionPet'), stop = false,
  fetchImpl = fetch, spawnImpl = spawn, delay = wait } = {}) {
  const endpoint = 'http://127.0.0.1:3088';
  mkdirSync(home, { recursive: true });
  const probe = async () => {
    try {
      const response = await fetchImpl(endpoint + '/health', { headers:{Connection:'close'}, redirect: 'error', signal: AbortSignal.timeout(1800) });
      if (!response.ok) throw new Error('Port check refused');
      const state = await response.json();
      if (state.name !== 'dsh-pet-standalone' || resolve(state.plugin?.root || '').toLowerCase() !== join(appRoot, 'node_modules', 'dsh-pet').toLowerCase())
        throw new Error('Port 3088 is used by another application');
      return state;
    } catch (error) {
      if (error?.cause?.code === 'ECONNREFUSED') return null;
      throw error;
    }
  };
  const current = await probe();
  if (current) {
    if (stop) {
      const session = control.readSession(home);
      if (current.pid !== session.pid) throw new Error('Control session does not match the running pet');
      try {
        const response = await fetchImpl(endpoint + '/shutdown', { method: 'POST', redirect: 'error',
          headers: {...control.headers(session.token),Connection:'close'}, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Pet shutdown refused');
      } catch(error) { if(!isDisconnect(error))throw error; }
      for (let i = 0; i < 40; i++) {
        try { if ((await probe()) === null) return; }
        catch(error) { if(!isDisconnect(error))throw error; }
        await delay(200);
      }
      throw new Error('Pet is still shutting down');
    }
    return;
  }
  if (stop) return;
  const logfile = openSync(join(home, 'runtime.log'), 'a');
  let child, spawnError;
  try {
    child = spawnImpl(join(appRoot, 'node.exe'), [join(appRoot, 'node_modules', 'dsh-pet', 'lib', 'standalone.js'), '--port', '3088'], {
      cwd: appRoot, env: { ...process.env, DSH_HOME: home, DSH_PET_ELECTRON_PATH: join(appRoot, 'electron', 'electron.exe') },
      detached: true, windowsHide: true, stdio: ['ignore', logfile, logfile],
    });
    child.once('error', error => { spawnError = error; });
    child.unref();
  } finally { closeSync(logfile); }
  // Fixed-port binding in the host prevents duplicate instances even when probes race.
  for (let i = 0; i < 40; i++) {
    if (spawnError) throw new Error('Pet process could not start');
    await delay(200);
    if (await probe()) return;
  }
  throw new Error('Pet startup timed out; inspect runtime.log');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await runLauncher({ stop: process.argv.includes('--stop') }); }
  catch (error) {
    const home = join(process.env.LOCALAPPDATA, 'DeepSeekActionPet');
    mkdirSync(home, { recursive: true });
    appendFileSync(join(home, 'launcher.log'), new Date().toISOString() + ' ' + error.message + '\n');
    process.exitCode = 1;
  }
}
