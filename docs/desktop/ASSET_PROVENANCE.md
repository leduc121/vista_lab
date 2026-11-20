# SO-101 model asset provenance

Reviewed 2026-11-20. Rights-cleared model files are vendored with their notices.

| Asset | Desktop path | Source and rights |
| --- | --- | --- |
| SO-101 MuJoCo model, scene and mesh assets | `models/so101/` | Copied from MuJoCo Menagerie `robotstudio_so101/` at source revision `98a70c569c4c1b6da467a20012f766ee1f8dc521`. The source README identifies the Robot Studio SO101 model, derives it from TheRobotStudio/SO-ARM100 revision `608122e9ac330a753735f2e18aee73338e9ac407`, and declares Apache-2.0. The upstream model LICENSE and README are included unchanged. |
| SO-101 calibrated URDF and 13 STL meshes | `renderer/assets/so101/` | Copied from the VISTA Education web asset package. Its included `LICENSE` and `NOTICE.md` identify the upstream TheRobotStudio/SO-ARM100 Apache-2.0 license and note that meshes are unmodified while the URDF is adapted for the VISTA viewer. |
| Previously used GLB | `renderer/assets/SO-Arm101.glb` | Excluded. Its author, source and redistribution license remain unverified. The viewer uses the licensed URDF/STL model instead. |

The two licensed model packages retain their notices. This is separate from
Electron and JavaScript dependency licenses. Release signing and installer
acceptance remain independent release gates.
