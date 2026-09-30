# Releasing Wird

Releases are built by `.github/workflows/release.yml` when a `v*` tag is
pushed. The workflow verifies, packages for Windows and Linux, smoke-tests
every artifact, and creates a **draft** GitHub release. The maintainer
reviews the draft and publishes it manually.

## Checklist

1. Bump the version: `npm version <x.y.z> --no-git-tag-version` (updates
   `package.json` and `package-lock.json` together).
2. Run the full local gate:
   ```
   npm run typecheck
   npm test
   npm run build
   npm run e2e
   ```
3. Commit the version bump and push.
4. Tag: `git tag v<x.y.z>` then `git push origin v<x.y.z>`. The tag version
   must equal `package.json` `version`; the verify job fails otherwise.
5. Wait for the release workflow to go green. A `workflow_dispatch` run of
   the same workflow is a dry run: it verifies and packages but skips the
   release job.
6. Download the artifacts from the draft release (or the workflow run) and
   verify them against `SHA256SUMS.txt`
   (`sha256sum -c SHA256SUMS.txt`).
7. Test on a clean machine or VM: the Inno installer, the portable zip, and
   both one-line installers.
8. Submit the new `wird.exe` and `*-win-x64-setup.exe` to
   [Microsoft's file submission portal](https://www.microsoft.com/en-us/wdsi/filesubmission)
   as a software developer, to reduce SmartScreen and antivirus false
   positives on fresh builds.
9. Publish the draft release.

## Code signing

All signing goes through one hook: `node scripts/sign.mjs <file...>`.
Locally and on unsigned builds it prints a skip line and exits 0. The
release workflow calls it with the `WIRD_SIGN_CMD` repository secret; when
set, the command is run once per file with the file path appended.

To enable signing, pick one:

- **SignPath**: apply for the open-source program, create an organization,
  project, and signing policy in SignPath, store a wrapper command (or a
  script that calls their tooling or GitHub Action output) in the
  `WIRD_SIGN_CMD` secret, and re-run the workflow. The exact SignPath
  parameters and action inputs are to be confirmed against SignPath's
  current documentation when this is set up; nothing else in the workflow
  needs to change.
- **signtool**: with a certificate on a self-hosted or accessible machine,
  set `WIRD_SIGN_CMD` to a command wrapping `signtool sign /fd sha256 ...`.
  A hardware-token certificate cannot live on GitHub-hosted runners.

The Windows lane signs `build/sea/wird.exe` before packaging and the
installer after packaging.

## Node version upgrades

The pinned Node version lives in three places and all must change together:

- `.nvmrc` (and `engines` in `package.json`)
- `NODE_VERSION` in `install/install.sh` (the macOS lane downloads this
  exact runtime from nodejs.org)
- the SEA blob is built from the running `node`, so CI `setup-node` uses
  `.nvmrc` and stays consistent automatically.

After bumping, run the full gate (typecheck, test, build, e2e, build:sea)
on the new version.

## Winget and Homebrew

Not yet set up. The Inno installer is already winget-compatible (silent
install, per-user, fixed AppId), so a winget manifest can be submitted to
microsoft/winget-pkgs once the first public release exists. A Homebrew
cask can point at the macOS install artifacts once the macOS packaging
lane (`package-macos` job in release.yml, currently disabled) is wired to
a real darwin SEA build.

## TODO for the maintainer

- Capture SmartScreen screenshots for the README: run the unsigned setup
  exe on a clean Windows machine, screenshot the "Windows protected your
  PC" dialog and the "More info / Run anyway" step, save as
  `docs/screenshots/smartscreen-1.png` and `smartscreen-2.png`, and replace
  the HTML comment in README.md with real image tags.
