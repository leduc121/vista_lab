function secureStorageAvailable(safeStorage, platform = process.platform) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (platform !== 'linux') return true;
  return !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend());
}

module.exports = { secureStorageAvailable };
