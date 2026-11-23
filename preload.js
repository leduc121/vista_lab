const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vista', Object.freeze({
  call: (method, ...args) => ipcRenderer.invoke('api', method, ...args),
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (config) => ipcRenderer.invoke('cfg:set', config),
  restoreSession: () => ipcRenderer.invoke('session:restore'),
  edgeStatus: () => ipcRenderer.invoke('edge:status'),
  listPolicies: () => ipcRenderer.invoke('policy:list'),
  inspectPolicy: (repositoryId, revision) => ipcRenderer.invoke('policy:inspect', repositoryId, revision),
  importPolicy: (repositoryId, revision) => ipcRenderer.invoke('policy:import', repositoryId, revision),
  loadPolicy: (policyId, device) => ipcRenderer.invoke('policy:load', policyId, device),
  unloadPolicy: () => ipcRenderer.invoke('policy:unload'),
  stopPolicy: () => ipcRenderer.invoke('policy:stop'),
  runPolicy: (prompt) => ipcRenderer.invoke('policy:run', prompt),
  onPolicyProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('policy:progress', listener);
    return () => ipcRenderer.removeListener('policy:progress', listener);
  },
  onPolicyFrame: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, frame) => callback(frame);
    ipcRenderer.on('policy:frame', listener);
    return () => ipcRenderer.removeListener('policy:frame', listener);
  },
  edgeDiagnostics: () => ipcRenderer.invoke('edge:diagnostics'),
  edgePorts: () => ipcRenderer.invoke('edge:ports'),
  edgeConnect: (selection) => ipcRenderer.invoke('edge:connect', selection),
  edgeDisconnect: (role) => ipcRenderer.invoke('edge:disconnect', role),
  edgeJointState: (role) => ipcRenderer.invoke('edge:joint-state', role),
  edgeCalibrationStatus: () => ipcRenderer.invoke('edge:calibration-status'),
  edgeCalibrationProfiles: (role) => ipcRenderer.invoke('edge:calibration-profiles', role),
  edgeCalibrationStart: (params) => ipcRenderer.invoke('edge:calibration-start', params),
  edgeCalibrationCompleteStep: () => ipcRenderer.invoke('edge:calibration-complete-step'),
  edgeCalibrationStop: () => ipcRenderer.invoke('edge:calibration-stop'),
  teleopStatus: () => ipcRenderer.invoke('edge:teleop-status'),
  teleopConfigurePair: (pairId, confirmed) => ipcRenderer.invoke('edge:teleop-configure', pairId, confirmed),
  teleopEnable: (pairId, confirmed) => ipcRenderer.invoke('edge:teleop-enable', pairId, confirmed),
  teleopDeadman: (pairId, held, confirmed) => ipcRenderer.invoke('edge:teleop-deadman', pairId, held, confirmed),
  teleopDisable: (pairId) => ipcRenderer.invoke('edge:teleop-disable', pairId),
  teleopStep: (frame) => ipcRenderer.invoke('edge:teleop-step', frame),
  teleopEmergencyStop: (pairId) => ipcRenderer.invoke('edge:teleop-estop', pairId),
  teleopReset: (pairId, confirmed) => ipcRenderer.invoke('edge:teleop-reset', pairId, confirmed),
  teleopDisconnect: (pairId) => ipcRenderer.invoke('edge:teleop-disconnect', pairId),
  provisioningStatus: () => ipcRenderer.invoke('provisioning:status'),
  createEnrollmentKey: () => ipcRenderer.invoke('provisioning:create-key'),
  enrollDevice: (code) => ipcRenderer.invoke('provisioning:enroll', code),
  refreshDeviceProvisioning: () => ipcRenderer.invoke('provisioning:refresh'),
  openExperimentEvidence: (experimentId, artifactId) => ipcRenderer.invoke('evidence:open', experimentId, artifactId),
  runSimulation: (attemptId, command, confirmation) => ipcRenderer.invoke('edge:simulate', attemptId, command, confirmation),
  cancelSimulation: () => ipcRenderer.invoke('edge:cancel-simulation'),
  pauseSimulation: () => ipcRenderer.invoke('edge:pause-simulation'),
  resumeSimulation: () => ipcRenderer.invoke('edge:resume-simulation'),
  selectMuJoCoModel: () => ipcRenderer.invoke('simulation:select-model'),
  onSimulationFrame: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, frame) => callback(frame);
    ipcRenderer.on('simulation:frame', listener);
    return () => ipcRenderer.removeListener('simulation:frame', listener);
  },
  loadDraft: (assignmentId) => ipcRenderer.invoke('draft:load', assignmentId),
  saveDraft: (assignmentId, draft) => ipcRenderer.invoke('draft:save', assignmentId, draft),
  loadTwinUrdf: () => ipcRenderer.invoke('asset:twin-urdf'),
  loadTwinMesh: (filename) => ipcRenderer.invoke('asset:twin-mesh', filename)
}));
