import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const JOINTS = {
  shoulder_pan: { urdf: 'Rotation', lower: -1.91986, upper: 1.91986 },
  shoulder_lift: { urdf: 'Pitch', lower: -1.74533, upper: 1.74533 },
  elbow_flex: { urdf: 'Elbow', lower: -1.69, upper: 1.69 },
  wrist_flex: { urdf: 'Wrist_Pitch', lower: -1.65806, upper: 1.65806 },
  wrist_roll: { urdf: 'Wrist_Roll', lower: -2.7438473, upper: 2.8412063 },
  gripper: { urdf: 'Jaw', lower: -0.174533, upper: 1.74533 }
};
const JOINT_NAMES = Object.keys(JOINTS);
const MESHES = new Set([
  'base_motor_holder_so101_v1.stl', 'base_so101_v2.stl', 'sts3215_03a_v1.stl',
  'waveshare_mounting_plate_so101_v2.stl', 'motor_holder_so101_base_v1.stl',
  'rotation_pitch_so101_v1.stl', 'upper_arm_so101_v1.stl', 'under_arm_so101_v1.stl',
  'motor_holder_so101_wrist_v1.stl', 'sts3215_03a_no_horn_v1.stl',
  'wrist_roll_pitch_so101_v2.stl', 'wrist_roll_follower_so101_v1.stl', 'moving_jaw_so101_v1.stl'
]);

export function parseTwinFrame(raw, expectedRobotId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const frame = raw;
  if (frame.schema_version !== 1 || typeof frame.robot_id !== 'string' || !frame.robot_id) return null;
  if (expectedRobotId && frame.robot_id !== expectedRobotId) return null;
  if (!['SIMULATION', 'LIVE_PHYSICAL', 'REPLAY'].includes(frame.source_mode)) return null;
  if (!['connected', 'disconnected', 'stale'].includes(frame.connection)) return null;
  if (!['NOT_APPLICABLE', 'UNCALIBRATED', 'VERIFIED'].includes(frame.calibration_status)) return null;
  if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0 || typeof frame.controller_id !== 'string') return null;
  if (typeof frame.measured_at !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(frame.measured_at) || !Number.isFinite(Date.parse(frame.measured_at))) return null;
  if (!Array.isArray(frame.measured)) return null;
  for (const readings of [frame.measured, frame.calibrated, frame.commanded].filter(Boolean)) {
    if (!Array.isArray(readings) || readings.length !== JOINT_NAMES.length) return null;
    const names = new Set();
    for (const reading of readings) {
      if (!JOINT_NAMES.includes(reading?.name) || names.has(reading.name) || !Number.isFinite(reading.position)) return null;
      if (!['rad', 'deg', 'percent'].includes(reading.unit) || (reading.name !== 'gripper' && reading.unit === 'percent')) return null;
      if (reading.name === 'gripper' && reading.unit === 'percent' && (reading.position < 0 || reading.position > 100)) return null;
      if (reading.unit !== 'percent') {
        const radians = reading.unit === 'deg' ? reading.position * Math.PI / 180 : reading.position;
        if (radians < JOINTS[reading.name].lower || radians > JOINTS[reading.name].upper) return null;
      }
      names.add(reading.name);
    }
    if (names.size !== JOINT_NAMES.length) return null;
  }
  if (frame.source_mode === 'LIVE_PHYSICAL' && frame.calibration_status === 'VERIFIED' && !frame.calibrated) return null;
  return frame;
}

function toUrdfRadians(name, reading) {
  if (name === 'gripper' && reading.unit === 'percent') return null;
  const value = reading.unit === 'deg' ? reading.position * Math.PI / 180 : reading.position;
  return Number.isFinite(value) && value >= JOINTS[name].lower && value <= JOINTS[name].upper ? value : null;
}

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (value?.data) return Uint8Array.from(value.data).buffer;
  return Uint8Array.from(value).buffer;
}

async function readUrdf() {
  if (window.vista?.loadTwinUrdf) return window.vista.loadTwinUrdf();
  const response = await fetch('/renderer/assets/so101/urdf/so101_new_calib.urdf');
  if (!response.ok) throw new Error(`URDF request returned ${response.status}`);
  return response.text();
}

async function readMesh(filename) {
  if (!MESHES.has(filename)) throw new Error('URDF requested a mesh outside the VISTA SO-101 allowlist.');
  if (window.vista?.loadTwinMesh) return window.vista.loadTwinMesh(filename);
  const response = await fetch(`/renderer/assets/so101/meshes/${encodeURIComponent(filename)}`);
  if (!response.ok) throw new Error(`Mesh request returned ${response.status}`);
  return response.arrayBuffer();
}

export async function mountTwinViewer(host, onDisposeReady = () => {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111718');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.005, 100);
  camera.up.set(0, 0, 1);
  camera.position.set(0.7, -0.9, 0.65);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.replaceChildren(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.15;
  controls.maxDistance = 4;
  controls.target.set(0, 0, 0.12);
  const initialCamera = camera.position.clone();
  const initialTarget = controls.target.clone();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667078, 2.1));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(0.4, -0.5, 1.2);
  scene.add(light);
  const grid = new THREE.GridHelper(1.4, 28, '#526260', '#263131');
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.006;
  scene.add(grid);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshStandardMaterial({ color: '#172021', roughness: 0.9 }));
  ground.position.z = -0.008;
  scene.add(ground);
  const axes = new THREE.AxesHelper(0.12);
  axes.position.set(-0.6, -0.45, 0.01);
  scene.add(axes);

  let disposed = false;
  let released = false;
  let latest = null;
  let robot = null;
  let targets = {};
  const meshCache = new Map();
  const manager = new THREE.LoadingManager();
  const meshLoading = new Promise((resolve, reject) => {
    manager.onLoad = resolve;
    manager.onError = (url) => reject(new Error(`SO-101 asset failed to load: ${url}`));
  });
  const loader = new URDFLoader(manager);
  loader.packages = { so_arm_description: '/assets/so101' };
  loader.parseCollision = false;
  loader.loadMeshCb = (uri, manager, material, done) => {
    manager.itemStart(uri);
    const filename = String(uri).split('/').pop();
    const cacheKey = `${filename}:${material.name}`;
    if (meshCache.has(cacheKey)) { done(meshCache.get(cacheKey).clone()); manager.itemEnd(uri); return; }
    void readMesh(filename).then((bytes) => {
      if (disposed) { manager.itemEnd(uri); return; }
      const geometry = new STLLoader(manager).parse(toArrayBuffer(bytes));
      const displayMaterial = new THREE.MeshStandardMaterial({
        color: material.name === '3d_printed' ? '#f2f2ed' : '#34383a',
        roughness: material.name === '3d_printed' ? 0.84 : 0.6,
        metalness: material.name === '3d_printed' ? 0.02 : 0.15
      });
      const mesh = new THREE.Mesh(geometry, displayMaterial);
      meshCache.set(cacheKey, mesh);
      done(mesh.clone());
      manager.itemEnd(uri);
    }).catch((error) => { done(null, error); manager.itemError(uri); manager.itemEnd(uri); });
  };

  const resize = new ResizeObserver(() => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  const release = () => {
    if (released) return;
    released = true;
    disposed = true;
    resize.disconnect();
    controls.dispose();
    renderer.setAnimationLoop(null);
    renderer.dispose();
    meshCache.forEach((mesh) => { mesh.geometry.dispose(); mesh.material.dispose(); });
    scene.clear();
    host.replaceChildren();
  };
  resize.observe(host);
  let lastFrameTime = performance.now();
  renderer.setAnimationLoop((now) => {
    const frame = latest;
    if (robot) {
      if (frame) {
        const readings = frame.source_mode === 'LIVE_PHYSICAL'
          ? (frame.calibration_status === 'VERIFIED' ? frame.calibrated : null)
          : frame.measured;
        if (readings) {
          for (const name of JOINT_NAMES) {
            const reading = readings.find((entry) => entry.name === name);
            const value = reading && toUrdfRadians(name, reading);
            const joint = robot.joints[JOINTS[name].urdf];
            if (joint && value !== null && value !== undefined) targets[name] = value;
          }
        }
      }
      const elapsed = Math.min(50, now - lastFrameTime);
      for (const name of JOINT_NAMES) {
        const joint = robot.joints[JOINTS[name].urdf];
        if (!joint || targets[name] === undefined) continue;
        const current = joint.jointValue[0] || 0;
        robot.setJointValue(JOINTS[name].urdf, current + (targets[name] - current) * Math.min(1, elapsed / 90));
      }
    }
    lastFrameTime = now;
    controls.update();
    renderer.render(scene, camera);
  });
  onDisposeReady(release);

  try {
    if (disposed) return { setFrame() {}, resetCamera() {}, dispose: release };
    const urdf = await readUrdf();
    if (disposed) return { setFrame() {}, resetCamera() {}, dispose: release };
    robot = loader.parse(urdf);
    robot.name = 'VISTA SO-101 URDF';
    for (const [name, specification] of Object.entries(JOINTS)) {
      const joint = robot.joints[specification.urdf];
      if (!joint || joint.jointType !== 'revolute' || Math.abs(joint.limit.lower - specification.lower) > 1e-5 || Math.abs(joint.limit.upper - specification.upper) > 1e-5) {
        throw new Error(`SO-101 URDF contract mismatch for ${specification.urdf}.`);
      }
      robot.setJointValue(specification.urdf, 0);
    }
    scene.add(robot);
    await meshLoading;
  } catch (error) {
    release();
    throw error;
  }

  const setFrame = (frame) => {
    latest = frame;
    if (!frame) {
      targets = Object.fromEntries(JOINT_NAMES.map((name) => [name, 0]));
      return;
    }
    const readings = frame?.source_mode === 'LIVE_PHYSICAL'
      ? (frame.calibration_status === 'VERIFIED' ? frame.calibrated : frame.measured)
      : frame?.measured;
    if (readings) {
      targets = {};
      for (const name of JOINT_NAMES) {
        const reading = readings.find((entry) => entry.name === name);
        const value = reading && toUrdfRadians(name, reading);
        if (value !== null && value !== undefined) targets[name] = value;
      }
    }
  };
  return {
    setFrame,
    resetCamera() {
      if (disposed) return;
      camera.position.copy(initialCamera);
      controls.target.copy(initialTarget);
      controls.update();
    },
    dispose: release
  };
}
