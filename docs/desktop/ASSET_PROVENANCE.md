# SO-101 viewer asset provenance

Reviewed 2026-11-19. These are existing viewer assets in the Desktop checkout. The audit verified provenance evidence and hashes; it did not grant new redistribution rights.

| Asset | Desktop path | SHA-256 | Source/rights status |
| --- | --- | --- | --- |
| GLB used by Blockly illustration | `renderer/assets/SO-Arm101.glb` | `1e9141f4834b10009dad0849becf251abf057e04a1e6f47d7fd97d1c83573927` | The checked VISTA source provenance audit identifies a different GLB in the CHECKIK workspace and says that model's author/source/license are unresolved. This Desktop GLB is not hash-identical to that asset. Exact author, original URL, license and attribution terms remain unverified. |
| Calibrated URDF | `renderer/assets/so101/urdf/so101_new_calib.urdf` | `443d38d756e01bac7d3455b24430047ddc6427105e0d3454b2003116f5f67236` | Byte-identical to the LeLab reference's URDF at commit `84b6251cec3471195dfa35119827fbd1da2a801e` and VISTA's existing web asset. |
| 13 STL meshes | `renderer/assets/so101/meshes/*.stl` | See the existing VISTA service asset provenance record | Byte-identical to the referenced LeLab package and existing VISTA web assets. Its package metadata declares BSD, but no subtree license text is present; the source repository's Apache-2.0 license alone does not settle the CAD-derived mesh redistribution terms. |

Before public distribution, the asset owner must confirm rights for the GLB and mesh package and provide required license/attribution notices. Until then, AppImage, DEB, and NSIS are acceptance artifacts only; do not publish them. This is separate from Electron and JavaScript dependency licenses.
