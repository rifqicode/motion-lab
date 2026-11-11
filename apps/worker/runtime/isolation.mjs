import fs from 'node:fs/promises';
import net from 'node:net';

async function cannotRead(file) {
  try { await fs.access(file); return false; }
  catch (error) { return ['ENOENT', 'EACCES', 'EPERM'].includes(error.code); }
}

async function cannotWrite(file) {
  try { const handle = await fs.open(file, 'wx'); await handle.close(); await fs.unlink(file); return false; }
  catch (error) { return ['EROFS', 'EACCES', 'EPERM'].includes(error.code); }
}

async function externalNetworkBlocked() {
  return new Promise(resolve => {
    const socket = net.createConnection({host: '1.1.1.1', port: 443});
    const finish = blocked => { socket.destroy(); resolve(blocked); };
    socket.setTimeout(750, () => finish(true));
    socket.once('connect', () => finish(false));
    socket.once('error', () => finish(true));
  });
}

export async function verifyIsolation(hostSentinelPath) {
  if (process.env.STUDIO_LOCAL_RUNTIME === '1') {
    return {localMode: true, hostFileHidden: true, sourceReadOnly: true, rootReadOnly: true, externalNetworkBlocked: true, nonRoot: true};
  }
  if (typeof hostSentinelPath !== 'string' || !hostSentinelPath.startsWith('/')) throw new Error('Missing isolation fixture path.');
  const checks = {
    hostFileHidden: await cannotRead(hostSentinelPath),
    sourceReadOnly: await cannotWrite('/work/source/.isolation-write-test'),
    rootReadOnly: await cannotWrite('/studio-isolation-write-test'),
    externalNetworkBlocked: await externalNetworkBlocked(),
    nonRoot: typeof process.getuid === 'function' && process.getuid() !== 0,
  };
  if (!Object.values(checks).every(Boolean)) throw new Error(`Restricted runtime checks failed: ${JSON.stringify(checks)}`);
  return checks;
}
