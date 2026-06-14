#!/usr/bin/env node
/**
 * Free PRISM dev ports (5000 LSP API, 3001 inventory API, 5173+ Vite).
 * Run before `npm run dev` if a previous session did not shut down cleanly.
 */
import { execSync } from 'node:child_process';

const PORTS = [5000, 3001, 3002, 5173, 5174, 5175];
const isWin = process.platform === 'win32';

function killOnPort(port) {
  if (isWin) {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const pid = line.trim().split(/\s+/).at(-1);
        if (pid && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Stopped PID ${pid} (port ${port})`);
      }
    } catch {
      /* nothing listening */
    }
    return;
  }

  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
    for (const pid of out.trim().split('\n').filter(Boolean)) {
      execSync(`kill -9 ${pid}`);
      console.log(`Stopped PID ${pid} (port ${port})`);
    }
  } catch {
    /* nothing listening */
  }
}

for (const port of PORTS) {
  killOnPort(port);
}

console.log('Dev ports cleared. Run `npm run dev` to start fresh.');
