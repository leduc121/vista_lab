import { mountTwinViewer, parseTwinFrame } from './twin-viewer.js';

const root = document.getElementById('root');
const TERMINAL = ['succeeded', 'failed', 'cancelled', 'stopped', 'timed_out', 'preflight_failed'];
const ST = {
  running: ['Đang chạy', 'progress'],
  succeeded: ['Hoàn thành', 'done'],
  failed: ['Thất bại', 'danger'],
  cancelled: ['Đã huỷ', 'warn'],
  stopped: ['Đã dừng khẩn cấp', 'warn'],
  timed_out: ['Quá thời gian', 'danger'],
  preflight_failed: ['Không qua kiểm tra', 'danger']
};

let user = null, view = 'labs', timers = [], sheetEl, robotEl, sidebarCoursesEl;
let currentRobotHealth = { online: false, ready: false, calibrated: false, estop: 'unknown', mode: 'simulation' };
let robotBannerEl = null;
let importedPolicies = [], activePolicyId = '', policyRepo = '', policyRevision = 'main', policyPrompt = '', policyStatus = 'Policies have not been loaded.';
let policyTwinViewer = null;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) {
      el.addEventListener(k.slice(2), v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else if (v !== false && v != null) {
      el.setAttribute(k, v);
    }
  }
  for (const k of kids.flat()) {
    if (k !== false && k != null) {
      el.append(k instanceof Node ? k : document.createTextNode(k));
    }
  }
  return el;
}

// Inline Clean SVG Icons
const svgCheck = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '12');
  s.setAttribute('height', '12');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2.5');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  p.setAttribute('points', '20 6 9 17 4 12');
  s.appendChild(p);
  return s;
};

const svgLock = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '12');
  s.setAttribute('height', '12');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('x', '3');
  r.setAttribute('y', '11');
  r.setAttribute('width', '18');
  r.setAttribute('height', '11');
  r.setAttribute('rx', '2');
  r.setAttribute('ry', '2');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
  s.appendChild(r);
  s.appendChild(p);
  return s;
};

// Course Identity Colors (Color on Data)
const COURSE_COLORS = {
  'course-1': { accent: '#0f766e', light: '#f0fdfa' },
  'course-2': { accent: '#4338ca', light: '#eef2ff' },
  'course-3': { accent: '#b45309', light: '#fffbeb' }
};
const getCourseColor = (cid, idx = 0) => COURSE_COLORS[cid] || (idx % 2 === 0 ? COURSE_COLORS['course-1'] : COURSE_COLORS['course-2']);

// Distinct Semantic Status Pills
function renderStatusPill(status) {
  if (status === 'succeeded' || status === 'done') {
    return h('span', { class: 'status-pill done' }, svgCheck(), 'Hoàn thành');
  }
  if (status === 'in_progress' || status === 'running') {
    return h('span', { class: 'status-pill progress' }, h('span', { class: 'dot-amber-pulse' }), 'Đang làm');
  }
  if (status === 'submitted') return h('span', { class: 'status-pill progress' }, 'Đã nộp');
  if (status === 'locked') {
    return h('span', { class: 'status-pill locked' }, svgLock(), 'Bị khoá');
  }
  if (status === 'failed' || status === 'timed_out' || status === 'preflight_failed') {
    return h('span', { class: 'status-pill danger' }, 'Thất bại');
  }
  if (status === 'stopped' || status === 'cancelled') {
    return h('span', { class: 'status-pill progress' }, 'Đã dừng');
  }
  return h('span', { class: 'status-pill todo' }, 'Chưa làm');
}

// Clean Robotic Arm Schematic for Spotlight Hero
const spotlightRobotSvg = () => {
  const d = new DOMParser().parseFromString(
    `<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%; max-height: 120px;">
      <line x1="10" y1="110" x2="230" y2="110" stroke="#cbd5e1" stroke-width="1"/>
      <rect x="35" y="96" width="60" height="14" rx="2" fill="#f8fafc" stroke="#475569"/>
      <circle cx="65" cy="103" r="3" fill="#cbd5e1"/>
      <rect x="45" y="84" width="40" height="12" rx="2" fill="#f1f5f9" stroke="#475569"/>
      <circle cx="65" cy="84" r="7" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>
      <line x1="65" y1="84" x2="105" y2="38" stroke="#0f172a" stroke-width="3"/>
      <circle cx="105" cy="38" r="6" fill="#ccfbf1" stroke="#0f766e" stroke-width="2"/>
      <line x1="105" y1="38" x2="165" y2="30" stroke="#0f172a" stroke-width="2.5"/>
      <circle cx="165" cy="30" r="5" fill="#f8fafc" stroke="#475569"/>
      <line x1="165" y1="30" x2="190" y2="48" stroke="#0f172a" stroke-width="2"/>
      <line x1="183" y1="44" x2="197" y2="54" stroke="#0f766e" stroke-width="2"/>
      <line x1="188" y1="58" x2="202" y2="46" stroke="#0f766e" stroke-width="2"/>
      <rect x="194" y="52" width="10" height="12" rx="2" fill="#ccfbf1" stroke="#0f766e" stroke-width="1.5"/>
      <line x1="15" y1="15" x2="15" y2="28" stroke="#94a3b8" stroke-width="1.5"/>
      <line x1="15" y1="28" x2="28" y2="28" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="12" y="12" font-size="8" fill="#94a3b8" font-family="sans-serif">+Z</text>
      <text x="31" y="31" font-size="8" fill="#94a3b8" font-family="sans-serif">+X</text>
    </svg>`,
    'image/svg+xml'
  );
  return document.importNode(d.documentElement, true);
};

const bridge = (typeof window !== 'undefined' && window.vista) ? window.vista : {
  call: async () => ({ ok: false, error: 'Open the local demo preview or run the Electron desktop app.' }),
  getCfg: async () => ({ mock: false, rememberedUsername: '' }),
  setCfg: async () => ({})
};
bridge.onPolicyFrame?.((raw) => {
  const frame = parseTwinFrame(raw, 'local-so101-simulation');
  if (frame && policyTwinViewer) policyTwinViewer.setFrame(frame);
});

const call = async (m, ...a) => {
  const r = await bridge.call(m, ...a);
  if (!r.ok) {
    const error = new Error(r.error); error.status = r.status; error.code = r.code;
    if (error.code === 'SESSION_EXPIRED') window.dispatchEvent(new CustomEvent('vista:session-expired'));
      if (error.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new CustomEvent('vista:password-change-required'));
      if (error.code === 'TEMPORARY_PASSWORD_EXPIRED') window.dispatchEvent(new CustomEvent('vista:temporary-password-expired'));
      if (error.code === 'SESSION_ROTATED') window.dispatchEvent(new CustomEvent('vista:session-rotated'));
    throw error;
  }
  return r.data;
};

const clearTimers = () => { timers.forEach(clearInterval); timers = []; if (policyTwinViewer) { policyTwinViewer.dispose(); policyTwinViewer = null; } };
const every = (fn, ms) => { fn(); timers.push(setInterval(fn, ms)); };
const initials = (n) => (n || 'HV').split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase();
const daysLeft = (d) => d ? Math.ceil((new Date(d) - Date.now()) / 864e5) : Infinity;

// Clean Mechanical Robot Art for Login
const robotSvg = () => {
  const d = new DOMParser().parseFromString(
    `<svg viewBox="0 0 340 260" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; max-width: 320px;">
      <!-- Base Line -->
      <line x1="20" y1="220" x2="320" y2="220" stroke="#cbd5e1" stroke-width="1"/>
      <!-- Robot Mount Turntable -->
      <rect x="80" y="206" width="100" height="14" rx="3" stroke="#475569" fill="#f8fafc"/>
      <circle cx="130" cy="213" r="3" fill="#cbd5e1"/>
      <rect x="95" y="190" width="70" height="16" rx="2" stroke="#475569" fill="#f1f5f9"/>
      <!-- J1 Base Pivot -->
      <circle cx="130" cy="190" r="10" stroke="#475569" fill="#ffffff"/>
      <!-- Upper Arm Linkage -->
      <line x1="130" y1="190" x2="130" y2="130" stroke="#0f172a" stroke-width="3"/>
      <!-- J2 Shoulder Joint -->
      <circle cx="130" cy="130" r="12" stroke="#0f766e" fill="#ccfbf1"/>
      <circle cx="130" cy="130" r="4" fill="#0f766e"/>
      <!-- Forearm Linkage -->
      <line x1="130" y1="130" x2="220" y2="70" stroke="#0f172a" stroke-width="2.5"/>
      <line x1="136" y1="120" x2="214" y2="66" stroke="#94a3b8" stroke-width="1"/>
      <!-- J3 Elbow Joint -->
      <circle cx="220" cy="70" r="10" stroke="#0f766e" fill="#ccfbf1"/>
      <circle cx="220" cy="70" r="3" fill="#0f766e"/>
      <!-- Wrist Beam -->
      <line x1="220" y1="70" x2="270" y2="105" stroke="#0f172a" stroke-width="2"/>
      <!-- J4 Wrist Flange -->
      <circle cx="270" cy="105" r="7" stroke="#475569" fill="#f8fafc"/>
      <!-- End Effector Gripper Clamping Cylinder -->
      <path d="M270 105 L285 116" stroke="#0f172a" stroke-width="2"/>
      <line x1="280" y1="124" x2="292" y2="108" stroke="#0f172a" stroke-width="2"/>
      <line x1="280" y1="124" x2="288" y2="134" stroke="#0f172a" stroke-width="2"/>
      <line x1="292" y1="108" x2="300" y2="118" stroke="#0f172a" stroke-width="2"/>
      <!-- Workpiece Target -->
      <rect x="288" y="122" width="10" height="16" rx="2" stroke="#0f766e" stroke-width="1.5" fill="#ccfbf1"/>
    </svg>`,
    'image/svg+xml'
  );
  return document.importNode(d.documentElement, true);
};

/* ==========================================================================
   Screen 1: Đăng nhập & Quên mật khẩu
   ========================================================================== */
async function loginView(prefillUsername) {
  clearTimers();
  user = null;

  const cfg = await bridge.getCfg().catch(() => ({}));
  const savedUser = prefillUsername !== undefined ? prefillUsername : (cfg.rememberedUsername || '');

  const fSchool = h('input', {
    type: 'text',
    placeholder: 'Mã trường',
    autocomplete: 'organization'
  });

  const fUser = h('input', {
    type: 'text',
    placeholder: 'Mã học sinh (vd: HS0123)',
    autocomplete: 'username',
    value: savedUser
  });
  const fPass = h('input', {
    type: 'password',
    placeholder: '••••••••',
    autocomplete: 'current-password'
  });
  const rememberBox = h('input', {
    type: 'checkbox',
    checked: !!savedUser
  });

  const err = h('div', { class: 'err' });
  const btn = h('button', { style: 'width: 100%; margin-top: 16px;' }, 'Vào trạm thực hành');

  let showPw = false;
  const eyeBtn = h('button', {
    type: 'button',
    onclick: () => {
      showPw = !showPw;
      fPass.type = showPw ? 'text' : 'password';
      eyeBtn.textContent = showPw ? '[Ẩn]' : '[Hiện]';
    }
  }, '[Hiện]');

  const forgotBtn = h('button', {
    type: 'button',
    class: 'link-btn',
    onclick: () => accountCodeView('recover', fSchool.value.trim(), fUser.value.trim())
  }, 'Quên mật khẩu?');

  const setupBtn = h('button', {
    type: 'button', class: 'link-btn',
    onclick: () => accountCodeView('setup', fSchool.value.trim(), fUser.value.trim())
  }, 'Kích hoạt tài khoản lần đầu');

  const go = async () => {
    const schoolCode = fSchool.value.trim();
    const studentCode = fUser.value.trim();
    const password = fPass.value;

    if (!schoolCode || !studentCode) {
      err.textContent = 'Nhập mã trường và mã học sinh theo thông tin nhà trường cấp.';
      fUser.focus();
      return;
    }
    if (!password) {
      err.textContent = 'Vui lòng nhập mật khẩu';
      fPass.focus();
      return;
    }

    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Đang xác thực…';

    try {
      const auth = await call('login', { schoolCode, studentCode, password });
      await bridge.setCfg({
        ...cfg,
        rememberedUsername: rememberBox.checked ? studentCode : ''
      });
      if (auth?.passwordChangeRequired) { passwordChangeView(); return; }
      user = auth?.user || await call('me');
      shell();
    } catch (e) {
      err.textContent = (e.message || 'Đăng nhập không thành công');
      btn.disabled = false;
      btn.textContent = 'Vào trạm thực hành';
    }
  };

  btn.onclick = go;
  [fSchool, fUser, fPass].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
  });

  const brandPanel = h('div', { class: 'login-brand-panel' },
    h('div', { class: 'login-brand-head' },
      h('h1', {}, 'VISTA Lab Station'),
      h('span', { class: 'pill-tag neutral' },
        'SIMULATION · Physical control disabled'
      )
    ),
    h('div', { class: 'login-robot-art' }, robotSvg()),
    h('div', { class: 'login-brand-foot' },
      h('h2', {}, 'Trạm thực hành robot vật lý'),
      h('p', {}, 'Không gian học tập Blockly và Digital Twin dành cho các hoạt động được giao. Robot vật lý chỉ mở khi hệ thống xác thực và cho phép phiên an toàn.')
    )
  );

  const formSheet = h('div', { class: 'login-sheet' },
    h('h2', {}, 'Đăng nhập trạm máy'),
    h('div', { class: 'subtitle' }, 'Sử dụng tài khoản học sinh do nhà trường cấp để bắt đầu bài thực hành'),
    h('label', { class: 'f-label' }, 'Mã trường'),
    fSchool,
    h('label', { class: 'f-label' }, 'Mã học sinh'),
    fUser,
    h('label', { class: 'f-label' }, 'Mật khẩu'),
    h('div', { class: 'pw-wrap' }, fPass, eyeBtn),
    h('div', { class: 'form-row' },
      h('label', { class: 'check-label' }, rememberBox, 'Ghi nhớ đăng nhập'),
      forgotBtn
    ),
    h('div', { style: 'margin-top: 12px;' }, setupBtn),
    cfg.persistentSession === false
      ? h('div', { class: 'faint', style: 'margin-top: 10px;' }, 'Lưu phiên an toàn chưa khả dụng trên thiết bị này; bạn sẽ cần đăng nhập lại khi đóng ứng dụng.')
      : false,
    err,
    btn
  );

  const formPanel = h('div', { class: 'login-form-panel' }, formSheet);

  root.replaceChildren(h('div', { class: 'login-view' }, brandPanel, formPanel));

  if (savedUser) {
    fPass.focus();
  } else {
    fSchool.focus();
  }
}

function passwordChangeView(notice = '') {
  clearTimers(); user = null;
  const current = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mật khẩu tạm hiện tại' });
  const next = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Mật khẩu mới (12–128 ký tự)' });
  const confirm = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Nhập lại mật khẩu mới' });
  const err = h('div', { class: 'err', role: 'alert' }, notice);
  const submit = h('button', { style: 'width:100%;margin-top:16px;' }, 'Đổi mật khẩu và tiếp tục');
  const logout = h('button', { class: 'ghost', style: 'width:100%;margin-top:8px;', onclick: async () => { await call('logout').catch(() => {}); loginView(); } }, 'Thoát tài khoản');
  submit.onclick = async () => {
    if (next.value.length < 12 || next.value.length > 128 || !current.value || next.value !== confirm.value || next.value === current.value) {
      err.textContent = 'Mật khẩu mới cần dài 12–128 ký tự, khớp xác nhận và khác mật khẩu tạm.'; return;
    }
    submit.disabled = true; err.textContent = 'Đang cập nhật mật khẩu…';
    try {
      const result = await call('changeStudentPassword', { currentPassword: current.value, newPassword: next.value });
      current.value = next.value = confirm.value = '';
      user = result?.user || await call('me'); shell();
    } catch (e) { err.textContent = e.code === 'TEMPORARY_PASSWORD_EXPIRED' ? 'Mật khẩu tạm đã hết hạn. Liên hệ trường để được cấp lại.' : (e.message || 'Không thể đổi mật khẩu.'); submit.disabled = false; }
  };
  root.replaceChildren(h('div', { class: 'login-view' },
    h('div', { class: 'login-brand-panel' }, h('div', { class: 'login-brand-head' }, h('h1', {}, 'VISTA Lab Station')), h('div', { class: 'login-robot-art' }, robotSvg()), h('div', { class: 'login-brand-foot' }, h('h2', {}, 'Cần đổi mật khẩu tạm'), h('p', {}, 'VISTA yêu cầu đổi mật khẩu trước khi mở bài tập. Phiên giới hạn chỉ được dùng cho thao tác này.'))),
    h('div', { class: 'login-form-panel' }, h('div', { class: 'login-sheet' }, h('h2', {}, 'Đặt mật khẩu mới'), h('div', { class: 'subtitle' }, 'Mật khẩu mới phải có từ 12 đến 128 ký tự.'), h('label', { class: 'f-label' }, 'Mật khẩu tạm hiện tại'), current, h('label', { class: 'f-label' }, 'Mật khẩu mới'), next, h('label', { class: 'f-label' }, 'Xác nhận mật khẩu mới'), confirm, err, submit, logout))
  ));
  current.focus();
}

/* ==========================================================================
   Luồng Quên Mật Khẩu (Recovery Code qua Quản trị viên trường)
   ========================================================================== */
function accountCodeView(mode, initialSchool = '', initialStudent = '') {
  clearTimers();
  const isSetup = mode === 'setup';
  const fSchool = h('input', { type: 'text', placeholder: 'Mã trường', value: initialSchool, autocomplete: 'organization' });
  const fStudent = h('input', { type: 'text', placeholder: 'Mã học sinh', value: initialStudent, autocomplete: 'username' });
  const fCode = h('input', { type: 'password', placeholder: isSetup ? 'Mã kích hoạt do trường cấp' : 'Mã khôi phục dùng một lần', autocomplete: 'one-time-code' });
  const fPassword = h('input', { type: 'password', placeholder: 'Mật khẩu mới (ít nhất 12 ký tự)', autocomplete: 'new-password' });
  const err = h('div', { class: 'err' });
  const submit = h('button', { style: 'width: 100%; margin-top: 16px;' }, isSetup ? 'Kích hoạt và đăng nhập' : 'Đặt lại mật khẩu');
  const back = h('button', { class: 'ghost', style: 'width: 100%; margin-top: 8px;', onclick: () => loginView(fStudent.value.trim()) }, 'Quay lại đăng nhập');
  submit.onclick = async () => {
    if (!fSchool.value.trim() || !fStudent.value.trim() || fCode.value.length < 20 || fPassword.value.length < 12) {
      err.textContent = 'Nhập đầy đủ mã trường, mã học sinh, mã dùng một lần (tối thiểu 20 ký tự) và mật khẩu mới (tối thiểu 12 ký tự).';
      return;
    }
    submit.disabled = true;
    err.textContent = '';
    try {
      const values = { schoolCode: fSchool.value.trim(), studentCode: fStudent.value.trim(), password: fPassword.value };
      if (isSetup) {
        const result = await call('setupStudent', { ...values, setupCode: fCode.value.trim() });
        user = result?.user || await call('me');
        shell();
      } else {
        await call('recoverStudent', { ...values, recoveryCode: fCode.value.trim() });
        loginView(values.studentCode);
      }
    } catch (e) {
      err.textContent = e.message || 'Yêu cầu không hoàn tất.';
      submit.disabled = false;
    }
  };
  const title = isSetup ? 'Kích hoạt tài khoản học sinh' : 'Khôi phục tài khoản học sinh';
  const form = h('div', { class: 'login-sheet' },
    h('h2', {}, title),
    h('div', { class: 'subtitle' }, 'Mã dùng một lần và mật khẩu được xác thực trực tiếp bởi VISTA Education API.'),
    h('label', { class: 'f-label' }, 'Mã trường'), fSchool,
    h('label', { class: 'f-label' }, 'Mã học sinh'), fStudent,
    h('label', { class: 'f-label' }, isSetup ? 'Mã kích hoạt' : 'Mã khôi phục'), fCode,
    h('label', { class: 'f-label' }, 'Mật khẩu mới'), fPassword,
    err, submit, back
  );
  root.replaceChildren(h('div', { class: 'login-view' },
    h('div', { class: 'login-brand-panel' },
      h('div', { class: 'login-brand-head' }, h('h1', {}, 'VISTA Lab Station'), h('span', { class: 'pill-tag neutral' }, 'Education API')),
      h('div', { class: 'login-robot-art' }, robotSvg()),
      h('div', { class: 'login-brand-foot' }, h('h2', {}, title), h('p', {}, 'Không lưu mật khẩu trên thiết bị. Mã kích hoạt và mã khôi phục chỉ dùng theo luồng xác thực của nhà trường.'))
    ), h('div', { class: 'login-form-panel' }, form)
  ));
  fSchool.focus();
}

/* ==========================================================================
   Shell: Framed-Sheet Architecture
   ========================================================================== */
function shell() {
  const items = [
    ['labs', 'Lab của tôi'],
    ['workspace', 'Blockly & Simulation'],
    ['twin', 'SO-101 Digital Twin'],
    ['history', 'Lịch sử thực nghiệm'],
    ['robot', 'Kết nối & hiệu chuẩn SO-101'],
    ['setup', 'Thiết lập thiết bị'],
    ['settings', 'Cài đặt']
  ];
  const nav = h('nav', { class: 'sidebar-nav' }, items.map(([k, t]) =>
    h('button', { 'data-k': k, onclick: () => go(k) }, t)
  ));

  sidebarCoursesEl = h('div', { class: 'sidebar-courses', hidden: true });
  robotEl = h('div', { class: 'sidebar-robot-status' },
    h('div', { class: 'sidebar-robot-header' },
      h('span', { class: 'dot-live' }),
      'Kiểm tra kết nối…'
    )
  );

  sheetEl = h('div', { class: 'work-sheet' });

  root.replaceChildren(
    h('div', { class: 'app-shell' },
      h('aside', { class: 'app-sidebar' },
        h('div', { class: 'sidebar-brand' },
          h('div', { class: 'sidebar-brand-title' }, 'VISTA'),
          h('p', {}, 'Lab Station Console')
        ),
        nav,
        sidebarCoursesEl,
        h('div', { style: 'flex: 1;' }),
        robotEl,
        h('div', { class: 'sidebar-profile' },
          h('div', { class: 'profile-avatar' }, initials(user.name)),
          h('div', { class: 'profile-info' },
            h('div', { class: 'profile-name' }, user.name),
            h('div', { class: 'profile-meta' }, user.studentCode || user.username)
          ),
          h('button', {
            class: 'ghost',
            style: 'padding: 4px 8px; min-height: 28px; font-size: 11px;',
            onclick: async () => {
              window.dispatchEvent(new CustomEvent('vista:logout'));
              await call('logout');
              loginView();
            }
          }, 'Thoát')
        )
      ),
      sheetEl
    )
  );

  const go = (k) => {
    window.dispatchEvent(new CustomEvent('vista:navigate', { detail: { view: k, user } }));
    view = k;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.k === k));
    clearTimers();
    every(robot, 10000);
    if (k === 'labs') {
      sidebarCoursesEl.hidden = false;
      labsView();
    } else if (k === 'history') {
      sidebarCoursesEl.hidden = true;
      historyView();
    } else if (k === 'settings') {
      sidebarCoursesEl.hidden = true;
      settingsView();
    } else if (k === 'setup') {
      sidebarCoursesEl.hidden = true;
      setupWizardView();
    } else if (k === 'robot') {
      sidebarCoursesEl.hidden = true;
      robotStationView();
    } else {
      sidebarCoursesEl.hidden = true;
    }
  };

  go('labs');
}

async function robotStationView() {
  const roles = {
    leader: { label: 'Leader', port: '', deviceId: 'lab-so101-leader', status: null, joints: null, error: '' },
    follower: { label: 'Follower', port: '', deviceId: 'lab-so101-follower', status: null, joints: null, error: '' }
  };
  let ports = [];
  let calibration = null;
  let scanned = false;
  let profileChoices = [];
  let calibrationRole = 'leader';
  let profileId = 'lab-so101-leader';
  let hardwareAuthorized = false;
  let notice = '';
  let noticeKind = 'status';
  let busy = false;
  let pairId = 'pair-a';
  let pairStatuses = {};
  let teleopHeld = false;
  let deadmanGeneration = 0;
  let teleopTick = null;
  let teleopSequence = 0;
  let twinViewer = null;
  let twinCancel = null;
  let twinMounting = false;
  let leaderValues = { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper: 0 };
  const teleopLimits = {
    shoulder_pan: [-1.91986, 1.91986], shoulder_lift: [-1.7453293, 1.7453293],
    elbow_flex: [-1.69, 1.69], wrist_flex: [-1.658063, 1.658063],
    wrist_roll: [-2.7438473, 2.8412063], gripper: [-0.174533, 1.7453292]
  };
  const pairStatus = () => pairStatuses[pairId] || { state: 'DISCONNECTED', connected: false, enabled: false, deadmanHeld: false, emergencyStopLatched: false, physicalOutputEnabled: false, feedback: {} };
  const paintTeleopFeedback = (result) => {
    if (!result) return;
    if (result.status) pairStatuses[pairId] = result.status;
    const status = result.status || pairStatus();
    const statusEl = sheetEl?.querySelector('[data-teleop-state]');
    const noteEl = sheetEl?.querySelector('[data-teleop-note]');
    const feedbackEl = sheetEl?.querySelector('[data-follower-feedback]');
    const deadmanButton = sheetEl?.querySelector('[data-deadman]');
    if (statusEl) { statusEl.textContent = status.state || 'UNKNOWN'; statusEl.dataset.state = status.state || 'UNKNOWN'; }
    if (deadmanButton) { deadmanButton.textContent = teleopHeld ? 'HOLDING · RELEASE TO STOP' : 'HOLD TO RUN'; deadmanButton.setAttribute('aria-pressed', teleopHeld ? 'true' : 'false'); }
    if (noteEl) noteEl.textContent = result.reason ? `Command rejected safely: ${result.reason}` : `Fake pair ${pairId} · ${status.commandCount || 0} simulated commands · physical output disabled`;
    if (result.frame) {
      const frame = parseTwinFrame(result.frame, `local-so101-${pairId}`);
      if (frame && twinViewer) twinViewer.setFrame(frame);
    }
    if (feedbackEl && status.feedback) feedbackEl.textContent = Object.entries(status.feedback).map(([name, value]) => `${name.replaceAll('_', ' ')} ${Number(value).toFixed(3)} rad`).join(' · ');
  };
  const refreshTeleop = async () => {
    if (!bridge.teleopStatus) return;
    try { pairStatuses = await bridge.teleopStatus(); paintTeleopFeedback({ status: pairStatus() }); } catch {}
  };
  const releaseDeadman = async () => {
    if (teleopTick) clearInterval(teleopTick);
    teleopTick = null;
    if (!teleopHeld) return;
    teleopHeld = false;
    deadmanGeneration += 1;
    try { paintTeleopFeedback({ status: await bridge.teleopDeadman(pairId, false, true) }); }
    catch (error) { setNotice(`Deadman release failed; Edge watchdog will stop the fake pair: ${error.message}`, 'error'); }
    if (!twinViewer) render();
  };
  const stepTeleop = async () => {
    if (!teleopHeld || view !== 'robot') return;
    try {
      const result = await bridge.teleopStep({ pairId, leader: { ...leaderValues }, sequence: ++teleopSequence, timestamp: Date.now() / 1000, deadmanHeld: true });
      paintTeleopFeedback(result);
      if (!result.accepted) await releaseDeadman();
    } catch (error) {
      await releaseDeadman();
      setNotice(`Fake pair stopped safely: ${error.message}`, 'error');
    }
  };
  const pressDeadman = async (event) => {
    if (event) event.preventDefault();
    if (teleopHeld) return;
    teleopHeld = true;
    const generation = ++deadmanGeneration;
    const pressedButton = sheetEl?.querySelector('[data-deadman]');
    if (pressedButton) { pressedButton.textContent = 'HOLDING · RELEASE TO STOP'; pressedButton.setAttribute('aria-pressed', 'true'); }
    try {
      const armed = await bridge.teleopDeadman(pairId, true, true);
      if (!teleopHeld || generation !== deadmanGeneration) {
        await bridge.teleopDeadman(pairId, false, true).catch(() => {});
        return;
      }
      paintTeleopFeedback({ status: armed });
      paintTeleopFeedback({ status: pairStatus() });
      void stepTeleop();
      teleopTick = setInterval(() => { void stepTeleop(); }, 50);
      const button = sheetEl?.querySelector('[data-deadman]');
      if (Number.isInteger(event?.pointerId)) button?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      if (generation === deadmanGeneration) teleopHeld = false;
      paintTeleopFeedback({ status: pairStatus() });
      setNotice(`Deadman was not engaged: ${error.message}`, 'error');
    }
  };
  const stopOnFocusLoss = () => { if (teleopHeld) void releaseDeadman(); };
  const stopDeadmanEvents = (event) => {
    if (event.type === 'keyup' && event.key !== ' ' && event.key !== 'Enter') return;
    if (!teleopHeld) return;
    void releaseDeadman();
  };
  const stopOnNavigate = () => {
    window.removeEventListener('blur', stopOnFocusLoss);
    document.removeEventListener('visibilitychange', stopOnFocusLoss);
    window.removeEventListener('pointerup', stopDeadmanEvents);
    window.removeEventListener('pointercancel', stopDeadmanEvents);
    window.removeEventListener('keyup', stopDeadmanEvents);
    window.removeEventListener('beforeunload', stopOnNavigate);
    window.removeEventListener('vista:navigate', stopOnNavigate);
    window.removeEventListener('vista:session-expired', stopOnNavigate);
    window.removeEventListener('vista:logout', stopOnNavigate);
    if (teleopTick) clearInterval(teleopTick);
    teleopTick = null;
    teleopHeld = false;
    deadmanGeneration += 1;
    twinCancel?.(); twinCancel = null;
    twinViewer?.dispose(); twinViewer = null;
    if (bridge.teleopDisconnect) {
      for (const id of ['pair-a', 'pair-b']) void bridge.teleopDisconnect(id).catch(() => {});
    }
  };
  window.addEventListener('blur', stopOnFocusLoss);
  document.addEventListener('visibilitychange', stopOnFocusLoss);
  window.addEventListener('pointerup', stopDeadmanEvents);
  window.addEventListener('pointercancel', stopDeadmanEvents);
  window.addEventListener('keyup', stopDeadmanEvents);
  window.addEventListener('vista:navigate', stopOnNavigate, { once: true });
  window.addEventListener('vista:session-expired', stopOnNavigate, { once: true });
  window.addEventListener('vista:logout', stopOnNavigate, { once: true });
  window.addEventListener('beforeunload', stopOnNavigate, { once: true });

  const roleFromStatus = (role) => {
    const row = roles[role];
    return row.status || null;
  };
  const setNotice = (message, kind = 'status') => { notice = message; noticeKind = kind; render(); };
  const scanPorts = async () => {
    busy = true; render();
    try {
      const result = await bridge.edgePorts();
      ports = Array.isArray(result.items) ? result.items : [];
      scanned = true;
      setNotice(ports.length ? `${ports.length} serial port(s) detected by this Edge Runtime.` : 'No serial ports were detected.');
    } catch (error) { setNotice(`Port discovery failed: ${error.message}`, 'error'); }
    finally { busy = false; render(); }
  };
  const loadState = async () => {
    try { importedPolicies = (await bridge.listPolicies()).items || []; } catch {}
    try {
      const status = await bridge.edgeDiagnostics();
      roles.follower.status = status.status?.physical || roles.follower.status;
      roles.leader.status = status.status?.leader || roles.leader.status;
    } catch {}
    try { calibration = await bridge.edgeCalibrationStatus(); } catch (error) { calibration = { status: 'unavailable', error: error.message }; }
    try {
      const profileResult = await bridge.edgeCalibrationProfiles(calibrationRole);
      profileChoices = Array.isArray(profileResult.items) ? profileResult.items : [];
    } catch { profileChoices = []; }
    for (const role of ['leader', 'follower']) {
      const state = roleFromStatus(role);
      if (!state?.connected) { roles[role].joints = null; continue; }
      try {
        roles[role].joints = await bridge.edgeJointState(role);
        roles[role].error = '';
      } catch (error) { roles[role].joints = null; roles[role].error = error.message; }
    }
    try { if (bridge.teleopStatus) pairStatuses = await bridge.teleopStatus(); } catch {}
    if (!teleopHeld && !twinViewer && !policyTwinViewer) render();
  };
  const render = () => {
    if (view !== 'robot') return;
    if (twinViewer) { twinViewer.dispose(); twinViewer = null; twinCancel = null; twinMounting = false; }
    const portOptions = (selected) => [
      h('option', { value: '' }, ports.length ? 'Choose a detected serial port' : 'Scan ports before selecting'),
      ...ports.map((port) => h('option', { value: port.path, selected: port.path === selected }, `${port.path} · ${port.description || 'Serial device'}${port.likelyRobot ? ' · likely robot interface' : ''}`))
    ];
    const rolePanel = (role) => {
      const row = roles[role];
      const other = roles[role === 'leader' ? 'follower' : 'leader'];
      const connected = Boolean(row.status?.connected);
      const joints = row.joints?.joints || {};
      const jointNames = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
      return h('section', { class: 'robot-role-panel', 'aria-label': `${row.label} device` },
        h('div', { class: 'robot-role-head' }, h('h2', {}, row.label), h('span', { class: `robot-state ${connected ? 'connected' : ''}`, role: 'status' }, connected ? 'Connected · read only' : 'Disconnected')),
        h('label', { class: 'robot-field' }, 'Serial port', h('select', { 'aria-label': `${row.label} serial port`, value: row.port, disabled: connected, onchange: (event) => { row.port = event.target.value; render(); } }, ...portOptions(row.port))),
        h('label', { class: 'robot-field' }, 'LeRobot calibration profile ID', h('input', { value: row.deviceId, maxlength: '64', disabled: connected, 'aria-label': `${row.label} LeRobot profile ID`, oninput: (event) => { row.deviceId = event.target.value; } })),
        h('div', { class: 'robot-actions' },
          h('button', { class: 'primary', disabled: busy || !row.port || connected || !ports.some((port) => port.path === row.port) || (other.status?.connected && other.status.port === row.port), onclick: async () => {
            busy = true; render();
            try {
              if (!window.confirm(`Connect the ${row.label} using LeRobot for status and calibrated joint readback only? LeRobot may configure communication registers. No motion command is available.`)) return;
              row.status = await bridge.edgeConnect({ role, port: row.port, deviceId: row.deviceId.trim(), confirmed: true });
              setNotice(`${row.label} connected. Physical motion remains disabled.`);
            } catch (error) { row.error = error.message; setNotice(`${row.label} connection failed: ${error.message}`, 'error'); }
            finally { busy = false; render(); }
          } }, connected ? 'Connected' : `Connect ${row.label} · read only`),
          h('button', { class: 'ghost', disabled: busy || !connected, onclick: async () => {
            busy = true; render();
            try { row.status = await bridge.edgeDisconnect(role); row.joints = null; row.error = ''; setNotice(`${row.label} disconnected.`); }
            catch (error) { setNotice(`Disconnect failed: ${error.message}`, 'error'); }
            finally { busy = false; render(); }
          } }, 'Disconnect')),
        h('p', { class: 'robot-meta' }, `Calibration: ${row.status?.calibration || (row.status?.calibrated ? 'verified' : 'not verified')} · motionEnabled=false`),
        row.error ? h('p', { class: 'robot-error', role: 'alert' }, row.error) : null,
        h('div', { class: 'robot-joints', 'aria-label': `${row.label} measured joint values` },
          ...jointNames.map((name) => {
            const value = joints[name];
            return h('div', { class: 'robot-joint-row' }, h('span', {}, name.replaceAll('_', ' ')), h('strong', {}, Number.isFinite(value) ? `${Number(value).toFixed(2)}°` : '—'));
          })),
        h('p', { class: 'robot-meta' }, connected && !row.status?.calibrated ? 'Joint positions stay unavailable until LeRobot confirms a calibration profile.' : row.joints?.measured ? `Measured locally · ${new Date(row.joints.timestamp * 1000).toLocaleTimeString()}` : 'No live hardware values. Dashes are unavailable data, not zero.'));
    };
    const ranges = calibration?.ranges || {};
    const calibrationState = calibration?.status || 'idle';
    const calControls = h('section', { class: 'robot-calibration-panel', 'aria-label': 'Guided LeRobot calibration' },
      h('div', { class: 'robot-section-title' }, h('div', {}, h('h2', {}, 'Guided calibration'), h('p', {}, 'LeLab’s verified sequence: neutral homing capture, then manual joint-range recording.')),
        h('span', { class: `robot-state ${calibration?.calibrated ? 'connected' : ''}`, role: 'status' }, calibrationState)),
      h('div', { class: 'robot-calibration-grid' },
        h('label', { class: 'robot-field' }, 'Device', h('select', { value: calibrationRole, 'aria-label': 'Calibration device role', onchange: (event) => { calibrationRole = event.target.value; profileId = roles[calibrationRole].deviceId; loadState(); } }, h('option', { value: 'leader' }, 'Leader'), h('option', { value: 'follower' }, 'Follower'))),
        h('label', { class: 'robot-field' }, 'Serial port', h('select', { value: roles[calibrationRole].port, 'aria-label': 'Calibration serial port', onchange: (event) => { roles[calibrationRole].port = event.target.value; render(); } }, ...portOptions(roles[calibrationRole].port))),
        h('label', { class: 'robot-field' }, 'Saved LeRobot profile', h('select', { value: profileChoices.some((item) => item.id === profileId) ? profileId : '', 'aria-label': 'Saved LeRobot calibration profiles', onchange: (event) => { if (event.target.value) { profileId = event.target.value; roles[calibrationRole].deviceId = profileId; render(); } } }, h('option', { value: '' }, profileChoices.length ? 'Choose a saved profile to reload' : 'No saved profiles found'), ...profileChoices.map((item) => h('option', { value: item.id }, `${item.id} · ${new Date(item.modified * 1000).toLocaleDateString()}`)))),
        h('label', { class: 'robot-field' }, 'Profile ID for save or reload', h('input', { value: profileId, maxlength: '64', 'aria-label': 'Calibration profile ID', oninput: (event) => { profileId = event.target.value; } }))),
      h('ol', { class: 'robot-calibration-steps' },
        h('li', {}, h('strong', {}, 'Neutral homing capture'), h('p', {}, 'Place all joints near the middle of travel. Starting calibration disables torque, selects position operating mode, resets the device calibration, reads encoder positions, and writes half-turn homing offsets.'), h('span', {}, calibration?.step >= 1 ? 'Confirmed by Edge Runtime' : 'Waiting')),
        h('li', {}, h('strong', {}, 'Record joint ranges'), h('p', {}, 'With torque disabled, manually sweep every joint from its minimum to maximum safe range. Stop if any cable, object, or person is in the arm’s path.'), h('span', {}, calibrationState === 'recording' ? 'Recording live encoder ranges' : calibration?.calibrated ? 'Profile saved by LeRobot' : 'Waiting'))),
      h('label', { class: 'robot-consent' }, h('input', { type: 'checkbox', checked: hardwareAuthorized, onchange: (event) => { hardwareAuthorized = event.target.checked; render(); } }), 'I am supervising the connected hardware and authorize this manual calibration procedure.'),
      h('div', { class: 'robot-actions' },
        h('button', { class: 'primary', disabled: busy || calibration?.active || !hardwareAuthorized || !roles[calibrationRole].port, onclick: async () => {
          if (!window.confirm('Calibration writes homing offsets and saves a local LeRobot profile. Torque is disabled; an operator must move the arm by hand. Continue on the selected hardware?')) return;
          busy = true; render();
          try {
            roles[calibrationRole].deviceId = profileId.trim();
            calibration = await bridge.edgeCalibrationStart({ role: calibrationRole, port: roles[calibrationRole].port, profileId: profileId.trim(), confirmed: true });
            setNotice('Calibration started by the local Edge Runtime. Watch the live range table and stop if the setup is unsafe.');
          } catch (error) { setNotice(`Calibration was not started: ${error.message}`, 'error'); }
          finally { busy = false; render(); }
        } }, 'Start guided calibration'),
        h('button', { class: 'ghost', disabled: busy || calibrationState !== 'recording', onclick: async () => {
          try { await bridge.edgeCalibrationCompleteStep(); await loadState(); }
          catch (error) { setNotice(`Could not finish range recording: ${error.message}`, 'error'); }
        } }, 'Finish range recording'),
        h('button', { class: 'ghost', disabled: busy || !calibration?.active, onclick: async () => {
          busy = true; render();
          try { calibration = await bridge.edgeCalibrationStop(); setNotice('Calibration stopped. An incomplete profile is not marked calibrated.'); }
          catch (error) { setNotice(`Could not stop calibration: ${error.message}`, 'error'); }
          finally { busy = false; render(); }
        } }, 'Stop and disconnect')),
      h('div', { class: 'robot-range-table', 'aria-live': 'polite' },
        ...Object.entries(ranges).map(([name, value]) => h('div', { class: 'robot-range-row' }, h('strong', {}, name.replaceAll('_', ' ')), h('span', {}, `min ${Number(value.min).toFixed(0)}`), h('span', {}, `now ${Number(value.current).toFixed(0)}`), h('span', {}, `max ${Number(value.max).toFixed(0)}`))),
        !Object.keys(ranges).length ? h('p', { class: 'robot-meta' }, 'Live encoder ranges appear only after the selected hardware starts calibration.') : null),
      calibration?.message ? h('p', { class: 'robot-meta', role: 'status' }, calibration.message) : null,
      calibration?.warnings?.length ? h('p', { class: 'robot-warning', role: 'status' }, `LeRobot range warning: ${calibration.warnings.join('; ')}`) : null,
      calibration?.error ? h('p', { class: 'robot-error', role: 'alert' }, calibration.error) : null,
      h('p', { class: 'robot-meta' }, `${profileChoices.length} stored profile(s) listed from the LeRobot calibration directory. Choose one above to reuse its ID, then connect that role; LeRobot loads it from disk and VISTA reports calibrated only when the driver confirms it.`));
    const policyPanel = h('section', { class: 'robot-teleop-panel', 'aria-label': 'Hugging Face policy management' },
      h('div', { class: 'robot-section-title' }, h('div', {}, h('h2', {}, 'Hugging Face policies'), h('p', {}, 'Import version-pinned LeRobot checkpoints. Repository code is never executed.'))),
      h('div', { class: 'robot-actions' },
        h('label', { class: 'robot-field' }, 'Repository ID or URL', h('input', { value: policyRepo, maxlength: '220', placeholder: 'owner/model', oninput: (event) => { policyRepo = event.target.value; } })),
        h('label', { class: 'robot-field' }, 'Revision', h('input', { value: policyRevision, maxlength: '128', oninput: (event) => { policyRevision = event.target.value; } })),
        h('button', { class: 'ghost', onclick: async () => { try { const m = await bridge.inspectPolicy(policyRepo, policyRevision); policyStatus = `${m.repositoryId}@${m.commit} · ${m.files.length} files`; } catch (e) { policyStatus = e.message; } render(); } }, 'Inspect'),
        h('button', { class: 'primary', onclick: async () => { policyStatus = 'Downloading and validating repository artifacts…'; const off = bridge.onPolicyProgress?.((p) => { policyStatus = `Downloading ${p.file} · ${Number(p.downloadedBytes || 0).toLocaleString()} bytes`; const status = sheetEl?.querySelector('[data-policy-status]'); if (status) status.textContent = policyStatus; }); render(); try { await bridge.importPolicy(policyRepo, policyRevision); importedPolicies = (await bridge.listPolicies()).items || []; policyStatus = 'Artifacts checked. Load validates this checkpoint against the installed LeRobot runtime.'; } catch (e) { policyStatus = e.message; } finally { off?.(); } render(); } }, 'Import model')),
      h('label', { class: 'robot-field' }, 'Task prompt', h('textarea', { value: policyPrompt, maxlength: '1000', placeholder: 'Describe the task for this policy', oninput: (event) => { policyPrompt = event.target.value; } })),
      h('div', { class: 'robot-actions' },
        h('label', { class: 'robot-field' }, 'Installed policy', h('select', { value: activePolicyId, onchange: (event) => { activePolicyId = event.target.value; render(); } }, h('option', { value: '' }, 'Select an imported policy'), ...importedPolicies.map((p) => h('option', { value: p.policyId }, `${p.repositoryId} · ${p.architecture} · ${p.status}`)))),
        h('button', { class: 'ghost', disabled: !activePolicyId, onclick: async () => { try { const p = await bridge.loadPolicy(activePolicyId, 'cpu'); policyStatus = `Loaded ${p.architecture}; prompt ${p.supportsPrompt ? 'supported' : 'ignored'}.`; } catch (e) { policyStatus = e.message; } render(); } }, 'Load'),
        h('button', { class: 'ghost', onclick: async () => { try { await bridge.unloadPolicy(); activePolicyId = ''; policyStatus = 'Policy unloaded.'; importedPolicies = (await bridge.listPolicies()).items || []; } catch (e) { policyStatus = e.message; } render(); } }, 'Unload'),
        h('button', { class: 'ghost', disabled: !activePolicyId, onclick: async () => { try { await bridge.stopPolicy(); policyStatus = 'Inference stop requested; stale results will be discarded.'; } catch (e) { policyStatus = e.message; } render(); } }, 'Stop'),
        h('button', { class: 'primary', disabled: !activePolicyId || teleopHeld, onclick: async () => { policyStatus = 'Capturing a local MuJoCo observation and running policy inference…'; const status = sheetEl?.querySelector('[data-policy-status]'); if (status) status.textContent = policyStatus; try { const result = await bridge.runPolicy(policyPrompt); policyStatus = `LeRobot inference ran; ${result.promptUsed ? 'prompt used' : 'prompt ignored'}; action validated and applied to MuJoCo (${result.simulation.engine}).`; if (result.simulation?.final && policyTwinViewer) { const frame = parseTwinFrame(result.simulation.final, 'local-so101-simulation'); if (frame) policyTwinViewer.setFrame(frame); } } catch (e) { policyStatus = e.message; } if (status) status.textContent = policyStatus; } }, 'Run policy'),
        h('button', { class: 'ghost', onclick: async (event) => { event.currentTarget.disabled = true; try { const host = sheetEl.querySelector('[data-policy-twin]'); policyTwinViewer = await mountTwinViewer(host); const latest = host.__lastPolicyFrame; if (latest) policyTwinViewer.setFrame(latest); event.currentTarget.textContent = 'Twin loaded'; } catch (e) { policyStatus = `Policy Twin: ${e.message}`; event.currentTarget.disabled = false; } } }, policyTwinViewer ? 'Twin loaded' : 'Load policy Twin')),
      h('div', { class: 'teleop-twin-viewport', 'data-policy-twin': true }),
      h('div', {}, ...importedPolicies.map((p) => h('p', { class: 'robot-meta' }, `${p.repositoryId}@${p.commit} · ${p.architecture} · prompt ${p.supportsPrompt ? 'supported' : 'not used'} · ${p.status}`))),
      h('p', { class: 'robot-meta', 'data-policy-status': true, role: 'status', 'aria-live': 'polite' }, policyStatus),
      h('p', { class: 'robot-warning' }, 'Policy actions run only in the local MuJoCo simulation. Physical output remains disabled.'));
    const teleopState = pairStatus();
    const fakeTeleop = h('section', { class: 'robot-teleop-panel', 'aria-label': 'Fake-device Leader Follower teleoperation' },
      h('div', { class: 'robot-section-title' }, h('div', {}, h('h2', {}, 'Leader → Follower teleoperation'), h('p', {}, 'Simulation-only practice path. Commands terminate in an in-memory fake Follower and the existing SO-101 Twin viewer.')),
        h('span', { class: 'robot-state', 'data-teleop-state': true, 'data-state': teleopState.state, role: 'status', 'aria-live': 'polite' }, teleopState.state)),
      h('div', { class: 'teleop-warning' }, h('strong', {}, 'FAKE DEVICES ONLY · PHYSICAL OUTPUT DISABLED'), h('p', {}, 'This panel cannot send serial commands. Connecting, enabling, and holding the deadman are separate actions. Release the hold button or leave the screen to stop command flow.')),
      h('div', { class: 'teleop-controls' },
        h('label', { class: 'robot-field' }, 'Virtual pair', h('select', { value: pairId, disabled: teleopHeld, onchange: async (event) => {
          await releaseDeadman();
          pairId = event.target.value; leaderValues = Object.fromEntries(Object.keys(teleopLimits).map((name) => [name, 0]));
          await refreshTeleop(); render();
        } }, h('option', { value: 'pair-a' }, 'Pair A · fake Leader/Follower'), h('option', { value: 'pair-b' }, 'Pair B · fake Leader/Follower'))),
        h('span', { class: 'robot-meta' }, `Virtual ports: fake://${pairId}/leader · fake://${pairId}/follower`)),
      h('div', { class: 'robot-actions teleop-actions' },
        h('button', { class: 'primary', disabled: teleopState.connected, onclick: async () => {
          try {
            if (!window.confirm(`Create ${pairId} using fake devices only? No serial port will be opened.`)) return;
            pairStatuses[pairId] = await bridge.teleopConfigurePair(pairId, true); paintTeleopFeedback({ status: pairStatus() }); render();
          } catch (error) { setNotice(`Fake pair connection failed: ${error.message}`, 'error'); }
        } }, teleopState.connected ? 'Fake pair connected' : 'Connect fake pair'),
        h('button', { class: 'ghost', disabled: !teleopState.connected || teleopState.enabled, onclick: async () => {
          try {
            if (!window.confirm('Arm this fake pair? Commands remain blocked until you hold the deadman.')) return;
            pairStatuses[pairId] = await bridge.teleopEnable(pairId, true); paintTeleopFeedback({ status: pairStatus() }); render();
          } catch (error) { setNotice(`Pair did not arm: ${error.message}`, 'error'); }
        } }, 'Enable pair'),
        h('button', { class: 'ghost', disabled: !teleopState.enabled, onclick: async () => {
          await releaseDeadman();
          try { pairStatuses[pairId] = await bridge.teleopDisable(pairId); paintTeleopFeedback({ status: pairStatus() }); render(); }
          catch (error) { setNotice(`Pair could not be disabled: ${error.message}`, 'error'); }
        } }, 'Disable pair'),
        h('button', { class: 'deadman-button', 'data-deadman': true, disabled: !teleopState.enabled || teleopState.emergencyStopLatched || teleopState.state === 'FAULT', 'aria-label': 'Hold to run fake Leader to Follower teleoperation', 'aria-pressed': teleopHeld ? 'true' : 'false', onpointerdown: pressDeadman, onpointerup: releaseDeadman, onpointercancel: releaseDeadman, onlostpointercapture: releaseDeadman, onkeydown: (event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) void pressDeadman(event); }, onkeyup: (event) => { if (event.key === ' ' || event.key === 'Enter') void releaseDeadman(); } }, teleopHeld ? 'HOLDING · RELEASE TO STOP' : 'HOLD TO RUN'),
        h('button', { class: 'danger-action', disabled: !teleopState.connected || teleopState.emergencyStopLatched, onclick: async () => {
          if (teleopHeld) { if (teleopTick) clearInterval(teleopTick); teleopTick = null; teleopHeld = false; }
          try { pairStatuses[pairId] = await bridge.teleopEmergencyStop(pairId); paintTeleopFeedback({ status: pairStatus() }); render(); }
          catch (error) { setNotice(`Emergency stop request failed: ${error.message}`, 'error'); }
        } }, 'Emergency stop'),
        h('button', { class: 'ghost', disabled: !teleopState.emergencyStopLatched, onclick: async () => {
          try {
            if (!window.confirm('Reset the simulation emergency stop? The pair will remain disabled and must be enabled again.')) return;
            pairStatuses[pairId] = await bridge.teleopReset(pairId, true); paintTeleopFeedback({ status: pairStatus() }); render();
          } catch (error) { setNotice(`Emergency stop reset refused: ${error.message}`, 'error'); }
        } }, 'Reset stop'),
        h('button', { class: 'ghost', disabled: teleopState.state === 'DISCONNECTED', onclick: async () => {
          await releaseDeadman();
          try { pairStatuses[pairId] = await bridge.teleopDisconnect(pairId); paintTeleopFeedback({ status: pairStatus() }); render(); }
          catch (error) { setNotice(`Fake pair disconnect failed: ${error.message}`, 'error'); }
        } }, 'Disconnect pair')),
      h('p', { class: 'robot-meta', 'data-teleop-note': true, role: 'status', 'aria-live': 'polite' }, `${teleopState.mode || 'Fake simulation'} · ${teleopState.commandCount || 0} commands · physical output disabled${teleopState.fault ? ` · ${teleopState.fault}` : ''}`),
      teleopState.fault ? h('p', { class: 'robot-error', role: 'alert' }, `Pair fault: ${teleopState.fault}. Disconnect/reconnect and explicitly re-arm to resume.`) : null,
      h('div', { class: 'fake-leader-grid', 'aria-label': 'Fake Leader joint input' },
        ...Object.entries(teleopLimits).map(([name, [lower, upper]]) => h('label', { class: 'fake-joint-control' },
          h('span', {}, name.replaceAll('_', ' ')),
          h('input', { type: 'range', min: (lower * 180 / Math.PI).toFixed(1), max: (upper * 180 / Math.PI).toFixed(1), step: '0.5', value: (leaderValues[name] * 180 / Math.PI).toFixed(1), disabled: !teleopState.connected, 'aria-label': `Fake Leader ${name} position in degrees`, oninput: (event) => {
            leaderValues[name] = Number(event.target.value) * Math.PI / 180;
            const output = event.target.parentElement.querySelector('[data-value]');
            if (output) output.textContent = `${Number(event.target.value).toFixed(1)}°`;
          } }),
          h('output', { 'data-value': true }, `${(leaderValues[name] * 180 / Math.PI).toFixed(1)}°`)))),
      h('div', { class: 'teleop-twin-panel' },
        h('div', { class: 'robot-section-title' }, h('div', {}, h('h3', {}, 'Digital Twin feedback'), h('p', {}, 'The existing SO-101 URDF viewer receives validated fake Follower joint frames while the deadman is held.')),
          h('button', { class: 'ghost', disabled: twinMounting || Boolean(twinViewer), onclick: async (event) => {
            twinMounting = true; event.currentTarget.disabled = true; event.currentTarget.textContent = 'Loading Twin…';
            try {
              const host = sheetEl.querySelector('[data-fake-twin]');
              twinViewer = await mountTwinViewer(host, (cancel) => { twinCancel = cancel; if (view !== 'robot') cancel(); });
              if (view !== 'robot') { twinViewer.dispose(); twinViewer = null; }
              else { paintTeleopFeedback({ status: pairStatus(), frame: pairStatus().connected ? { schema_version: 1, robot_id: `local-so101-${pairId}`, source_mode: 'SIMULATION', controller_id: `fake-teleop-${pairId}`, sequence: Math.max(0, teleopSequence), connection: 'connected', calibration_status: 'NOT_APPLICABLE', measured_at: new Date().toISOString(), measured: Object.entries(pairStatus().feedback || Object.fromEntries(Object.keys(teleopLimits).map((name) => [name, 0]))).map(([name, position]) => ({ name, position, unit: 'rad' })), calibrated: null } : null }); }
            } catch (error) { setNotice(`Twin model unavailable: ${error.message}`, 'error'); }
            finally { twinMounting = false; if (twinViewer) { event.currentTarget.textContent = 'Twin loaded'; } else { event.currentTarget.disabled = false; event.currentTarget.textContent = 'Load SO-101 Twin'; } }
          } }, twinViewer ? 'Twin loaded' : twinMounting ? 'Loading Twin…' : 'Load SO-101 Twin')),
        h('div', { class: 'teleop-twin-viewport', 'data-fake-twin': true }),
        h('p', { class: 'robot-meta', 'data-follower-feedback': true, 'aria-live': 'polite' }, Object.entries(teleopState.feedback || {}).map(([name, value]) => `${name.replaceAll('_', ' ')} ${Number(value).toFixed(3)} rad`).join(' · ') || 'Follower feedback will appear after an accepted fake command.')));
    sheetEl.replaceChildren(h('div', { class: 'sheet-container robot-station' },
      h('div', { class: 'view-title-row' }, h('div', {}, h('h1', {}, 'SO-101 connection & calibration'), h('p', { class: 'view-subline' }, 'LeLab-inspired Leader/Follower setup, adapted to VISTA’s local Edge Runtime and security boundaries.'))),
      h('div', { class: 'setup-summary', 'aria-label': 'Physical teleoperation safety lock', 'data-physical-motion-lock': 'disabled' }, h('span', { class: 'setup-badge' }, 'MOTION DISABLED'), ' Physical teleoperation is disabled. Connection and calibration require direct operator confirmation. Fake-device teleoperation runs only in simulation; no physical follower command path is available.'),
      notice ? h('p', { class: noticeKind === 'error' ? 'robot-error' : 'setup-notice', role: noticeKind === 'error' ? 'alert' : 'status' }, notice) : null,
      h('div', { class: 'robot-section-title' }, h('div', {}, h('h2', {}, 'Connection'), h('p', {}, 'Scan actual OS serial ports, then assign different explicit ports to the Leader and Follower.')),
        h('button', { class: 'ghost', disabled: busy, onclick: scanPorts }, busy ? 'Working…' : 'Scan serial ports')),
      ports.length ? h('p', { class: 'robot-meta' }, `${ports.length} port(s) discovered by pyserial. “Likely robot” is a USB description heuristic, not device verification.`) : h('p', { class: 'robot-empty' }, scanned ? 'No serial ports are currently available. Connect the arm’s USB adapters and scan again.' : 'No device discovery has been run. Scanning does not fabricate ports or open a serial connection.'),
      h('div', { class: 'robot-role-grid' }, rolePanel('leader'), rolePanel('follower')),
      calControls, policyPanel, fakeTeleop,
      h('button', { class: 'robot-twin-link', onclick: () => document.querySelector('[data-k="twin"]')?.click() }, 'Open the existing authorized SO-101 Digital Twin')));
  };
  render();
  await loadState();
  const poll = setInterval(() => { if (view === 'robot') loadState(); }, 1000);
  timers.push(poll);
}

async function setupWizardView() {
  sheetEl.replaceChildren(h('div', { class: 'sheet-container' }, h('h1', {}, 'Thiết lập Edge & SO-101'), h('p', {}, 'Đang kiểm tra runtime cục bộ…')));
  const rows = h('div', { class: 'setup-grid', 'aria-live': 'polite' });
  let diagnostics = null;
  let ports = [];
  let robotStatus = null;
  let provisioning = null;
  let notice = '';
  let enrollmentCode = '';
  const badge = (state) => h('span', { class: `setup-badge ${state === 'READY' ? 'ready' : ''}` }, state);
  const render = () => {
    if (view !== 'setup') return;
    const health = diagnostics?.health || {};
    const runtimeState = diagnostics?.state || 'BLOCKED';
    const driver = (name) => health.drivers?.[name] ? 'READY' : 'BLOCKED';
    rows.replaceChildren(
      setupCard('Runtime health', runtimeState, diagnostics?.error || `Edge ${health.version || 'n/a'} · Python ${health.python || 'n/a'} · chế độ ${health.mode || 'n/a'}`),
      setupCard('Robot discovery', ports.length ? 'ACTION REQUIRED' : (runtimeState === 'READY' ? 'ACTION REQUIRED' : 'BLOCKED'), ports.length ? `${ports.length} cổng serial được phát hiện; cần chọn chính xác một cổng.` : (runtimeState === 'READY' ? 'Không tìm thấy cổng serial.' : 'Runtime chưa sẵn sàng để quét thiết bị.')),
      setupCard('Driver verification', driver('lerobot') === 'READY' && driver('pyserial') === 'READY' ? 'READY' : 'BLOCKED', `LeRobot ${driver('lerobot')} · pyserial ${driver('pyserial')}`),
      setupCard('Calibration readiness', robotStatus?.calibration || (robotStatus?.calibrated ? 'READY' : 'ACTION REQUIRED'), robotStatus?.connected ? 'Kết nối chỉ đọc. Không chạy quy trình hiệu chuẩn tại đây.' : 'Chưa kết nối. Hiệu chuẩn thủ công được thực hiện theo quy trình an toàn của phòng lab.'),
      setupCard('MuJoCo simulation', health.simulation?.available ? 'READY' : (driver('mujoco') === 'READY' ? 'ACTION REQUIRED' : 'BLOCKED'), health.simulation?.available ? `MuJoCo ${health.simulation.engine} · ${health.simulation.model} · mô hình sáu khớp đã xác thực.` : (health.simulation?.error || 'MuJoCo chưa có trong Edge Runtime này. Schematic không được xem là mô phỏng vật lý.')),
      setupCard('Device provisioning', provisioning?.state === 'ACTIVE' ? 'READY' : (provisioning?.state === 'KEY_READY' ? 'ACTION REQUIRED' : 'NOT PROVISIONED'),
        provisioning?.state === 'ACTIVE' ? `Backend xác nhận ACTIVE · ${provisioning.deviceId} · SHA-256 ${provisioning.fingerprint?.slice(0, 16) || 'n/a'}…` : (provisioning?.state === 'KEY_READY' ? `Khóa Ed25519 được mã hoá trong kho hệ điều hành · SHA-256 ${provisioning.fingerprint?.slice(0, 16) || 'n/a'}… Nhập mã dùng một lần do quản trị viên VISTA cấp.` : 'Tạo khóa cục bộ, sau đó nhập mã enrollment dùng một lần do quản trị viên VISTA cấp.')),
      setupCard('MQTT connectivity', 'BLOCKED', 'Cần provisioning và chứng thư AWS IoT; không kết nối Production AWS.'),
      setupCard('Final readiness', robotStatus?.connected && robotStatus.calibrated ? 'SIMULATION ONLY' : 'SIMULATION ONLY', 'Chỉ simulation được phép. Chuyển động vật lý bị tắt trong driver.')
    );
    if (notice) rows.prepend(h('p', { class: 'setup-notice', role: 'status' }, notice));
    const selector = h('select', { 'aria-label': 'Cổng serial SO-101' },
      h('option', { value: '' }, 'Chọn cổng serial…'),
      ...ports.map((port) => h('option', { value: port.path }, `${port.path} · ${port.description}${port.likelyRobot ? ' · có thể là robot' : ''}`)));
    const deviceId = h('input', { type: 'text', value: 'lab-so101', maxlength: '64', 'aria-label': 'Robot ID' });
    const refresh = h('button', { class: 'ghost', onclick: refreshAll }, 'Làm mới kiểm tra');
    const selectModel = h('button', { class: 'ghost', onclick: async () => {
      try {
        const selected = await bridge.selectMuJoCoModel();
        if (!selected.canceled) notice = `Đã tải và xác thực mô hình MuJoCo ${selected.model}.`;
        await refreshAll();
      } catch (e) { notice = `Không thể tải mô hình MuJoCo: ${e.message}`; render(); }
    } }, 'Chọn mô hình MuJoCo trên máy này');
    const scan = h('button', { class: 'ghost', onclick: async () => { try { const result = await bridge.edgePorts(); ports = result.items || []; notice = `Đã tìm thấy ${ports.length} thiết bị serial.`; } catch (e) { notice = e.message; } render(); } }, 'Quét cổng serial');
    const connect = h('button', { class: 'primary', disabled: !ports.length || robotStatus?.connected, onclick: async () => {
      if (!selector.value) { notice = 'Hãy chọn cổng serial cụ thể.'; render(); return; }
      if (!window.confirm('Chỉ đọc trạng thái SO-101. Kết nối LeRobot có thể cấu hình thanh ghi giao tiếp, nhưng không gửi lệnh chuyển động. Tiếp tục?')) return;
      connect.disabled = true;
      try { robotStatus = await bridge.edgeConnect({ port: selector.value, deviceId: deviceId.value.trim(), confirmed: true }); notice = 'Đã kết nối chế độ chỉ đọc.'; }
      catch (e) { notice = e.message; }
      render();
    } }, 'Kết nối chỉ đọc');
    const disconnect = h('button', { class: 'ghost', disabled: !robotStatus?.connected, onclick: async () => { try { robotStatus = await bridge.edgeDisconnect(); notice = 'Đã ngắt kết nối.'; } catch (e) { notice = e.message; } render(); } }, 'Ngắt kết nối');
    const createKey = h('button', { class: 'ghost', disabled: !provisioning?.storageAvailable || provisioning?.state !== 'UNINITIALIZED', onclick: async () => {
      createKey.disabled = true;
      try { provisioning = await bridge.createEnrollmentKey(); notice = 'Đã tạo khóa enrollment cục bộ. Thiết bị vẫn chưa được đăng ký.'; }
      catch (e) { notice = e.message; }
      render();
    } }, provisioning?.state === 'KEY_READY' ? 'Khóa enrollment đã tạo' : 'Tạo khóa enrollment cục bộ');
    const enrollmentInput = h('input', { type: 'password', value: enrollmentCode, maxlength: '80', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Mã enrollment dùng một lần', placeholder: 'Mã dùng một lần từ quản trị viên VISTA', oninput: (event) => { enrollmentCode = event.target.value; } });
    const enroll = h('button', { class: 'primary', disabled: provisioning?.state !== 'KEY_READY' || !provisioning?.backendAvailable || !provisioning?.enrollmentEnabled || !enrollmentCode.trim(), onclick: async () => {
      enroll.disabled = true;
      try { provisioning = await bridge.enrollDevice(enrollmentCode.trim()); enrollmentCode = ''; notice = 'Backend đã xác nhận thiết bị ACTIVE; khóa riêng tư chưa rời khỏi máy này.'; }
      catch (error) { notice = `Enrollment thất bại: ${error.message}`; }
      render();
    } }, 'Đăng ký thiết bị với VISTA');
    const refreshDevice = h('button', { class: 'ghost', disabled: provisioning?.state !== 'ACTIVE', onclick: async () => { try { provisioning = await bridge.refreshDeviceProvisioning(); notice = 'Đã xác minh trạng thái thiết bị và gửi heartbeat.'; } catch (error) { notice = `Không thể xác minh thiết bị: ${error.message}`; } render(); } }, 'Xác minh trạng thái / heartbeat');
    const controls = h('section', { class: 'detail-panel setup-controls', 'aria-label': 'Chẩn đoán thiết bị' },
      h('h2', {}, 'Chẩn đoán thiết bị'), refresh, selectModel, scan, selector, deviceId, connect, disconnect,
      h('p', { class: 'faint' }, `Kết nối hiện tại: ${robotStatus?.connected ? `${robotStatus.mode} · ${robotStatus.port}` : 'chưa kết nối'} · motionEnabled=false`));
    const provisioningControl = h('section', { class: 'detail-panel setup-controls', 'aria-label': 'Device provisioning' },
      h('h2', {}, 'Danh tính thiết bị'),
      h('p', {}, provisioning?.storageAvailable ? 'Khóa riêng tư chỉ được lưu bằng mã hoá hệ điều hành. Enrollment ký challenge Ed25519 của backend. Desktop không tạo chứng thư AWS IoT.' : 'Kho mã hoá hệ điều hành không khả dụng; không thể tạo khóa an toàn.'),
      createKey, enrollmentInput, enroll, refreshDevice);
    sheetEl.replaceChildren(h('div', { class: 'sheet-container' },
      h('div', { class: 'view-title-row' }, h('div', {}, h('h1', {}, 'Thiết lập thiết bị'), h('p', { class: 'view-subline' }, 'Kiểm tra theo từng bước; trạng thái luôn phản ánh runtime thực tế trên máy này.'))),
      h('div', { class: 'setup-summary' }, badge('SIMULATION ONLY'), ' Robot execution bị khoá; không có hiệu chuẩn tự động.'),
      controls, provisioningControl, rows));
  };
  function setupCard(title, state, description) {
    return h('section', { class: 'setup-card' },
      h('div', { class: 'setup-card-title' }, h('h2', {}, title)),
      h('div', { class: 'setup-state-panel' }, badge(state), h('p', {}, description)));
  }
  async function refreshAll() {
    notice = '';
    try {
      diagnostics = await bridge.edgeDiagnostics();
      robotStatus = diagnostics.status?.physical || robotStatus;
      try { provisioning = await bridge.provisioningStatus(); } catch { provisioning = null; }
    } catch (error) { diagnostics = { state: 'BLOCKED', error: error.message }; }
    render();
  }
  render();
  await refreshAll();
}

async function settingsView() {
  sheetEl.replaceChildren(h('div', { class: 'sheet-container' }, h('h1', {}, 'Cài đặt'), h('p', { class: 'faint' }, 'Đang đọc cấu hình Desktop…')));
  try {
    const cfg = await bridge.getCfg();
    if (view !== 'settings') return;
    const endpoint = h('input', {
      id: 'settings-twin-url', type: 'url', value: cfg.twinWsUrl || '',
      placeholder: 'wss://twin.example.edu/ws/twin', autocomplete: 'off', spellcheck: 'false'
    });
    endpoint.disabled = Boolean(cfg.twinWsManagedByEnvironment);
    const state = h('p', { class: 'faint', role: 'status', 'aria-live': 'polite' },
      cfg.twinWsConfigurationError ? `Operator URL rejected: ${cfg.twinWsConfigurationError}`
        : cfg.twinWsManagedByEnvironment ? 'Managed by VISTA_TWIN_WS_URL.' : 'Only wss:// endpoints and local ws:// endpoints are accepted.');
    const save = h('button', { class: 'ghost', onclick: async () => {
      save.disabled = true;
      try {
        const next = await bridge.setCfg({ twinWsUrl: endpoint.value.trim() });
        endpoint.value = next.twinWsUrl || '';
        state.textContent = next.twinWsUrl ? 'Twin endpoint saved.' : 'Twin endpoint cleared.';
      } catch (error) { state.textContent = error.message; }
      finally { save.disabled = false; }
    } }, 'Lưu địa chỉ Twin');
    save.disabled = Boolean(cfg.twinWsManagedByEnvironment);
    sheetEl.replaceChildren(h('div', { class: 'sheet-container' },
      h('div', { class: 'view-title-row' }, h('div', {}, h('h1', {}, 'Cài đặt'), h('p', { class: 'view-subline' }, 'Kết nối VISTA và trạng thái lưu phiên trên thiết bị này.'))),
      h('section', { class: 'detail-panel', 'aria-label': 'Education API' },
        h('h2', {}, 'Education API'),
        h('p', {}, cfg.educationApi || 'Chưa cấu hình'),
        h('p', { class: 'faint' }, cfg.mock ? 'Demo fixture · không kết nối dữ liệu học sinh thật.' : 'Cấu hình bởi VISTA_EDUCATION_API.')),
      h('section', { class: 'detail-panel settings-endpoint', 'aria-label': 'Digital Twin' },
        h('h2', {}, 'SO-101 Digital Twin'),
        h('label', { for: 'settings-twin-url' }, 'Địa chỉ WebSocket do người vận hành cung cấp'),
        endpoint, save, state),
      h('section', { class: 'detail-panel', 'aria-label': 'Session storage' },
        h('h2', {}, 'Phiên đăng nhập'),
        h('p', {}, cfg.persistentSession ? 'Lưu phiên được mã hoá bởi hệ điều hành.' : 'Không lưu phiên sau khi đóng ứng dụng: mã hoá hệ điều hành không khả dụng.'),
        h('p', { class: 'faint' }, 'Mật khẩu học sinh không được lưu. Đăng xuất sẽ xoá token phiên cục bộ.'))
    ));
  } catch (error) {
    if (view !== 'settings') return;
    sheetEl.replaceChildren(h('div', { class: 'detail-panel' }, h('div', { class: 'err' }, error.message), h('button', { class: 'ghost', onclick: settingsView }, 'Thử lại')));
  }
}

function renderRobotBannerContent(banner, r) {
  banner.className = 'robot-status-banner warning simulation-only';
  banner.replaceChildren(
    h('div', { class: 'robot-status-banner-left' },
      h('span', { class: 'dot-live warn' }),
      h('div', {},
        h('span', { class: 'robot-status-banner-title' }, 'SIMULATION · Robot Health panel'),
        h('span', { class: 'robot-status-banner-desc' }, 'Trạng thái tại đây là minh hoạ. Joint telemetry trực tiếp chỉ hiển thị trong Digital Twin khi attempt được cấp quyền; điều khiển vật lý đang bị khoá.')
      )
    ),
    h('div', { class: 'num faint', style: 'font-size: 12px;' }, 'Simulated state only')
  );
}

async function robot() {
  currentRobotHealth = { online: false, ready: false, calibrated: false, estop: 'unknown', mode: 'simulation' };
  if (robotEl) robotEl.replaceChildren(
    h('div', { class: 'sidebar-robot-header' }, h('span', { class: 'dot-live' }), 'SIMULATION'),
    h('div', { class: 'sidebar-robot-detail' }, 'Physical telemetry unavailable · motion disabled')
  );
  if (robotBannerEl) renderRobotBannerContent(robotBannerEl, currentRobotHealth);
}

/* ==========================================================================
   Screen 2: Lab của tôi (Grouped by Course, Accurate Progress & Spotlight)
   ========================================================================== */
let activeFilter = 'all';
let searchQuery = '';

async function labsView(silent) {
  if (!silent) {
    sheetEl.replaceChildren(
      h('div', { class: 'sheet-container' },
        h('h1', {}, `Xin chào, ${user.name || 'Học sinh'}`),
        h('div', { class: 'loading-bar', style: 'margin-top: 20px;' }),
        h('div', { class: 'loading-bar' })
      )
    );
  }

  try {
    const [raw, enrollmentData, learningPathData] = await Promise.all([
      call('listLabs'),
      call('enrollments').catch(() => []),
      call('learningPath').catch(() => null)
    ]);
    if (view !== 'labs') return;
    const rows = Array.isArray(raw) ? raw : (raw.labs || []);
    const enrollmentRows = Array.isArray(enrollmentData) ? enrollmentData : (enrollmentData?.items || []);
    const enrollmentByClassroom = new Map(enrollmentRows.map((row) => [row.classroom_id, row]));
    const learningCourses = Array.isArray(learningPathData?.courses) ? learningPathData.courses : [];
    const courseProgressById = new Map(learningCourses.map((course) => [course.id, course]));
    const labs = rows.map((row) => {
      const state = row.attempt_status || row.learning_status || row.status || 'assigned';
      const status = state === 'assigned' ? 'available'
        : state === 'started' || state === 'in_progress' ? 'in_progress'
          : state === 'completed' || state === 'submitted' ? 'submitted'
            : state === 'evaluated' || state === 'succeeded' ? 'succeeded' : state;
      const enrollment = enrollmentByClassroom.get(row.classroom_id);
      const courseId = enrollment?.course_id || null;
      const courseProgress = courseId ? courseProgressById.get(courseId) : null;
      return {
        ...row,
        id: row.classroom_assignment_id || row.id,
        classroomAssignmentId: row.classroom_assignment_id || row.id,
        courseId: courseId || row.classroom_id || row.course_title || 'course',
        courseProgress: courseProgress || null,
        courseTitle: row.course_title || 'Khoá học',
        courseDescription: row.instructions || '',
        lessonCode: row.challenge_title || row.lesson_title || 'ASSIGNMENT',
        title: row.title || row.assignment_title || 'Bài thực hành',
        assignedBy: row.classroom_name || 'Được giao bởi nhà trường',
        dueAt: row.due_at,
        status,
        attemptId: row.attempt_id || null
      };
    });
    const coursesMeta = learningCourses;

    // Group labs by Course
    const courseMap = new Map();
    for (const cm of coursesMeta) {
      courseMap.set(cm.courseId || cm.id, {
        id: cm.courseId || cm.id,
        title: cm.courseTitle || cm.title || '',
        description: cm.courseDescription || cm.description || '',
          courseProgress: cm,
        labs: []
      });
    }
    for (const l of labs) {
      const cid = l.courseId || 'general';
      if (!courseMap.has(cid)) {
        courseMap.set(cid, {
          id: cid,
          title: l.courseTitle || 'Khoá học chung',
          description: l.courseDescription || '',
          courseProgress: l.courseProgress,
          labs: []
        });
      }
      courseMap.get(cid).labs.push(l);
    }

    // Only display courses with at least 1 lab
    const displayCourses = Array.from(courseMap.values()).filter((c) => c.labs.length > 0);

    updateSidebarCourses(displayCourses);

    const totalLabs = labs.length;
    const doneLabs = labs.filter((l) => l.status === 'succeeded').length;
    const inProgressLabs = labs.filter((l) => l.status === 'in_progress').length;
    const readyLabs = labs.filter((l) => l.status === 'available').length;
    // Highlight labs due soon within 3 days
    const soonLabs = labs.filter((l) => l.dueAt && l.status !== 'locked' && l.status !== 'succeeded' && daysLeft(l.dueAt) <= 3 && daysLeft(l.dueAt) >= 0).length;

    // Spotlight Lab: Pick in_progress first, or first available lab due soonest
    const spotlightLab = labs.find((l) => l.status === 'in_progress') ||
      labs.filter((l) => l.status === 'available').sort((a, b) => daysLeft(a.dueAt) - daysLeft(b.dueAt))[0] ||
      null;

    renderLabsPage(displayCourses, { totalLabs, doneLabs, inProgressLabs, readyLabs, soonLabs }, spotlightLab);

  } catch (e) {
    if (view !== 'labs') return;
    sheetEl.replaceChildren(
      h('div', { class: 'detail-panel' },
        h('div', { class: 'err' }, 'Lỗi kết nối dữ liệu: ' + e.message),
        h('button', { class: 'ghost', style: 'margin-top: 12px;', onclick: () => labsView() }, 'Thử lại')
      )
    );
  }
}

function updateSidebarCourses(courses) {
  if (!sidebarCoursesEl) return;
  if (!courses.length) {
    sidebarCoursesEl.replaceChildren();
    return;
  }
  sidebarCoursesEl.replaceChildren(
    h('div', { class: 'sidebar-section-title' }, 'Khoá học thực hành'),
    ...courses.map((c, idx) => {
      const color = getCourseColor(c.id, idx);
      return h('button', {
        class: 'course-item-btn',
        onclick: () => {
          const el = document.getElementById('course-' + c.id);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      },
        h('span', { class: 'sidebar-course-pip', style: 'background-color: ' + color.accent }),
        h('span', { class: 'course-item-title' }, c.title),
        h('span', { class: 'course-item-count num' }, `${c.labs.length} bài được giao`)
      );
    })
  );
}

function renderLabsPage(courses, counts, spotlightLab) {
  // Robot Hardware Status Banner at Top of Sheet
  robotBannerEl = h('div', {});
  renderRobotBannerContent(robotBannerEl, currentRobotHealth);

  const greeting = h('div', { class: 'view-title-row' },
    h('div', {},
      h('h1', {}, `Xin chào, ${user.name || 'Học sinh'}`),
      h('div', { class: 'view-subline' },
        [user.className && `Lớp ${user.className}`, user.schoolName].filter(Boolean).join(' · ')
      )
    )
  );

  // KPI Overview Strip with dimmed zeros (Requirement 6)
  const kpiCell = (label, val) => {
    const isZero = Number(val) === 0;
    return h('div', { class: 'kpi-cell' + (isZero ? ' is-zero' : '') },
      h('div', { class: 'kpi-label' }, label),
      h('div', { class: 'kpi-val num' + (isZero ? ' is-zero' : '') }, String(val))
    );
  };

  const kpiStrip = h('div', { class: 'kpi-strip' },
    kpiCell('Bài cần thực hành', counts.readyLabs + counts.inProgressLabs),
    kpiCell('Sắp đến hạn (≤ 3 ngày)', counts.soonLabs),
    kpiCell('Lần chạy thành công', counts.doneLabs)
  );

  // Spotlight Box: HERO of the page with the ONLY primary button and bespoke SVG robotic arm
  let spotlightEl = false;
  if (spotlightLab) {
    const d = daysLeft(spotlightLab.dueAt);
    const isInProgress = spotlightLab.status === 'in_progress';
    const dueText = !Number.isFinite(d) ? 'Không có hạn nộp' : d >= 0 ? `Còn ${d} ngày nữa đến hạn` : 'Đã quá hạn';

    spotlightEl = h('div', { class: 'spotlight-box' },
      h('div', { class: 'spotlight-left' },
        h('div', { class: 'spotlight-chip' + (isInProgress ? ' in-progress' : '') },
          isInProgress ? h('span', { class: 'dot-amber-pulse' }) : false,
          isInProgress ? ' Bài lab đang làm dở' : 'Bài lab nên làm tiếp'
        ),
        h('div', { class: 'spotlight-heading' }, spotlightLab.title),
        h('div', { class: 'spotlight-meta' },
          `${spotlightLab.lessonCode} · ${spotlightLab.courseTitle} · Giảng viên: ${spotlightLab.assignedBy} · ${dueText}`
        ),
        spotlightLab.programVersion
          ? h('div', { class: 'spotlight-sim-badge' },
              svgCheck(),
              ` Chương trình đã PASS mô phỏng (${spotlightLab.programVersion.id} · v${spotlightLab.programVersion.version} · qualified)`
            )
          : false,
        h('div', { style: 'margin-top: 14px;' },
          h('button', {
            class: 'btn-spotlight-primary',
            onclick: () => labView(spotlightLab)
          }, isInProgress ? 'Tiếp tục bài lab →' : 'Bắt đầu bài lab →')
        )
      ),
      h('div', { class: 'spotlight-right-art' }, spotlightRobotSvg())
    );
  }

  // Filter Tabs & Search
  const tabs = [
    { id: 'all', label: `Tất cả (${counts.totalLabs})` },
    { id: 'todo', label: `Cần làm (${counts.readyLabs + counts.inProgressLabs})` },
    { id: 'progress', label: `Đang làm (${counts.inProgressLabs})` },
    { id: 'done', label: `Đã hoàn thành (${counts.doneLabs})` }
  ];

  const filterTabsEl = h('div', { class: 'filter-tabs' },
    tabs.map((t) => h('button', {
      class: 'tab-btn' + (activeFilter === t.id ? ' active' : ''),
      onclick: () => {
        activeFilter = t.id;
        renderLabsPage(courses, counts, spotlightLab);
      }
    }, t.label))
  );

  const searchInput = h('input', {
    type: 'text',
    placeholder: 'Tìm kiếm theo tên lab, mã bài...',
    value: searchQuery
  });
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderCourseSections(coursesContainer, courses);
  });

  const searchBox = h('div', { class: 'search-box' }, searchInput);
  const toolbar = h('div', { class: 'toolbar-row' }, filterTabsEl, searchBox);
  const coursesContainer = h('div', { class: 'courses-container' });

  renderCourseSections(coursesContainer, courses);

  sheetEl.replaceChildren(
    h('div', { class: 'sheet-container' },
      robotBannerEl,
      greeting,
      kpiStrip,
      spotlightEl,
      toolbar,
      coursesContainer
    )
  );
}

function renderCourseSections(container, courses) {
  const sections = [];

  for (let idx = 0; idx < courses.length; idx++) {
    const c = courses[idx];
    const color = getCourseColor(c.id, idx);

    let filteredLabs = c.labs;
    if (activeFilter === 'todo') {
      filteredLabs = filteredLabs.filter((l) => l.status === 'available' || l.status === 'in_progress');
    } else if (activeFilter === 'progress') {
      filteredLabs = filteredLabs.filter((l) => l.status === 'in_progress');
    } else if (activeFilter === 'done') {
      filteredLabs = filteredLabs.filter((l) => l.status === 'succeeded');
    }

    if (searchQuery) {
      filteredLabs = filteredLabs.filter((l) =>
        (l.title || '').toLowerCase().includes(searchQuery) ||
        (l.lessonCode || '').toLowerCase().includes(searchQuery) ||
        (l.assignedBy || '').toLowerCase().includes(searchQuery)
      );
    }

    const courseProgress = c.courseProgress;
    const progressPercent = Number.isFinite(courseProgress?.progressPercent)
      ? Math.max(0, Math.min(100, courseProgress.progressPercent)) : null;
    const completedLessons = Number.isFinite(courseProgress?.completedLessons) ? courseProgress.completedLessons : null;
    const totalLessons = Number.isFinite(courseProgress?.totalLessons) ? courseProgress.totalLessons : null;

    const courseCard = h('div', { class: 'course-card', id: 'course-' + c.id },
      h('div', { class: 'course-card-header' },
        h('div', {},
          h('h2', {},
            h('span', { class: 'course-color-pip', style: 'background-color: ' + color.accent }),
            c.title
          ),
          c.description ? h('p', { class: 'course-card-desc' }, c.description) : false
        ),
        progressPercent !== null
          ? h('div', { class: 'course-progress-meta num' }, `${completedLessons ?? '—'}/${totalLessons ?? '—'} bài học · ${progressPercent}%`)
          : h('div', { class: 'course-progress-meta num' }, `${c.labs.length} bài được giao`)
      ),
      progressPercent !== null ? h('div', { class: 'progress-track' },
        progressPercent > 0
          ? h('div', {
              class: 'progress-bar-fill',
              style: `width: ${progressPercent}%; background-color: ${color.accent};`
            })
          : false
      ) : false,
      filteredLabs.length
        ? h('div', { class: 'lab-table-wrap' }, filteredLabs.map(labRow))
        : h('div', { class: 'faint', style: 'text-align: center; padding: 24px 0;' },
            'Không có bài lab nào phù hợp với bộ lọc hiện tại.'
          )
    );

    sections.push(courseCard);
  }

  if (!sections.length) {
    container.replaceChildren(
      h('div', { class: 'detail-panel', style: 'text-align: center; padding: 36px 20px;' },
        h('div', { style: 'max-width: 320px; margin: 0 auto;' },
          spotlightRobotSvg(),
          h('p', { style: 'margin-top: 16px; font-size: 14px; color: var(--muted);' },
            'Hiện chưa có bài lab nào phù hợp hoặc chưa có bài được giao cho tài khoản của bạn.'
          )
        )
      )
    );
  } else {
    container.replaceChildren(...sections);
  }
}

function labRow(l) {
  const locked = l.status === 'locked';
  const succeeded = l.status === 'succeeded';
  const submitted = l.status === 'submitted';
  const inProgress = l.status === 'in_progress';
  const d = daysLeft(l.dueAt);

  // Status Pill (Requirement 2)
  const statusTag = renderStatusPill(l.status);

  // Due date display (Requirement 3)
  let dueEl;
  if (succeeded) {
    dueEl = h('div', { class: 'due-text done' }, svgCheck(), ' Hoàn thành');
  } else if (locked || !l.dueAt) {
    dueEl = h('div', { class: 'due-text faint' }, '—');
  } else {
    if (d < 0) {
      dueEl = h('div', { class: 'due-text overdue num' }, 'Quá hạn');
    } else if (d <= 3) {
      dueEl = h('div', { class: 'due-text urgent num' }, `Còn ${d} ngày`);
    } else {
      dueEl = h('div', { class: 'due-text num' }, `Còn ${d} ngày`);
    }
  }

  // Secondary Action Button (Requirement 4: NO solid black button in table rows!)
  let actionBtn;
  if (locked) {
    actionBtn = h('button', {
      class: 'btn-row-action',
      disabled: true
    }, 'Bị khoá');
  } else if (succeeded) {
    actionBtn = h('button', {
      class: 'btn-row-action ghost-action',
      onclick: () => labView(l)
    }, 'Xem lại');
  } else if (submitted) {
    actionBtn = h('button', { class: 'btn-row-action ghost-action', onclick: () => labView(l) }, 'Xem bài đã nộp');
  } else if (inProgress) {
    actionBtn = h('button', {
      class: 'btn-row-action in-progress',
      onclick: () => labView(l)
    }, 'Tiếp tục →');
  } else {
    actionBtn = h('button', {
      class: 'btn-row-action',
      onclick: () => labView(l)
    }, 'Bắt đầu →');
  }

  return h('div', { class: 'lab-table-row' + (locked ? ' locked' : '') },
    h('div', { class: 'pill-tag neutral num' }, l.lessonCode),
    h('div', { style: 'font-weight: 500;' }, l.title),
    h('div', { class: 'faint' }, `Giao bởi ${l.assignedBy}`),
    dueEl,
    h('div', {}, statusTag),
    h('div', { style: 'text-align: right;' }, actionBtn),
    locked && l.lockReason
      ? h('div', { class: 'lock-reason-note' },
          svgLock(),
          h('span', {}, `Lý do khoá: ${l.lockReason}`)
        )
      : false
    ,l.score !== undefined && l.score !== null
      ? h('div', { class: 'lab-grade-note' }, `Điểm: ${l.score}${l.score_max !== undefined && l.score_max !== null ? ` / ${l.score_max}` : ''}`)
      : false,
    l.teacher_feedback ? h('div', { class: 'lab-grade-note' }, `Phản hồi: ${l.teacher_feedback}`) : false
  );
}

/* ==========================================================================
   Screen 5: Lịch Sử Chạy Robot
   ========================================================================== */
async function historyView() {
  sheetEl.replaceChildren(
    h('div', { class: 'sheet-container' },
      h('h1', {}, 'Lịch sử thực nghiệm'),
      h('div', { class: 'loading-bar', style: 'margin-top: 20px;' })
    )
  );
  try {
    const hs = await call('history');
    if (view !== 'history') return;
    sheetEl.replaceChildren(
      h('div', { class: 'sheet-container' },
        h('div', { class: 'view-title-row' },
          h('div', {},
            h('h1', {}, 'Lịch sử thực nghiệm'),
            h('div', { class: 'view-subline' }, 'Các lượt schematic, simulation và thực thi do VISTA ghi nhận')
          )
        ),
        h('div', { class: 'detail-panel', style: 'padding: 16px 20px;' },
          Array.isArray(hs) && hs.length
            ? hs.map((x) =>
                h('div', { class: 'preflight-item' },
                  h('div', { class: 'num faint', style: 'width: 140px;' }, x.created_at ? new Date(x.created_at).toLocaleString() : '—'),
                  h('div', { style: 'flex: 1; font-weight: 500;' }, x.execution_mode || x.method || 'Experiment'),
                  h('div', { class: 'faint', style: 'flex: 1;' }, x.id || ''),
                  renderStatusPill(x.status)
                )
              )
            : h('div', { class: 'faint', style: 'text-align: center; padding: 24px 0;' }, 'Chưa có lượt chạy nào được ghi nhận.')
        )
      )
    );
  } catch (e) {
    if (view !== 'history') return;
    sheetEl.replaceChildren(
      h('div', { class: 'detail-panel' },
        h('div', { class: 'err' }, e.message),
        h('button', { class: 'ghost', onclick: historyView }, 'Thử lại')
      )
    );
  }
}

/* ==========================================================================
   Screen 3: Chi tiết Lab & Quy trình An toàn 4 bước
   ========================================================================== */
async function labView(lab) {
  clearTimers();
  const checks = h('div', { class: 'preflight-list' }, 'Nhấn “Kiểm tra lại” để yêu cầu trạng thái an toàn từ VISTA.');
  const err = h('div', { class: 'err' });
  const sessionNote = h('div', { class: 'faint', style: 'margin-top: 12px;' });
  const assignmentInfo = h('div', { class: 'detail-panel', 'aria-live': 'polite' }, 'Đang tải yêu cầu bài thực hành…');
  let attemptId = lab.attemptId || null;

  const preflight = async () => {
    checks.replaceChildren(h('div', { class: 'faint' }, 'Đang kiểm tra điều kiện phiên…'));
    err.textContent = '';
    try {
      if (!attemptId) {
        const attempt = await call('startAttempt', lab.classroomAssignmentId || lab.id);
        attemptId = attempt.id;
      }
      const [eligibility, active] = await Promise.all([
        call('physicalEligibility', attemptId),
        call('activePhysicalExecution', attemptId).catch(() => null)
      ]);
      const readiness = eligibility.readiness || {};
      const readinessRows = [
        ['Bài được giao và lần thử thuộc học viên', eligibility.eligible === true],
        ['Robot đã được phân bổ', readiness.allocated === true],
        ['Entitlement còn hiệu lực', readiness.entitled === true],
        ['Đánh giá mô phỏng phía máy chủ đã đạt', readiness.symbolicPassed === true],
        ['Runtime và Checkik sẵn sàng', readiness.runtimeOnline === true && readiness.checkikReachable === true],
        ['Robot dừng và khoá an toàn được nhả', readiness.runtimeStopped === true && readiness.estopActive === false],
        ['Không có phiên điều khiển đang hoạt động', readiness.activeSession === false]
      ];
      checks.replaceChildren(
        ...readinessRows.map(([label, ok]) =>
          h('div', { class: 'preflight-item' },
            h('span', {}, label),
            h('span', { class: 'status-pill ' + (ok ? 'done' : 'danger') }, ok ? '[ ĐẠT ]' : '[ CHƯA ĐẠT ]')
          )
        )
      );
      sessionNote.textContent = active?.id
        ? `Máy chủ đã ghi nhận Physical Execution ${active.id}. Desktop chỉ đọc trạng thái.`
        : eligibility.eligible
          ? 'Máy chủ báo đủ điều kiện. Lệnh chuyển động vẫn bị khoá trong MVP cho tới khi kiểm chứng API production.'
          : `Chưa đủ điều kiện: ${eligibility.message || eligibility.code || 'máy chủ chưa cấp quyền phiên robot vật lý'}.`;
    } catch (e) {
      checks.replaceChildren();
      err.textContent = (e.message || '');
    }
  };

  sheetEl.replaceChildren(
    h('div', { class: 'sheet-container' },
      h('button', {
        class: 'ghost',
        style: 'margin-bottom: 16px; min-height: 32px; padding: 4px 12px; font-size: 12px;',
        onclick: () => labsView()
      }, '← Quay lại danh sách lab'),
      h('div', { class: 'view-title-row' },
        h('div', {},
          h('h1', {}, lab.title),
          h('div', { class: 'view-subline' }, `${lab.lessonCode} · ${lab.courseTitle || ''}`)
        )
      ),
      assignmentInfo,
      h('div', { class: 'detail-panel' },
        h('h3', {}, 'Lần thử bài tập'),
        h('div', { class: 'faint', style: 'margin-top: 6px; line-height: 1.5;' }, 'Lần thử thuộc classroom assignment đã giao. Blockly lưu phiên bản chương trình trên Education API; chuyển động tại màn hình này chỉ là mô phỏng.'),
        h('button', { class: 'btn-row-action', style: 'margin-top: 12px;', onclick: async () => {
          if (!attemptId) { try { const attempt = await call('startAttempt', lab.classroomAssignmentId || lab.id); attemptId = attempt.id; } catch (e) { err.textContent = e.message; return; } }
          if (window.vistaDesktop?.openWorkspace) window.vistaDesktop.openWorkspace(lab, attemptId);
          else window.dispatchEvent(new CustomEvent('vista:navigate', { detail: { view: 'workspace', lab, attemptId } }));
        } }, 'Mở Blockly & Simulation →')
      ),
      h('div', { class: 'detail-panel' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' },
          h('h3', {}, 'Kiểm tra an toàn phần cứng (Preflight)'),
          h('button', { class: 'ghost', style: 'min-height: 28px; padding: 2px 8px; font-size: 11px;', onclick: preflight }, 'Kiểm tra lại')
        ),
        checks
      ),
      h('div', { class: 'detail-panel' },
        h('h3', {}, 'Phiên robot vật lý'),
        h('div', { class: 'faint', style: 'margin: 8px 0 12px; line-height: 1.5;' }, 'Đang khoá trong bản này. Eligibility được đọc từ Education API; desktop chưa khởi chạy chuyển động hoặc đọc telemetry robot.'),
        err,
        sessionNote,
        h('button', { disabled: true, style: 'width: 100%; min-height: 44px; margin-top: 12px;' }, 'Điều khiển robot vật lý bị khoá')
      )
    )
  );

  call('assignment', lab.classroomAssignmentId || lab.id).then((detail) => {
    const facts = [
      detail.difficulty ? `Độ khó: ${detail.difficulty}` : null,
      detail.assignment_type ? `Loại: ${detail.assignment_type}` : null,
      detail.execution_mode ? `Chế độ: ${detail.execution_mode}` : null,
      detail.pass_score !== undefined && detail.pass_score !== null ? `Điểm đạt: ${detail.pass_score}` : null,
      detail.grading_method ? `Chấm điểm: ${detail.grading_method}` : null
    ].filter(Boolean);
    const objectives = Array.isArray(detail.learning_objectives) ? detail.learning_objectives : [];
    assignmentInfo.replaceChildren(
      h('h3', {}, detail.title || lab.title),
      h('p', { class: 'faint', style: 'line-height:1.5;margin-top:8px;' }, detail.instructions || lab.instructions || 'Không có hướng dẫn bổ sung.'),
      facts.length ? h('p', { class: 'faint', style: 'margin-top:8px;' }, facts.join(' · ')) : false,
      objectives.length ? h('div', { class: 'faint', style: 'margin-top:8px;' }, 'Mục tiêu học tập: ', objectives.map((item) => typeof item === 'string' ? item : item.title || item.description || '').filter(Boolean).join(' · ')) : false
    );
  }).catch((e) => { assignmentInfo.textContent = `Chi tiết bài thực hành không khả dụng: ${e.message}`; });

}

/* ==========================================================================
   Khởi động & Điều hướng Preview
   ========================================================================== */
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
window.addEventListener('vista:session-expired', () => {
  user = null;
  loginView().catch(() => root.replaceChildren(h('p', { role: 'alert' }, 'Your VISTA session expired. Sign in again.')));
});
window.addEventListener('vista:learning-data-changed', () => {
  if (view === 'labs' && !document.querySelector('.feature-workspace-page')) labsView(true);
});
window.addEventListener('vista:password-change-required', () => passwordChangeView());
window.addEventListener('vista:session-rotated', () => {
  user = null;
  loginView().catch(() => root.replaceChildren(h('p', { role: 'alert' }, 'Your VISTA session was rotated. Sign in again.')));
});
window.addEventListener('vista:temporary-password-expired', async () => {
  await call('logout').catch(() => {});
  loginView().then(() => { const error = root.querySelector('.err'); if (error) error.textContent = 'Mật khẩu tạm đã hết hạn. Liên hệ trường để được cấp lại.'; });
});
if (bridge.restoreSession) {
  bridge.restoreSession().then((state) => {
    if (state?.passwordChangeRequired) passwordChangeView();
    else if (state?.user) { user = state.user; shell(); }
    else loginView();
  }).catch(() => loginView());
} else if (urlParams && urlParams.get('screen') === 'labs') {
  call('me').then((u) => { user = u; shell(); }).catch(() => loginView());
} else {
  loginView();
}
