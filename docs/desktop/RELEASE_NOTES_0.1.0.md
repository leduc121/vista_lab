# VISTA Lab Station 0.1.0

VISTA Lab Station provides a desktop workspace for assigned lab activities, Blockly exercises, and local SO-101 MuJoCo simulation. Robotics Profile is an optional operator-configured runtime.

## Runtime profiles

- **Simulation Profile:** uses the packaged Edge runtime and SO-101 model. Verify from the installed release build before general distribution.
- **Robotics Profile:** requires an operator-managed isolated Python 3.12 environment and an authorized VISTA Edge source checkout. No model checkpoint, CUDA toolkit, or system-Python dependency installation is included.

## Installers

The GitHub Draft Release is the source of truth for the exact platform files, architectures, checksums, SBOMs, and third-party notices. Do not use locally staged or unverified candidate artifacts. This release note file is a draft input and does not itself make a public download available.

## Known limits

- Unsigned installers may show operating-system publisher warnings.
- Physical robot operation is not release-certified by this package.
- Robotics dependencies and Edge source checkout are not installed by the desktop installer.
- Platform support and download links are limited to artifacts successfully built and verified for this release.
