"""Cross-process advisory ownership for local SO-101 serial ports.

The lock filename and JSON owner record follow LeLab's VISTA interoperability
format. Lock primitives are selected per OS; ownership is released by the OS if
the process exits unexpectedly.
"""

from __future__ import annotations

import hashlib
import errno
import json
import os
import stat
import tempfile
from pathlib import Path


class SerialOwnershipError(RuntimeError):
    pass


class SerialPortOwner:
    def __init__(self, port: str, purpose: str):
        configured = os.environ.get("VISTA_HARDWARE_LOCK_DIR")
        default_root = Path(tempfile.gettempdir()) / "vista-hardware-locks" if os.name == "nt" else Path("/tmp/vista-hardware-locks")
        self.port, self.purpose = port, purpose
        self.root = Path(configured) if configured else default_root
        digest = hashlib.sha256(port.encode()).hexdigest()
        self.path = self.root / f"{digest}.lock"
        self._file = None
        self._locked = False

    def acquire(self) -> "SerialPortOwner":
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        root_stat = self.root.lstat()
        if not stat.S_ISDIR(root_stat.st_mode):
            raise PermissionError("The configured serial lock directory must be a real directory.")
        if os.name != "nt" and (root_stat.st_uid != os.geteuid() or stat.S_IMODE(root_stat.st_mode) & 0o077):
            raise PermissionError("The serial lock directory must be owned by this user with owner-only permissions.")
        if os.name == "nt":
            self._file = self.path.open("a+b")
        else:
            flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
            descriptor = os.open(self.path, flags, 0o600)
            try:
                entry = os.fstat(descriptor)
                if not stat.S_ISREG(entry.st_mode) or entry.st_uid != os.geteuid():
                    raise PermissionError("The serial lock file must be a regular file owned by this user.")
                os.fchmod(descriptor, 0o600)
                self._file = os.fdopen(descriptor, "r+b")
            except Exception:
                os.close(descriptor)
                raise
        try:
            if os.name == "nt":
                import msvcrt
                self._file.seek(0, os.SEEK_END)
                if self._file.tell() == 0:
                    self._file.write(b"\0")
                    self._file.flush()
                self._file.seek(0)
                msvcrt.locking(self._file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            self._file.close()
            self._file = None
            if error.errno in {errno.EACCES, errno.EAGAIN, errno.EDEADLK}:
                raise SerialOwnershipError(f"Serial port {self.port} is owned by another supported local process.") from error
            raise
        self._locked = True
        try:
            record = json.dumps({"pid": os.getpid(), "port": self.port, "purpose": self.purpose}).encode()
            self._file.seek(0)
            self._file.truncate()
            self._file.write(record)
            self._file.flush()
            if os.name != "nt":
                os.fchmod(self._file.fileno(), 0o600)
            return self
        except Exception:
            self.release()
            raise

    def release(self) -> None:
        if self._file is None:
            return
        try:
            if self._locked:
                if os.name == "nt":
                    import msvcrt
                    self._file.seek(0)
                    msvcrt.locking(self._file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
        finally:
            self._locked = False
            self._file.close()
            self._file = None
