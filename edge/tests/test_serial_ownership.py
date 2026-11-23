import os
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from edge.serial_ownership import SerialOwnershipError, SerialPortOwner


class SerialOwnershipTests(unittest.TestCase):
    def test_shared_port_lock_blocks_a_second_local_owner_until_release(self):
        with tempfile.TemporaryDirectory(prefix="vista-serial-lock-test-") as directory, patch.dict(
            os.environ, {"VISTA_HARDWARE_LOCK_DIR": directory}
        ):
            first = SerialPortOwner("/dev/fake-port", "test-a").acquire()
            try:
                with self.assertRaises(SerialOwnershipError):
                    SerialPortOwner("/dev/fake-port", "test-b").acquire()
            finally:
                first.release()
            second = SerialPortOwner("/dev/fake-port", "test-b").acquire()
            second.release()

    @unittest.skipIf(os.name == "nt", "POSIX O_NOFOLLOW lock-file check")
    def test_lock_file_symlink_is_rejected_without_touching_target(self):
        with tempfile.TemporaryDirectory(prefix="vista-serial-lock-test-") as directory, patch.dict(
            os.environ, {"VISTA_HARDWARE_LOCK_DIR": directory}
        ):
            port = "/dev/fake-symlink"
            lock_name = hashlib.sha256(port.encode()).hexdigest() + ".lock"
            target = Path(directory) / "target"
            target.write_text("keep", encoding="utf-8")
            (Path(directory) / lock_name).symlink_to(target)
            with self.assertRaises(OSError):
                SerialPortOwner(port, "test").acquire()
            self.assertEqual(target.read_text(encoding="utf-8"), "keep")


if __name__ == "__main__":
    unittest.main()
