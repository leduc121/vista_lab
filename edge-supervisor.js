'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

class EdgeSupervisor {
  constructor({ app, platform = process.platform, spawnImpl = spawn, now = Date.now, logPath, modelPath, runtimeProfile = 'simulation', roboticsPython = '', roboticsSource = '' } = {}) {
    this.app = app;
    this.platform = platform;
    this.spawnImpl = spawnImpl;
    this.now = now;
    this.logPath = logPath;
    this.modelPath = modelPath;
    this.runtimeProfile = runtimeProfile === 'robotics' ? 'robotics' : 'simulation';
    this.roboticsPython = roboticsPython;
    this.roboticsSource = roboticsSource;
    this.child = null;
    this.pending = new Map();
    this.restarts = [];
    this.restartTimer = null;
    this.intentionalStop = false;
    this.startError = null;
  }

  command() {
    if (this.runtimeProfile === 'robotics') {
      const source = this.roboticsSource || (!this.app?.isPackaged ? __dirname : '');
      const executable = this.roboticsPython;
      const runtime = source && path.join(source, 'edge', 'runtime.py');
      if (!executable || !runtime || !fs.existsSync(executable) || !fs.existsSync(runtime)) return null;
      return { executable, args: [runtime], source };
    }
    if (this.app?.isPackaged) {
      if (!process.resourcesPath) return null;
      const executable = path.join(process.resourcesPath, 'edge-runtime', this.platform === 'win32' ? 'vista-edge-runtime.exe' : 'vista-edge-runtime');
      return fs.existsSync(executable) ? { executable, args: [] } : null;
    }
    const executable = process.env.VISTA_EDGE_PYTHON || (this.platform === 'win32' ? 'python' : 'python3');
    return { executable, args: [path.join(__dirname, 'edge', 'runtime.py')] };
  }

  start() {
    if (this.child) return true;
    this.intentionalStop = false;
    const command = this.command();
    if (!command) { this.startError = this.runtimeProfile === 'robotics' ? 'Configured Python robotics runtime or Edge source is missing.' : 'Bundled Edge Runtime executable is missing.'; return false; }
    try {
      const bundledModel = this.app?.isPackaged && process.resourcesPath
        ? path.join(process.resourcesPath, 'models', 'so101', 'scene.xml')
        : path.join(__dirname, 'models', 'so101', 'scene.xml');
      const child = this.spawnImpl(command.executable, command.args, {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, VISTA_SO101_MJCF: this.modelPath || bundledModel,
          VISTA_POLICY_MODEL_DIR: path.join(this.app?.getPath?.('userData') || process.env.XDG_DATA_HOME || process.env.HOME || __dirname, 'models'),
          ...(this.platform === 'linux' ? { MUJOCO_GL: process.env.MUJOCO_GL || 'egl' } : {}),
          ...(command.source ? { PYTHONPATH: [command.source, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) }
            : !this.app?.isPackaged ? { PYTHONPATH: [__dirname, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) } : {}) }
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
      const follower = status.arms?.['follower-a'];
      const physicalFollowerReady = follower?.adapterMode === 'so101_follower'
        && follower?.connected === true && follower?.calibrated === true;
      const profileReady = this.runtimeProfile !== 'robotics' || (driversReady && physicalFollowerReady);
      return { state: simulationReady && profileReady ? 'READY' : 'ACTION REQUIRED', driversReady, simulationReady, profileReady,
        physicalFollowerReady, runtimeProfile: this.runtimeProfile, health, status, restartCount: this.restarts.length };
    } catch (error) {
      return { state: this.child ? 'ACTION REQUIRED' : 'BLOCKED', runtimeProfile: this.runtimeProfile, error: error.message, restartCount: this.restarts.length };
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
    const waitForExit = (timeoutMs) => new Promise((resolve) => {
      if (this.child !== child) return resolve(true);
      let finished = false;
      const done = (exited) => { if (finished) return; finished = true; clearTimeout(timer); child.removeListener('exit', onExit); resolve(exited); };
      const onExit = () => done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      child.once('exit', onExit);
    });
    try { child.stdin.end(`${JSON.stringify({ id: crypto.randomUUID(), method: 'stop', params: {} })}\n`); } catch {}
    if (await waitForExit(1500)) return;
    try { child.kill('SIGTERM'); } catch {}
    if (await waitForExit(1500)) return;
    try { child.kill('SIGKILL'); } catch {}
    // Do not start another profile while the previous child still owns runtime state.
    await waitForExit(3000);
    if (this.child === child) throw new Error('Edge Runtime did not exit; profile switch is blocked to preserve single-runtime ownership.');
  }
}

module.exports = { EdgeSupervisor };
