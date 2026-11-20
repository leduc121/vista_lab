'use strict';

const { spawnSync } = require('node:child_process');
const candidates = process.env.VISTA_EDGE_PYTHON
  ? [process.env.VISTA_EDGE_PYTHON]
  : process.platform === 'win32' ? ['python'] : ['python3.11', 'python3'];
let attempted = [];
for (const executable of candidates) {
  const probe = spawnSync(executable, ['-c', 'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 2)'], { stdio: 'ignore' });
  attempted.push(executable);
  if (probe.status !== 0) continue;
  const result = spawnSync(executable, ['scripts/build-edge-runtime.py'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
console.error(`Python 3.11 was not found (checked ${attempted.join(', ')}). Set VISTA_EDGE_PYTHON to a Python 3.11 executable.`);
process.exit(1);
