const path = require('node:path');
const { fileURLToPath } = require('node:url');

function isTrustedMainFrame(event, window, expectedPagePath) {
  if (!window || event?.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
  try {
    const url = new URL(event.senderFrame.url);
    return url.protocol === 'file:' && fileURLToPath(url) === path.resolve(expectedPagePath);
  } catch { return false; }
}

function validateTwinWsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter the VISTA Twin WebSocket endpoint.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Twin endpoint must be a valid WebSocket URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) throw new Error('Twin endpoint must use wss://; ws:// is allowed only for localhost.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Twin endpoint cannot contain credentials, query parameters, or a fragment.');
  if (url.pathname !== '/ws/twin') throw new Error('Twin endpoint must use the verified /ws/twin path.');
  return url.toString();
}

function validateEvidenceDownloadUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('Education API returned an invalid evidence download URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.hash) {
    throw new Error('Education API returned an unsafe evidence download URL.');
  }
  return url.toString();
}

module.exports = { isTrustedMainFrame, validateTwinWsUrl, validateEvidenceDownloadUrl };
