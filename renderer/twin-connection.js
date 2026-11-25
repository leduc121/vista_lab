/** Browser WebSocket setup with the authenticated viewer subprotocol and a bounded handshake. */
export function twinHeartbeatStatus(lastTelemetryAt, now = Date.now()) {
  if (!Number.isFinite(lastTelemetryAt)) return 'Connected · awaiting telemetry';
  return now - lastTelemetryAt > 5000
    ? 'Stale telemetry · connection heartbeat active'
    : 'Connected · heartbeat';
}

export function connectTwinSocket(url, token, {
  WebSocketImpl = WebSocket,
  timeoutMs = 10000,
  onOpen = () => {},
  onMessage = () => {},
  onError = () => {},
  onClose = () => {}
} = {}) {
  if (typeof token !== 'string' || !token || /[\s,]/.test(token)) throw new Error('VISTA returned an invalid Twin viewer scope.');
  const socket = new WebSocketImpl(url, [`vista.twin.${token}`]);
  let opened = false;
  let timer;
  const openedPromise = new Promise((resolve, reject) => {
    const rejectIfConnecting = (message) => {
      if (opened) return;
      clearTimeout(timer);
      reject(new Error(message));
    };
    timer = setTimeout(() => {
      if (opened || socket.readyState !== WebSocketImpl.CONNECTING) return;
      try { socket.close(1000, 'viewer handshake timeout'); } catch {}
      rejectIfConnecting('Twin WebSocket handshake timed out. Check the operator endpoint and try again.');
    }, timeoutMs);
    socket.onopen = (event) => {
      opened = true;
      clearTimeout(timer);
      onOpen(event);
      resolve(socket);
    };
    socket.onmessage = onMessage;
    socket.onerror = (event) => {
      onError(event);
      rejectIfConnecting('Twin WebSocket connection failed before it opened.');
    };
    socket.onclose = (event) => {
      clearTimeout(timer);
      onClose(event);
      rejectIfConnecting(event.code === 4403 ? 'Twin viewer authorization expired or was denied.' : 'Twin WebSocket closed before connecting.');
    };
  });
  return { socket, opened: openedPromise };
}
