const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');

const executable = process.argv[2];
if (!executable || !fs.existsSync(executable) || !process.env.DISPLAY) {
  console.error('Usage: xvfb-run -a node scripts/verify-packaged-launch.cjs <packaged-executable>');
  process.exit(2);
}

const env = { ...process.env,
  VISTA_DESKTOP_DEMO: '1',
  VISTA_ELECTRON_DISABLE_GPU: '1',
  NODE_ENV: 'test',
  VISTA_DESKTOP_TEST_USER_DATA: '/tmp/vista-packaged-launch-profile'
};
delete env.DEBUG; // AppImage AppRun prints its entire environment when DEBUG is set.
delete env.ELECTRON_RUN_AS_NODE;
delete env.VISTA_EDUCATION_API;
delete env.VISTA_SUPABASE_URL;
delete env.VISTA_SUPABASE_ANON_KEY;
delete env.VISTA_TWIN_WS_URL;

const app = spawn(executable, [], { env, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
app.stderr.on('data', (chunk) => { stderr += chunk.toString().slice(0, 500); });
const timer = setTimeout(() => {
  execFile('xwininfo', ['-root', '-tree'], { timeout: 5000 }, (error, stdout) => {
    app.kill('SIGTERM');
    if (error || !stdout.includes('VISTA Lab Station')) {
      console.error('No VISTA Lab Station window observed.', stderr.slice(0, 1000));
      process.exitCode = 1;
    } else {
      console.log('PASS: packaged VISTA Lab Station window opened under Xvfb with Electron sandbox enabled.');
    }
  });
}, 5000);
app.on('error', (error) => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
app.on('exit', (code, signal) => {
  if (code && signal !== 'SIGTERM') {
    clearTimeout(timer);
    console.error(`Packaged app exited before window check: ${code}`, stderr.slice(0, 1000));
    process.exitCode = 1;
  }
});
