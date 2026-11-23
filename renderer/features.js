import * as Blockly from 'blockly';
import 'blockly/blocks';
import { mountTwinViewer, parseTwinFrame } from './twin-viewer.js';
import { connectTwinSocket } from './twin-connection.js';
import './features.css';


const bridge = window.vista;
const supported = {
  'arm.select': 'robot_select_arm',
  home: 'robot_move_home',
  'preview.move_xyz': 'robot_move_to',
  wait: 'robot_wait',
  'gripper.open': 'robot_gripper_open',
  'gripper.close': 'robot_gripper_close'
};
const blockLabels = {
  'arm.select': 'Arm', home: 'Home', 'preview.move_xyz': 'Learning preview point',
  wait: 'Wait', 'gripper.open': 'Open gripper', 'gripper.close': 'Close gripper'
};
const palette = { start: '#2B2F35', movement: '#0F7A6E', gripper: '#A86A12', timing: '#5B6573', control: '#4C5C9E' };
let activeWorkspace = null;
let activeTwin = null;

Blockly.common.defineBlocksWithJsonArray([
  { type: 'robot_start', message0: 'when program starts', nextStatement: null, style: 'start_blocks', tooltip: 'Every VISTA program begins here.' },
  { type: 'robot_select_arm', message0: 'use %1 arm', args0: [{ type: 'field_dropdown', name: 'ARM', options: [['left', 'left'], ['right', 'right']] }], message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, style: 'movement_blocks', tooltip: 'Select the arm for the blocks inside.' },
  { type: 'robot_move_home', message0: 'move selected arm home', previousStatement: null, nextStatement: null, style: 'movement_blocks', tooltip: 'Return the selected arm to its home pose.' },
  { type: 'robot_move_to', message0: 'move to x %1 y %2 z %3 mm', args0: [{ type: 'field_number', name: 'X', value: 240, min: 0, max: 600, precision: 1 }, { type: 'field_number', name: 'Y', value: 220, min: 0, max: 400, precision: 1 }, { type: 'field_number', name: 'Z', value: 120, min: 10, max: 300, precision: 1 }], previousStatement: null, nextStatement: null, style: 'movement_blocks', tooltip: 'Moves only in the backend learning preview coordinate frame.' },
  { type: 'robot_gripper_open', message0: 'open gripper', previousStatement: null, nextStatement: null, style: 'gripper_blocks' },
  { type: 'robot_gripper_close', message0: 'close gripper', previousStatement: null, nextStatement: null, style: 'gripper_blocks' },
  { type: 'robot_wait', message0: 'wait %1 seconds', args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0, max: 5, precision: 0.1 }], previousStatement: null, nextStatement: null, style: 'timing_blocks' }
]);

const toolbox = (actions) => ({
  kind: 'categoryToolbox', contents: [
    { kind: 'category', name: 'Program', categorystyle: 'start_category', contents: [{ kind: 'block', type: 'robot_start' }] },
    ...[
      { name: 'Arm & movement', style: 'movement_category', actions: ['arm.select', 'home', 'preview.move_xyz'] },
      { name: 'Gripper', style: 'gripper_category', actions: ['gripper.open', 'gripper.close'] },
      { name: 'Timing', style: 'timing_category', actions: ['wait'] }
    ].map((category) => ({
      kind: 'category', name: category.name, categorystyle: category.style,
      contents: category.actions.filter((action) => actions.includes(action)).map((action) => ({ kind: 'block', type: supported[action] }))
    })).filter((category) => category.contents.length)
  ]
});

function theme() {
  const style = (colour) => ({ colourPrimary: colour, colourSecondary: colour, colourTertiary: colour });
  return Blockly.Theme.defineTheme(`vista-student-${Date.now()}`, {
    base: Blockly.Themes.Classic,
    blockStyles: {
      start_blocks: style(palette.start), movement_blocks: style(palette.movement),
      gripper_blocks: style(palette.gripper), timing_blocks: style(palette.timing)
    },
    categoryStyles: {
      start_category: { colour: palette.start }, movement_category: { colour: palette.movement },
      gripper_category: { colour: palette.gripper }, timing_category: { colour: palette.timing }
    },
    componentStyles: {
      workspaceBackgroundColour: '#FBFAF8', toolboxBackgroundColour: '#FFFFFF', toolboxForegroundColour: '#17191C',
      flyoutBackgroundColour: '#F0EFEB', flyoutForegroundColour: '#4E535A', flyoutOpacity: 1,
      scrollbarColour: '#CECBC4', insertionMarkerColour: '#0D7369', cursorColour: '#0D7369'
    },
    fontStyle: { family: 'IBM Plex Sans, sans-serif', weight: '500', size: 11 }, startHats: true
  });
}

const call = async (method, ...args) => {
  const result = await bridge.call(method, ...args);
  if (!result?.ok) {
    const error = new Error(result?.error || 'Education API request failed.');
    error.code = result?.code; error.status = result?.status;
    if (error.code === 'SESSION_EXPIRED') window.dispatchEvent(new CustomEvent('vista:session-expired'));
    throw error;
  }
  return result.data;
};

function apiErrorMessage(error) {
  if (error?.status === 403 || error?.code === 'FORBIDDEN') return `VISTA denied this action (HTTP 403). ${error.message}`;
  if (error?.status === 401 || error?.code === 'UNAUTHORIZED') return `VISTA requires a valid student session (HTTP 401). Sign in again. ${error.message}`;
  return error?.message || 'VISTA request failed.';
}

function normalizeAssignment(row) {
  return {
    ...row,
    id: row.classroom_assignment_id || row.id,
    classroomAssignmentId: row.classroom_assignment_id || row.id,
    title: row.title || row.assignment_title || 'Bài thực hành',
    courseTitle: row.course_title || 'Khoá học',
    instructions: row.instructions || '',
    lessonCode: row.challenge_title || row.lesson_title || 'ASSIGNMENT',
    attemptId: row.attempt_id || null
  };
}

function showLoading(title, detail = 'Đang tải dữ liệu được giao…') {
  const sheet = document.querySelector('.work-sheet');
  if (!sheet) return null;
  sheet.innerHTML = `<div class="sheet-container"><h1>${escapeHtml(title)}</h1><p class="faint feature-loading">${escapeHtml(detail)}</p></div>`;
  return sheet;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function openAssignmentPicker(kind) {
  const title = kind === 'workspace' ? 'Blockly & Simulation' : 'SO-101 Digital Twin';
  const sheet = showLoading(title);
  if (!sheet) return;
  try {
    const raw = await call('listLabs');
    const rows = Array.isArray(raw) ? raw : (raw.labs || []);
    const labs = rows.map(normalizeAssignment);
    sheet.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'sheet-container';
    const heading = document.createElement('div');
    heading.className = 'view-title-row';
    heading.innerHTML = `<div><h1>${kind === 'workspace' ? 'Blockly & Simulation' : 'SO-101 Digital Twin'}</h1><div class="view-subline">${kind === 'workspace' ? 'Select an assigned activity to load its allowed Blockly toolbox.' : 'SO-101 model · connect to attempt-scoped joint telemetry'}</div></div><span class="mode-label">${kind === 'workspace' ? 'SIMULATION' : 'READ ONLY'}</span>`;
    const list = document.createElement('div');
    list.className = 'feature-assignment-list';
    if (!labs.length) {
      list.innerHTML = '<div class="detail-panel feature-empty"><h3>No assigned labs</h3><p class="faint">Assigned activities appear here after the school publishes them.</p></div>';
    } else {
      labs.forEach((lab) => {
        const button = document.createElement('button');
        button.className = 'feature-assignment';
        const state = lab.attempt_status || lab.learning_status || lab.status || 'assigned';
        const due = lab.due_at ? new Date(lab.due_at).toLocaleDateString() : 'No due date';
        button.innerHTML = `<span class="assignment-code">${escapeHtml(lab.lessonCode)}</span><span class="assignment-title">${escapeHtml(lab.title)}</span><span class="assignment-course">${escapeHtml(lab.courseTitle)}</span><span class="assignment-course">${escapeHtml(state)} · due ${escapeHtml(due)}</span><span class="assignment-open">Open →</span>`;
        button.onclick = async () => {
          if (kind === 'twin') await renderTwinPage(lab);
          else await window.vistaDesktop.openWorkspace(lab, lab.attemptId);
        };
        list.append(button);
      });
    }
    container.append(heading, list);
    sheet.append(container);
  } catch (error) {
    sheet.innerHTML = `<div class="detail-panel feature-error" role="alert"><h2>Could not load assigned work</h2><p>${escapeHtml(error.message)}</p><button class="ghost" data-retry>Retry</button></div>`;
    sheet.querySelector('[data-retry]').onclick = () => openAssignmentPicker(kind);
  }
}

function addDefaultBlocks(workspace, allowed) {
  const start = workspace.newBlock('robot_start');
  start.initSvg(); start.render();
  let parent = start;
  if (allowed.includes('arm.select')) {
    const arm = workspace.newBlock('robot_select_arm'); arm.initSvg(); arm.render();
    parent.nextConnection.connect(arm.previousConnection); parent = arm;
    if (allowed.includes('gripper.open') || allowed.includes('gripper.close')) {
      const action = workspace.newBlock(allowed.includes('gripper.open') ? 'robot_gripper_open' : 'robot_gripper_close');
      action.initSvg(); action.render(); arm.getInput('DO').connection.connect(action.previousConnection);
    }
  }
  Blockly.svgResize(workspace);
}

function generateCanonicalProgram(workspace, assignment) {
  const allowed = new Set(Array.isArray(assignment.allowed_blocks) ? assignment.allowed_blocks : []);
  const symbolic = assignment.constraints?.kind === 'symbolic_program';
  const problems = [];
  const tops = workspace.getTopBlocks(true);
  const starts = tops.filter((block) => block.type === 'robot_start');
  if (starts.length !== 1) problems.push('The program needs exactly one “when program starts” block.');
  tops.filter((block) => block.type !== 'robot_start').forEach((block) => problems.push(`Disconnected block: ${block.type}`));
  let selectedArm = null;
  const steps = [];
  const walk = (first, innerArm = null) => {
    let block = first;
    let currentArm = innerArm;
    while (block) {
      if (!block.isEnabled()) { block = block.getNextBlock(); continue; }
      const type = block.type;
      if (type === 'robot_select_arm') {
        currentArm = block.getFieldValue('ARM');
        selectedArm = currentArm;
        steps.push({ type: 'arm.select', arm: currentArm });
        walk(block.getInputTargetBlock('DO'), currentArm);
      } else if (type === 'robot_move_home') {
        if (!currentArm) problems.push('Select an arm before using the home block.');
        else steps.push({ type: 'home', arm: currentArm });
      } else if (type === 'robot_move_to') {
        if (!symbolic || !allowed.has('preview.move_xyz')) problems.push('This assignment does not allow learning preview coordinates.');
        else if (!currentArm) problems.push('Select an arm before using coordinate preview.');
        else steps.push({
          type: 'preview.move_xyz', mode: 'learning_preview', frame: 'learning_preview_v1', arm: currentArm,
          position: { x: Math.round(Number(block.getFieldValue('X'))), y: Math.round(Number(block.getFieldValue('Y'))), z: Math.round(Number(block.getFieldValue('Z'))) }
        });
      } else if (type === 'robot_wait') {
        steps.push({ type: 'wait', durationMs: Math.round(Number(block.getFieldValue('SECONDS')) * 1000) });
      } else if (type === 'robot_gripper_open' || type === 'robot_gripper_close') {
        if (!currentArm) problems.push('Select an arm before using a gripper block.');
        else steps.push({ type: type === 'robot_gripper_open' ? 'gripper.open' : 'gripper.close' });
      } else {
        problems.push(`Unsupported block: ${type}`);
      }
      block = block.getNextBlock();
    }
  };
  if (starts[0]) walk(starts[0].getNextBlock());
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'robot_start') return;
    const allowedType = block.type === 'robot_select_arm' ? 'arm.select'
      : block.type === 'robot_move_home' ? 'home'
        : block.type === 'robot_move_to' ? 'preview.move_xyz'
          : block.type === 'robot_wait' ? 'wait'
            : block.type === 'robot_gripper_open' ? 'gripper.open'
              : block.type === 'robot_gripper_close' ? 'gripper.close' : null;
    if (!allowedType || !allowed.has(allowedType)) problems.push(`Block ${block.type} is not in the assigned toolbox.`);
  });
  if (!steps.length) problems.push('Add at least one supported action below the start block.');
  if (steps.length > 200) problems.push('A program may contain at most 200 actions.');
  if (steps.filter((step) => step.type === 'wait').reduce((total, step) => total + step.durationMs, 0) > 15000) problems.push('A program may wait for at most 15 seconds in total.');
  return { valid: problems.length === 0, problems: [...new Set(problems)], program: { kind: 'robot_program', schemaVersion: 1, steps }, selectedArm };
}

async function ensureAttempt(lab, requestedAttemptId) {
  const opened = requestedAttemptId
    ? { id: requestedAttemptId }
    : lab.attemptId ? { id: lab.attemptId }
      : await call('startAttempt', lab.classroomAssignmentId || lab.id);
  const id = opened.id || opened.attempt_id;
  if (!id) throw new Error('VISTA did not return an attempt identifier.');
  const attempt = await call('getAttempt', id);
  return { ...attempt, id };
}

function renderProblemList(target, result) {
  target.replaceChildren();
  if (!result.problems.length) {
    target.innerHTML = '<span class="validation-pass">✓ Program structure is valid</span>';
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'validation-list';
  result.problems.forEach((message) => { const li = document.createElement('li'); li.textContent = message; ul.append(li); });
  target.append(ul);
}

function renderBackendValidation(target, validation) {
  if (!target || !validation || typeof validation !== 'object') return;
  const row = document.createElement('div');
  row.className = validation.valid ? 'backend-validation pass' : 'backend-validation fail';
  row.textContent = validation.valid ? 'VISTA validation: accepted' : 'VISTA validation: needs attention';
  const issues = Array.isArray(validation.workspaceIssues) ? validation.workspaceIssues : [];
  if (issues.length) {
    const list = document.createElement('ul');
    issues.forEach((issue) => { const item = document.createElement('li'); item.textContent = String(issue); list.append(item); });
    row.append(list);
  }
  target.append(row);
}

function fillVersionPicker(select, versions) {
  if (!select) return;
  select.replaceChildren(new Option('Choose a saved version…', ''));
  for (const version of versions) {
    const option = new Option(`Version ${version.version_number} · ${new Date(version.created_at || Date.now()).toLocaleString()}`, version.id);
    select.add(option);
  }
  select.disabled = versions.length === 0;
}

async function renderWorkspace(lab, requestedAttemptId) {
  const sheet = showLoading('Blockly & Simulation', `Loading ${lab.title} and checking its assignment scope…`);
  if (!sheet) return;
  activeWorkspace?.dispose();
  activeWorkspace = null;
  try {
    const attempt = await ensureAttempt(lab, requestedAttemptId);
    const editable = !attempt.status || attempt.status === 'in_progress';
    const classroomAssignmentId = lab.classroomAssignmentId || lab.id;
    const assignment = await call('assignment', classroomAssignmentId);
    if (assignment.constraints?.kind !== 'symbolic_program') {
      throw new Error('This assignment is not a Blockly programming assignment. Open it from its course activity instead.');
    }
    const existingProgram = await call('getProgram', attempt.id);
    const savedDraft = await bridge.loadDraft(attempt.id);
    const initialState = editable && savedDraft?.dirty && savedDraft.workspaceJson
      ? savedDraft.workspaceJson
      : existingProgram?.workspace_json || savedDraft?.workspaceJson || null;
    sheet.innerHTML = `
      <div class="sheet-container feature-workspace-page">
        <div class="feature-title-row"><div><div class="eyebrow">PRACTICE WORKSPACE · ${escapeHtml(assignment.course_title || lab.courseTitle)}</div><h1>${escapeHtml(assignment.title || lab.title)}</h1><p class="view-subline">${escapeHtml(assignment.instructions || lab.instructions || '')}</p></div><span class="mode-label">SIMULATION · physical locked</span></div>
        <div class="feature-toolbar"><span class="save-state" data-save-state>Draft local</span><button class="ghost" data-undo aria-label="Undo">Undo</button><button class="ghost" data-redo aria-label="Redo">Redo</button><button class="ghost" data-reset-workspace>Reset</button><button class="ghost" data-validate>Validate</button><button class="ghost" data-save>Save program</button><button class="ghost" data-version disabled>Create version</button><button class="ghost" data-run-local disabled>Run local MuJoCo</button><button class="primary-action" data-run disabled>Run VISTA schematic</button><button class="ghost" data-submit disabled>Submit version</button></div>
        <div class="version-toolbar"><label for="saved-program-version">Saved versions</label><select id="saved-program-version" data-version-picker disabled><option value="">No saved versions</option></select><button class="ghost" data-restore-version disabled>Restore into workspace</button></div>
        <div class="feature-error" role="alert" data-error hidden></div>
        <div class="feature-grid"><section class="feature-blockly" aria-label="VISTA Blockly programming workspace"><div data-blockly></div></section><aside class="feature-side"><section class="feature-panel"><div class="panel-heading"><h2>SO-101 Digital Twin</h2><div class="simulation-controls"><label>Speed <select data-simulation-speed aria-label="Simulation speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><button class="ghost" data-simulation-pause disabled>Pause</button><button class="ghost" data-simulation-resume disabled>Resume</button><button class="ghost" data-simulation-stop disabled>Stop</button><button class="ghost" data-camera-reset>Reset view</button></div></div><div class="twin-viewport" data-twin-canvas></div><progress class="simulation-progress" max="100" value="0" data-simulation-progress aria-label="MuJoCo simulation progress"></progress><div class="joint-state" data-joints></div><div class="telemetry-note" data-simulation-status aria-live="polite">Local SO-101 viewer loads when MuJoCo simulation starts.</div></section><section class="feature-panel"><h2>Validation & execution</h2><div data-validation class="validation-state">Validate the workspace before saving.</div><pre class="command-preview" data-command-preview aria-label="Allowlisted simulation command preview">Run Validate to inspect the allowed command sequence.</pre><div class="schematic-result" data-result>VISTA schematic result will appear here after a version is saved.</div></section></aside></div>
      </div>`;
    const host = sheet.querySelector('[data-blockly]');
    const allowed = assignment.allowed_blocks || [];
    const ws = Blockly.inject(host, {
      toolbox: editable ? toolbox(allowed) : null, readOnly: !editable, theme: theme(), renderer: 'zelos', trashcan: editable, sounds: false,
      media: new URL('../renderer/vendor/blockly/media/', document.baseURI).toString(),
      move: { scrollbars: true, drag: true, wheel: true }, zoom: { controls: true, wheel: false, pinch: true, startScale: 0.82, maxScale: 1.6, minScale: 0.4 },
      grid: { spacing: 24, length: 2, colour: '#E3E1DA', snap: true }
    });
    if (initialState) {
      try { Blockly.serialization.workspaces.load(initialState, ws); }
      catch (error) { ws.clear(); throw new Error(`Saved Blockly workspace could not be loaded: ${error.message}`); }
    } else addDefaultBlocks(ws, allowed);
    const startBlock = ws.getTopBlocks(true).find((block) => block.type === 'robot_start');
    if (startBlock && !startBlock.getNextBlock() && allowed.includes('arm.select')) {
      const armBlock = ws.newBlock('robot_select_arm');
      armBlock.setFieldValue('left', 'ARM');
      startBlock.nextConnection.connect(armBlock.previousConnection);
      armBlock.initSvg(); armBlock.render();
      if (allowed.includes('gripper.open') || allowed.includes('gripper.close')) {
        const actionBlock = ws.newBlock(allowed.includes('gripper.open') ? 'robot_gripper_open' : 'robot_gripper_close');
        armBlock.getInput('DO').connection.connect(actionBlock.previousConnection);
        actionBlock.initSvg(); actionBlock.render();
      }
    }
    let twinController = null;
    let twinReady;
    let twinMountCancelled = false;
    let cancelTwinMount = () => {};
    activeWorkspace = { dispose: () => { twinMountCancelled = true; cancelTwinMount(); twinController?.dispose(); ws.dispose(); } };
    const validationEl = sheet.querySelector('[data-validation]');
    const saveState = sheet.querySelector('[data-save-state]');
    const error = sheet.querySelector('[data-error]');
    const versionButton = sheet.querySelector('[data-version]');
    const runButton = sheet.querySelector('[data-run]');
    const localRunButton = sheet.querySelector('[data-run-local]');
    const submitButton = sheet.querySelector('[data-submit]');
    const cameraButton = sheet.querySelector('[data-camera-reset]');
    const pauseButton = sheet.querySelector('[data-simulation-pause]');
    const resumeButton = sheet.querySelector('[data-simulation-resume]');
    const cancelButton = sheet.querySelector('[data-simulation-stop]');
    const progress = sheet.querySelector('[data-simulation-progress]');
    const simulationStatus = sheet.querySelector('[data-simulation-status]');
    let localRunActive = false;
    let localRunPaused = false;
    let programRecord = existingProgram;
    let versionRecord = null;
    let versions = [];

    const reloadVersions = async () => {
      if (!programRecord?.id) return;
      versions = await call('programVersions', programRecord.id);
      fillVersionPicker(sheet.querySelector('[data-version-picker]'), Array.isArray(versions) ? versions : []);
    };

    const check = () => {
      const result = generateCanonicalProgram(ws, assignment);
      renderProblemList(validationEl, result);
      renderBackendValidation(validationEl, programRecord?.validation_result);
      versionButton.disabled = !editable || !result.valid || !programRecord;
      runButton.disabled = !editable || !result.valid || !versionRecord || localRunActive;
      localRunButton.disabled = !editable || !result.valid || !versionRecord || localRunActive;
      submitButton.disabled = !editable || !versionRecord || localRunActive;
      sheet.querySelector('[data-command-preview]').textContent = result.valid
        ? result.program.steps.map((step, index) => `${String(index + 1).padStart(2, '0')}  ${step.type}${step.position ? `  ${step.position.x}, ${step.position.y}, ${step.position.z} mm` : ''}${step.durationMs !== undefined ? `  ${step.durationMs} ms` : ''}`).join('\n')
        : 'Fix validation issues to preview the allowlisted command sequence.';
      return result;
    };
    ws.addChangeListener((event) => {
      if (!editable || event.isUiEvent) return;
      saveState.textContent = 'Unsaved changes';
      versionRecord = null;
      check();
      void bridge.saveDraft(attempt.id, { workspaceJson: Blockly.serialization.workspaces.save(ws), updatedAt: new Date().toISOString(), dirty: true });
    });
    check();
    if (programRecord) await reloadVersions();
    if (!editable) {
      saveState.textContent = `Read-only · attempt ${attempt.status}`;
      for (const selector of ['[data-validate]', '[data-save]', '[data-version]', '[data-run]', '[data-run-local]', '[data-submit]', '[data-restore-version]']) {
        const button = sheet.querySelector(selector); if (button) button.disabled = true;
      }
    }
    const demoMode = (await bridge.getCfg()).mock;
    if (demoMode) {
      runButton.textContent = 'Run Demo schematic';
      localRunButton.hidden = false;
    }
    if (existingProgram) saveState.textContent = demoMode ? 'Saved in Demo fixture' : 'Saved to VISTA';

    sheet.querySelector('[data-validate]').onclick = () => check();
    sheet.querySelector('[data-undo]').onclick = () => ws.undo(false);
    sheet.querySelector('[data-redo]').onclick = () => ws.undo(true);
    sheet.querySelector('[data-reset-workspace]').onclick = () => {
      if (!window.confirm('Reset this Blockly workspace to the starter program? The local draft will be replaced.')) return;
      ws.clear(); addDefaultBlocks(ws, allowed); check();
    };
    sheet.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase())) return;
      event.preventDefault(); ws.undo(event.key.toLowerCase() === 'y' || event.shiftKey);
    });
    sheet.querySelector('[data-save]').onclick = async () => {
      const result = check();
      if (!result.valid) return;
      saveState.textContent = 'Preparing Blockly…';
      const payload = {
        title: assignment.title || lab.title,
        workspaceJson: Blockly.serialization.workspaces.save(ws),
        robotProgram: result.program
      };
      saveState.textContent = 'Blockly ready · saving…';
      try {
        const saveButton = sheet.querySelector('[data-save]');
        saveState.textContent = 'Saving…'; error.hidden = true; saveButton.disabled = true;
        programRecord = programRecord
          ? await call('updateProgram', programRecord.id, { workspaceJson: payload.workspaceJson, robotProgram: payload.robotProgram })
          : await call('createProgram', attempt.id, payload);
        const serverProgram = await call('getProgram', attempt.id);
        if (!serverProgram?.id || serverProgram.id !== programRecord.id) throw new Error('Saved Blockly program could not be reloaded from the Education API.');
        programRecord = serverProgram;
        saveState.textContent = 'API saved · storing local draft…';
        saveState.textContent = demoMode ? 'Saved in Demo fixture' : 'Saved to VISTA';
        await bridge.saveDraft(attempt.id, { workspaceJson: payload.workspaceJson, updatedAt: new Date().toISOString(), dirty: false });
        check();
        renderBackendValidation(validationEl, programRecord.validation_result);
        await reloadVersions();
      } catch (e) { error.hidden = false; error.textContent = apiErrorMessage(e); saveState.textContent = 'Save failed'; }
      finally { sheet.querySelector('[data-save]').disabled = false; }
    };
    versionButton.onclick = async () => {
      try {
        const checkResult = check(); if (!checkResult.valid || !programRecord) return;
        const payload = { workspaceJson: Blockly.serialization.workspaces.save(ws), robotProgram: checkResult.program };
        programRecord = await call('updateProgram', programRecord.id, payload);
        versionRecord = await call('createProgramVersion', programRecord.id, { changeSummary: 'Saved from VISTA Lab Station' });
        await bridge.saveDraft(attempt.id, { workspaceJson: payload.workspaceJson, updatedAt: new Date().toISOString(), dirty: false });
        await reloadVersions();
        sheet.querySelector('[data-version-picker]').value = versionRecord.id;
        renderBackendValidation(validationEl, versionRecord.validation_result);
        sheet.querySelector('[data-result]').textContent = demoMode
          ? `Created Demo fixture version ${versionRecord.version_number}. No VISTA record was created; physical movement remains disabled.`
          : `Saved immutable VISTA version ${versionRecord.version_number}. Physical movement remains disabled.`;
        check();
      } catch (e) { error.hidden = false; error.textContent = apiErrorMessage(e); }
    };
    const versionPicker = sheet.querySelector('[data-version-picker]');
    const restoreButton = sheet.querySelector('[data-restore-version]');
    versionPicker.addEventListener('change', () => { restoreButton.disabled = !versionPicker.value; });
    restoreButton.onclick = () => {
      const chosen = versions.find((version) => version.id === versionPicker.value);
      if (!chosen?.workspace_json) { error.hidden = false; error.textContent = 'This version has no saved Blockly workspace.'; return; }
      Blockly.serialization.workspaces.load(chosen.workspace_json, ws);
      versionRecord = null;
      saveState.textContent = `Restored version ${chosen.version_number} · save to create a new version`;
      sheet.querySelector('[data-result]').textContent = 'Restored an immutable VISTA version into the editor. Save and create a new version before submitting.';
      check();
      renderBackendValidation(validationEl, chosen.validation_result);
    };
    const runLocalMuJoCo = async () => {
      const result = check();
      if (!versionRecord || !result.valid) return;
      if (!window.confirm('Run this allowlisted program on the local MuJoCo SO-101 model? No physical robot will be controlled.')) return;
      const resultEl = sheet.querySelector('[data-result]');
      localRunActive = true; localRunPaused = false; check(); error.hidden = true; resultEl.textContent = 'Checking this lab attempt and starting the local MuJoCo simulation…';
      pauseButton.disabled = false; resumeButton.disabled = true; cancelButton.disabled = false; progress.value = 0;
      const stopProgress = bridge.onSimulationFrame((frame) => {
        if (frame?.source_mode !== 'SIMULATION') return;
        progress.value = Math.round(Number(frame.progress || 0) * 100);
        simulationStatus.textContent = `MuJoCo · ${frame.step || 'Running'} · ${progress.value}% · latency ${frame.latency_ms ?? 0} ms`;
        if (twinController) twinController.setFrame(frame);
      });
      try {
        await ensureWorkspaceTwin();
        const run = await bridge.runSimulation(attempt.id, {
          id: crypto.randomUUID(), expiresAt: Date.now() + 4 * 60_000,
          speed: Number(sheet.querySelector('[data-simulation-speed]').value), steps: result.program.steps
        }, 'RUN_SIMULATION');
        progress.value = 100;
        simulationStatus.textContent = `MuJoCo · ${run.model} · complete · simulation only`;
        resultEl.textContent = `MuJoCo simulated ${run.stepsCompleted} validated steps using ${run.model}. Joint telemetry was read from the physics engine. Physical motion is disabled.`;
      } catch (e) { error.hidden = false; error.textContent = `Local MuJoCo simulation: ${apiErrorMessage(e)}`; resultEl.textContent = 'No MuJoCo execution was confirmed.'; simulationStatus.textContent = e.message.includes('cancelled') ? 'MuJoCo simulation stopped' : 'MuJoCo simulation failed'; }
      finally { stopProgress(); localRunActive = false; localRunPaused = false; pauseButton.disabled = true; resumeButton.disabled = true; cancelButton.disabled = true; check(); }
    };
    localRunButton.onclick = runLocalMuJoCo;
    runButton.onclick = null;
    pauseButton.onclick = async () => { try { await bridge.pauseSimulation(); localRunPaused = true; pauseButton.disabled = true; resumeButton.disabled = false; simulationStatus.textContent = 'MuJoCo simulation paused'; } catch (e) { error.hidden = false; error.textContent = e.message; } };
    resumeButton.onclick = async () => { try { await bridge.resumeSimulation(); localRunPaused = false; pauseButton.disabled = false; resumeButton.disabled = true; } catch (e) { error.hidden = false; error.textContent = e.message; } };
    cancelButton.onclick = async () => { try { await bridge.cancelSimulation(); simulationStatus.textContent = 'Stopping MuJoCo simulation…'; } catch (e) { error.hidden = false; error.textContent = e.message; } };
    cameraButton.onclick = () => twinController?.resetCamera();
    runButton.onclick = async () => {
      if (!versionRecord) return;
      const resultEl = sheet.querySelector('[data-result]');
      runButton.disabled = true; resultEl.textContent = demoMode ? 'Running the clearly labeled local preview…' : 'Creating a server schematic experiment…';
      const program = generateCanonicalProgram(ws, assignment).program;
      if (demoMode) {
        const demoExperiment = await call('createSchematicExperiment', attempt.id, { programVersionId: versionRecord.id, executionMode: 'schematic' });
        const demoResult = await call('runSchematic', demoExperiment.id);
        resultEl.textContent = `Demo schematic result: ${demoResult.status}. No backend, MuJoCo or physical execution occurred.`;
        runButton.disabled = !versionRecord;
        return;
      }
      try {
        const experiment = await call('createSchematicExperiment', attempt.id, { programVersionId: versionRecord.id, executionMode: 'schematic' });
        const started = await call('runSchematic', experiment.id);
        let status = started;
        const deadline = Date.now() + 45000;
        while (!TERMINAL.includes(String(status.status || '').toLowerCase()) && Date.now() < deadline) {
          resultEl.textContent = `VISTA schematic is ${status.status || 'running'}…`;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          status = await call('experimentStatus', experiment.id);
        }
        if (!TERMINAL.includes(String(status.status || '').toLowerCase())) throw new Error('VISTA schematic is still running after 45 seconds. Check the run history before retrying.');
        const [result, events] = await Promise.all([
          call('experimentResult', experiment.id).catch((error) => { if (error.status === 404) return null; throw error; }),
          call('experimentEvents', experiment.id).catch((error) => { if (error.status === 404) return null; throw error; })
        ]);
        // The Education API returns the owned event rows as an array. Keep
        // compatibility with older paginated envelopes while counting both.
        const eventCount = Array.isArray(events) ? events.length : (Array.isArray(events?.items) ? events.items.length : 0);
        const resultRow = Array.isArray(result) ? result[0] : result;
        const resultDetails = resultRow
          ? ` · result ${JSON.stringify({ output: resultRow.output_snapshot, metrics: resultRow.metrics }).slice(0, 900)}` : '';
        const summary = `VISTA schematic status: ${status.status} · mode: ${status.execution_mode || status.executionMode || 'schematic'}${resultDetails}${eventCount ? ` · ${eventCount} server events.` : ''} This is not MuJoCo or physical telemetry.`;
        resultEl.replaceChildren(document.createTextNode(summary));
        try {
          const artifacts = await call('experimentArtifacts', experiment.id);
          const availableArtifacts = (Array.isArray(artifacts) ? artifacts : []).filter((artifact) => artifact?.availability === 'available' && typeof artifact.id === 'string');
          if (availableArtifacts.length) {
            resultEl.append(document.createTextNode(' Server evidence: '));
            for (const artifact of availableArtifacts) {
              const download = document.createElement('button');
              download.type = 'button'; download.className = 'ghost'; download.dataset.experimentEvidence = artifact.id;
              download.textContent = `Download ${artifact.type || 'evidence'}`;
              download.setAttribute('aria-label', `Download server evidence ${artifact.id}`);
              download.onclick = async () => {
                download.disabled = true;
                try { await bridge.openExperimentEvidence(experiment.id, artifact.id); }
                catch (downloadError) { error.hidden = false; error.textContent = `Evidence download: ${apiErrorMessage(downloadError)}`; }
                finally { download.disabled = false; }
              };
              resultEl.append(download, document.createTextNode(' '));
            }
          }
        } catch (evidenceError) {
          // The experiment result remains authoritative even when optional
          // object storage is unavailable; make that limitation visible.
          resultEl.append(document.createTextNode(` Evidence listing unavailable: ${apiErrorMessage(evidenceError)}`));
        }
      } catch (e) { error.hidden = false; error.textContent = `Schematic API: ${apiErrorMessage(e)}`; resultEl.textContent = 'No terminal server result was confirmed. Check the experiment status before starting another run.'; }
      runButton.disabled = !versionRecord;
    };
    submitButton.onclick = async () => {
      if (!versionRecord) return;
      try {
        const submitted = await call('submitAttempt', attempt.id, { programVersionId: versionRecord.id });
        const resultEl = sheet.querySelector('[data-result]');
        resultEl.textContent = 'Submission accepted. Refreshing the saved attempt and LMS status…';
        for (const selector of ['[data-validate]', '[data-save]', '[data-version]', '[data-run]', '[data-run-local]', '[data-submit]', '[data-restore-version]']) {
          const button = sheet.querySelector(selector); if (button) button.disabled = true;
        }
        ws.setIsReadOnly(true);
        try {
          const [freshAttempt, freshLearning] = await Promise.all([
            call('getAttempt', attempt.id),
            call('listLabs')
          ]);
          const matchingRow = (Array.isArray(freshLearning) ? freshLearning : (freshLearning?.labs || []))
            .find((row) => (row.classroom_assignment_id || row.id) === classroomAssignmentId);
          const status = freshAttempt.status || matchingRow?.attempt_status || matchingRow?.status || submitted.status || 'submitted';
          const score = freshAttempt.score ?? matchingRow?.score;
          const feedback = freshAttempt.teacher_feedback || matchingRow?.teacher_feedback;
          resultEl.textContent = `Server attempt refreshed: ${status}${score !== undefined && score !== null ? ` · score ${score}` : ''}${feedback ? ` · ${feedback}` : ''}.`;
          window.dispatchEvent(new CustomEvent('vista:learning-data-changed'));
        } catch (refreshError) {
          resultEl.textContent = `Submission accepted (${submitted.status || 'submitted'}), but the server refresh failed: ${apiErrorMessage(refreshError)}`;
        }
      } catch (e) { error.hidden = false; error.textContent = apiErrorMessage(e); }
    };
    const ensureWorkspaceTwin = () => {
      if (!twinReady) {
        twinReady = createTwin(sheet.querySelector('[data-twin-canvas]'), sheet.querySelector('[data-joints]'), simulationStatus, (cancel) => {
          cancelTwinMount = cancel;
          if (twinMountCancelled) cancel();
        })
          .then((controller) => { twinController = controller; return controller; })
          .catch((modelError) => { simulationStatus.textContent = `SO-101 model unavailable: ${modelError.message}`; throw modelError; });
        twinReady.catch(() => {});
      }
      return twinReady;
    };
    Blockly.svgResize(ws);
    sheet.querySelector('.feature-workspace-page').dataset.workspaceReady = 'true';
  } catch (error) {
    sheet.innerHTML = `<div class="detail-panel feature-error" role="alert"><h2>Workspace unavailable</h2><p>${escapeHtml(error.message)}</p><button class="ghost" data-back>Back to assignments</button></div>`;
    sheet.querySelector('[data-back]').onclick = () => openAssignmentPicker('workspace');
  }
}

async function createTwin(host, joints, status, registerCancel = () => {}) {
  let disposed = false;
  let cancelViewer = () => {};
  const viewerReady = mountTwinViewer(host, (cancel) => { cancelViewer = cancel; registerCancel(() => { disposed = true; cancel(); }); });
  const viewer = await viewerReady;
  if (disposed) { viewer.dispose(); return { setFrame() {}, resetCamera() {}, dispose() {} }; }
  const names = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
  const setFrame = (raw) => {
    const frame = parseTwinFrame(raw, 'local-so101-simulation');
    if (!frame || disposed) return false;
    viewer.setFrame(frame);
    joints.innerHTML = frame.measured.map((reading) => {
      const value = reading.unit === 'rad' ? reading.position * 180 / Math.PI : reading.position;
      const label = names.includes(reading.name) ? reading.name.replaceAll('_', ' ') : reading.name;
      return `<div><span>${escapeHtml(label)}</span><strong>${value.toFixed(1)}°</strong></div>`;
    }).join('');
    status.textContent = `MuJoCo · local simulation · ${frame.step || 'Ready'}`;
    return true;
  };
  let stopListening = () => {};
  stopListening = bridge.onSimulationFrame(setFrame);
  return {
    setFrame,
    resetCamera: () => viewer.resetCamera(),
    dispose() { if (disposed) { stopListening(); return; } disposed = true; stopListening(); viewer.dispose(); joints.replaceChildren(); }
  };
}

async function renderTwinPage(lab = null) {
  const sheet = showLoading('SO-101 Digital Twin', 'Checking assignment and robot viewer access…');
  if (!sheet) return;
  activeTwin?.dispose?.(); activeTwin = null;
  const container = document.createElement('div'); container.className = 'sheet-container';
  container.innerHTML = `<div class="feature-title-row"><div><div class="eyebrow">VISTA DIGITAL TWIN · READ ONLY</div><h1>${escapeHtml(lab?.title || 'SO-101 arm')}</h1><p class="view-subline">${escapeHtml(lab?.courseTitle || 'Assigned lab')} · attempt-bound joint telemetry</p></div><span class="mode-label">NO PHYSICAL COMMANDS</span></div><div class="twin-endpoint-config"><label for="twin-ws-url">Operator WebSocket endpoint</label><input id="twin-ws-url" type="url" placeholder="wss://twin.example.edu/ws/twin" autocomplete="off" spellcheck="false"><button class="ghost" data-save-endpoint>Save endpoint</button><span data-endpoint-state aria-live="polite"></span><p>Use the endpoint supplied by your VISTA operator. Credentials and tokens cannot be entered here. HTTPS deployments require wss://; ws:// is accepted only for localhost.</p></div><div class="twin-connect-toolbar"><label>Allocated robot <select data-robot disabled><option>Loading eligible robots…</option></select></label><button class="primary-action" data-connect disabled>Connect to this lab attempt</button><button class="ghost" data-reset-camera>Reset camera</button><span data-connection class="twin-connection">Disconnected</span></div><div class="feature-error" role="alert" data-twin-error hidden></div><div class="twin-page-grid"><section class="feature-panel twin-page-viewport"><div data-twin-canvas></div><div class="telemetry-note" data-twin-note>VISTA SO-101 URDF · no telemetry connected</div></section><aside class="feature-panel"><h2>Joint state</h2><div data-joints class="joint-state"></div><div class="physical-unavailable"><strong>Read-only telemetry</strong><p>Viewer authorization is requested for the authenticated student, active lab attempt, and selected allocated robot. No robot commands are sent.</p></div></aside></div>`;
  sheet.replaceChildren(container);
  const host = container.querySelector('[data-twin-canvas]');
  const status = container.querySelector('[data-connection]');
  const note = container.querySelector('[data-twin-note]');
  const joints = container.querySelector('[data-joints]');
  const error = container.querySelector('[data-twin-error]');
  const connectButton = container.querySelector('[data-connect]');
  const robotSelect = container.querySelector('[data-robot]');
  let config = await bridge.getCfg();
  const endpointInput = container.querySelector('#twin-ws-url');
  endpointInput.value = config.twinWsUrl || '';
  const endpointState = container.querySelector('[data-endpoint-state]');
  if (config.twinWsManagedByEnvironment) endpointInput.disabled = true;
  if (config.twinWsConfigurationError) endpointState.textContent = `Operator URL rejected: ${config.twinWsConfigurationError}`;
  else if (config.twinWsManagedByEnvironment) endpointState.textContent = 'Managed by VISTA_TWIN_WS_URL.';
  container.querySelector('[data-save-endpoint]').onclick = async () => {
    try { config = await bridge.setCfg({ twinWsUrl: endpointInput.value.trim() }); endpointInput.value = config.twinWsUrl || ''; endpointState.textContent = config.twinWsManagedByEnvironment ? 'Managed by VISTA_TWIN_WS_URL.' : (config.twinWsUrl ? 'Endpoint saved.' : 'Endpoint cleared.'); }
    catch (e) { endpointState.textContent = e.message; }
  };
  let viewer, socket = null, staleTimer = null, reconnectTimer = null, disposed = false;
  let cancelViewer = () => {};
  const disconnect = (message = 'Disconnected') => {
    clearTimeout(staleTimer); clearTimeout(reconnectTimer); staleTimer = reconnectTimer = null;
    if (socket) { const current = socket; socket = null; current.onopen = current.onmessage = current.onerror = current.onclose = null; try { current.close(1000, 'viewer closed'); } catch {} }
    viewer?.setFrame(null); joints.replaceChildren(); status.textContent = message; note.textContent = 'Telemetry disconnected';
  };
  const dispose = () => { disposed = true; disconnect('Disconnected'); cancelViewer(); viewer?.dispose(); if (activeTwin?.dispose === dispose) activeTwin = null; };
  activeTwin = { dispose };
  try {
    viewer = await mountTwinViewer(host, (cancel) => { cancelViewer = cancel; if (disposed) cancel(); });
    if (disposed) { viewer.dispose(); return; }
    note.textContent = 'VISTA SO-101 URDF/STL loaded · telemetry disconnected';
  }
  catch (e) { error.hidden = false; error.textContent = `SO-101 model could not load: ${e.message}`; connectButton.disabled = true; return; }
  container.querySelector('[data-reset-camera]').onclick = () => viewer.resetCamera();
  try {
    const available = await call('digitalTwinAvailability');
    const robots = (Array.isArray(available) ? available : []).filter((r) => r.modelName === 'SO-101' && r.viewerAccess === 'authorized' && r.allocationStatus === 'allocated');
    robotSelect.replaceChildren(...robots.map((robot) => new Option(`${robot.name} · ${robot.status}`, robot.id)));
    robotSelect.disabled = robots.length === 0;
    connectButton.disabled = robots.length === 0;
    if (!robots.length) { robotSelect.replaceChildren(new Option('No allocated SO-101 available', '')); status.textContent = 'No eligible robot'; }
  } catch (e) { robotSelect.replaceChildren(new Option('Robot access unavailable', '')); status.textContent = 'Disconnected'; error.hidden = false; error.textContent = apiErrorMessage(e); }
  const renderFrame = (frame) => {
    viewer.setFrame(frame);
    const readings = frame.source_mode === 'LIVE_PHYSICAL' && frame.calibration_status === 'VERIFIED' ? frame.calibrated : frame.measured;
    joints.innerHTML = (readings || []).map((entry) => `<div><span>${escapeHtml(entry.name)}</span><strong>${Number(entry.position).toFixed(3)} ${escapeHtml(entry.unit)}</strong></div>`).join('');
    const age = Math.max(0, Date.now() - Date.parse(frame.measured_at));
    status.textContent = age > 5000 || frame.connection === 'stale' ? 'Stale telemetry' : `Connected · ${frame.source_mode}`;
    note.textContent = `${frame.source_mode} · ${frame.controller_id} · ${new Date(frame.measured_at).toLocaleTimeString()}`;
    clearTimeout(staleTimer); staleTimer = setTimeout(() => { if (!disposed) status.textContent = 'Stale telemetry · no recent frame'; }, 5000);
  };
  connectButton.onclick = async () => {
    connectButton.disabled = true; error.hidden = true; disconnect('Requesting attempt-bound access…');
    try {
      if (!lab?.classroomAssignmentId && !lab?.id) throw new Error('Open this viewer from an assigned lab.');
      if (!config.twinWsUrl) throw new Error('Configure VISTA_TWIN_WS_URL or the operator WebSocket endpoint first.');
      const attempt = await call('startAttempt', lab.classroomAssignmentId || lab.id);
      if (!attempt?.id || attempt.status && attempt.status !== 'in_progress') throw new Error('Only an active in-progress lab attempt can open the live viewer.');
      const scope = await call('issueTwinViewerScope', attempt.id, { robotId: robotSelect.value });
      if (scope.attemptId !== attempt.id || scope.robotId !== robotSelect.value || !scope.token) throw new Error('VISTA returned a scope that does not match the selected attempt and robot.');
      const connection = connectTwinSocket(config.twinWsUrl, scope.token, {
        WebSocketImpl: window.WebSocket,
        timeoutMs: 10000,
        onOpen: () => { if (!disposed) status.textContent = 'Connected · awaiting telemetry'; },
        onMessage: (event) => {
          try {
            const raw = JSON.parse(event.data);
            if (raw?.type === 'heartbeat') { status.textContent = 'Connected · heartbeat'; clearTimeout(staleTimer); staleTimer = setTimeout(() => { if (!disposed) status.textContent = 'Stale telemetry · heartbeat missed'; }, 15000); return; }
            const frame = parseTwinFrame(raw, scope.robotId);
            if (!frame) return;
            if (frame.attempt_id && frame.attempt_id !== scope.attemptId) { disconnect('Rejected mismatched attempt telemetry'); error.hidden = false; error.textContent = 'Twin frame attempt did not match the authorized lab attempt.'; return; }
            renderFrame(frame);
          } catch { /* malformed server frame is ignored; it never updates the viewer */ }
        },
        onError: () => { if (!disposed) status.textContent = 'Connection error'; },
        onClose: (event) => {
          if (disposed) return;
          clearTimeout(staleTimer); viewer.setFrame(null); joints.replaceChildren(); status.textContent = event.code === 4403 ? 'Authorization expired or denied' : 'Disconnected'; note.textContent = 'Telemetry disconnected';
          if (event.code === 4403) { error.hidden = false; error.textContent = 'VISTA closed this viewer scope. Reconnect to request a fresh attempt-bound authorization.'; }
        }
      });
      socket = connection.socket;
      status.textContent = 'Connecting…';
      await connection.opened;
    } catch (e) { disconnect('Disconnected'); error.hidden = false; error.textContent = apiErrorMessage(e); }
    finally { connectButton.disabled = robotSelect.disabled; }
  };
  window.addEventListener('vista:navigate', dispose, { once: true });
  window.addEventListener('vista:session-expired', dispose, { once: true });
  window.addEventListener('vista:logout', dispose, { once: true });
};

window.vistaDesktop = {
  openWorkspace: (lab, attemptId) => renderWorkspace(normalizeAssignment(lab), attemptId),
  openTwin: (lab) => renderTwinPage(lab)
};

window.addEventListener('vista:navigate', (event) => {
  // Both views own WebGL render loops. The shell replaces the work-sheet on
  // navigation, so dispose their renderers before the canvas is detached.
  // In particular, leaving Blockly for the Twin must not keep its hidden
  // Three.js renderer drawing while the Twin creates a second WebGL context.
  activeWorkspace?.dispose();
  activeWorkspace = null;
  activeTwin?.dispose?.();
  activeTwin = null;

  if (event.detail?.view === 'workspace') openAssignmentPicker('workspace');
  if (event.detail?.view === 'twin') openAssignmentPicker('twin');
});
