'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

class EdgeSupervisor {
  constructor({ app, platform = process.platform, spawnImpl = spawn, now = Date.now, logPath, modelPath } = {}) {
    this.app = app;
    this.platform = platform;
    this.spawnImpl = spawnImpl;
    this.now = now;
    this.logPath = logPath;
    this.modelPath = modelPath;
    this.child = null;
    this.pending = new Map();
    this.restarts = [];
    this.restartTimer = null;
    this.intentionalStop = false;
    this.startError = null;
  }

  command() {
    if (this.app?.isPackaged) {
      if (!process.resourcesPath) return null;
      const executable = path.join(process.resourcesPath, 'edge-runtime', this.platform === 'win32' ? 'vista-edge-runtime.exe' : 'vista-edge-runtime');
      return fs.existsSync(executable) ? { executable, args: [] } : null;
    }
    const executable = process.env.VISTA_EDGE_PYTHON || (this.platform === 'win32' ? 'python' : 'python3');
    return { executable, args: [path.join(__dirname, 'edge', 'runtime.py')] };
  }

  start() {
    if (this.child || this.intentionalStop) return Boolean(this.child);
    const command = this.command();
    if (!command) { this.startError = 'Bundled Edge Runtime executable is missing.'; return false; }
    try {
      const bundledModel = this.app?.isPackaged && process.resourcesPath
        ? path.join(process.resourcesPath, 'models', 'so101', 'scene.xml')
        : path.join(__dirname, 'models', 'so101', 'scene.xml');
      const child = this.spawnImpl(command.executable, command.args, {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, VISTA_SO101_MJCF: this.modelPath || bundledModel,
          VISTA_POLICY_MODEL_DIR: path.join(this.app?.getPath?.('userData') || process.env.XDG_DATA_HOME || process.env.HOME || __dirname, 'models'),
          ...(this.platform === 'linux' ? { MUJOCO_GL: process.env.MUJOCO_GL || 'egl' } : {}),
          ...(!this.app?.isPackaged ? { PYTHONPATH: [__dirname, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) } : {}) }
      });
      this.child = child;
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', (line) => this.onLine(line));
      child.stderr.on('data', (data) => this.log('runtime', String(data).slice(0, 2000)));
      child.once('error', (error) => { this.startError = `Edge Runtime process could not start: ${error.message}`; this.onExit(child, -1); });
      child.once('exit', (code) => this.onExit(child, code));
      this.startError = null;
      return true;
    } catch (error) {
      this.startError = `Edge Runtime process could not start: ${error.message}`;
      this.onExit(this.child, -1);
      return false;
    }
  }

  onLine(line) {
    if (line.length > 1_000_000) return;
    let response;
    try { response = JSON.parse(line); } catch { this.log('protocol-error', 'Runtime returned invalid JSON.'); return; }
    const pending = this.pending.get(response?.id);
    if (!pending) return;
    if (response.event === 'simulation.frame') {
      try { pending.onEvent?.(response.data); } catch (error) { this.log('event-handler-error', error.message); }
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(typeof response.error === 'string' ? response.error : 'Edge Runtime request failed.'));
  }

  onExit(child, code) {
    if (child && this.child !== child) return;
    this.child = null;
    for (const [id, pending] of this.pending) { clearTimeout(pending.timer); pending.reject(new Error('Edge Runtime stopped unexpectedly.')); this.pending.delete(id); }
    this.log('runtime-exit', `code=${code}`);
    if (!this.intentionalStop) this.scheduleRestart();
  }

  scheduleRestart() {
    const cutoff = this.now() - 60_000;
    this.restarts = this.restarts.filter((time) => time > cutoff);
    if (this.restarts.length >= 3 || this.restartTimer) return;
    const delay = Math.min(1000 * 2 ** this.restarts.length, 4000);
    this.restarts.push(this.now());
    this.restartTimer = setTimeout(() => { this.restartTimer = null; this.start(); }, delay);
  }

  request(method, params = {}, timeoutMs = 4000, onEvent = null) {
    if (!this.child && !this.start()) return Promise.reject(new Error(this.startError || 'Edge Runtime unavailable.'));
    const child = this.child;
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Edge Runtime request timed out.'));
        this.terminateChild(child);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, onEvent });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer); this.pending.delete(id); reject(new Error('Edge Runtime IPC write failed.'));
        this.terminateChild(child);
      });
    });
  }

  async diagnostics() {
    try {
      const [health, status] = await Promise.all([this.request('health'), this.request('status')]);
      if (health.version !== '0.1.0') return { state: 'BLOCKED', error: `Unsupported Edge Runtime version ${health.version}.`, health, status, restartCount: this.restarts.length };
      const driversReady = Boolean(health.drivers?.lerobot && health.drivers?.pyserial);
      const simulationReady = Boolean(health.simulation?.available);
      return { state: simulationReady ? 'READY' : 'ACTION REQUIRED', driversReady, simulationReady, health, status, restartCount: this.restarts.length };
    } catch (error) {
      return { state: this.child ? 'ACTION REQUIRED' : 'BLOCKED', error: error.message, restartCount: this.restarts.length };
    }
  }

  log(event, message) {
    if (!this.logPath) return;
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true, mode: 0o700 });
      try { if (fs.statSync(this.logPath).size > 5 * 1024 * 1024) fs.renameSync(this.logPath, `${this.logPath}.1`); } catch {}
      fs.appendFileSync(this.logPath, `${JSON.stringify({ at: new Date(this.now()).toISOString(), event, message: String(message).slice(0, 2000) })}\n`, { mode: 0o600 });
    } catch {}
  }

  terminateChild(child) {
    if (!child || child !== this.child) return;
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { if (child === this.child) { try { child.kill('SIGKILL'); } catch {} } }, 1500).unref?.();
  }

  async stop() {
    this.intentionalStop = true;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    if (!child) return;
    try { await this.request('disconnect', {}, 1500); } catch {}
    if (!this.child) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => { this.terminateChild(child); resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      try { child.stdin.end(`${JSON.stringify({ id: crypto.randomUUID(), method: 'stop', params: {} })}\n`); } catch { this.terminateChild(child); }
    });
  }
}

module.exports = { EdgeSupervisor };
