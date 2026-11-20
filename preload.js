const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vista', Object.freeze({
  call: (method, ...args) => ipcRenderer.invoke('api', method, ...args),
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (config) => ipcRenderer.invoke('cfg:set', config),
  restoreSession: () => ipcRenderer.invoke('session:restore'),
  edgeStatus: () => ipcRenderer.invoke('edge:status'),
  edgeDiagnostics: () => ipcRenderer.invoke('edge:diagnostics'),
  edgePorts: () => ipcRenderer.invoke('edge:ports'),
  edgeConnect: (selection) => ipcRenderer.invoke('edge:connect', selection),
  edgeDisconnect: () => ipcRenderer.invoke('edge:disconnect'),
  edgeJointState: () => ipcRenderer.invoke('edge:joint-state'),
  provisioningStatus: () => ipcRenderer.invoke('provisioning:status'),
  createEnrollmentKey: () => ipcRenderer.invoke('provisioning:create-key'),
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
