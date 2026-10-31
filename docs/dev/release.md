# Making a release

Releases are built by CI (`.github/workflows/release.yml`), never by hand. The update signing key never leaves GitHub's secrets and the maintainer's own backup; agents never see it.

## Once: the signing key (done 2026-10-31)

- The maintainer generated it on their own machine: `npx tauri signer generate -w "$env:USERPROFILE\.tauri\aidp.key"`.
- The private key and its password are the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- The public key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` (key ID `EE9A69E11D7D346C`).
- Back up the private key. If it is lost, installed copies of the app can never be updated again.

## Each release

1. **Pick the version** (SemVer; release candidates are `0.1.0-rc.N`). Set it in all three places:
   - `npm version <version> --no-git-tag-version` (updates `package.json` and `package-lock.json`);
   - `version` in `src-tauri/Cargo.toml` and in `src-tauri/tauri.conf.json`.

   The test `versions_match_across_files` fails if they differ; the release tag is `v` + this version.
2. **Changelog:** move the Unreleased items in `CHANGELOG.md` under the new version.
3. **Gate, commit, push** to `main`, and wait for CI to be green.
4. **Run the workflow:** GitHub → Actions → **Release** → Run workflow on `main`. It creates one draft release `v<version>` and builds:
   - Windows: the NSIS installer `.exe`, with its `.sig`;
   - macOS: a universal `.dmg` (Apple silicon and Intel), and `.app.tar.gz` with its `.sig`;
   - Linux: `.AppImage` and `.deb`, each with a `.sig` where the bundler makes one;
   - `latest.json`, which the app's updater reads.

   It stops at once if a release for that version already exists.
5. **Check the draft** on the Releases page: every file above is there, and `latest.json` lists `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64` and `linux-x86_64`. The first run (`v0.1.0-rc.1`, 2026-10-31, about 20 minutes) produced:

   | File | Size |
   | --- | --- |
   | `A.I.D.P_0.1.0-rc.1_x64-setup.exe` + `.sig` | 4.4 MB |
   | `A.I.D.P_0.1.0-rc.1_universal.dmg` | 10.9 MB |
   | `A.I.D.P_universal.app.tar.gz` + `.sig` (macOS updates) | 11.0 MB |
   | `A.I.D.P_0.1.0-rc.1_amd64.AppImage` + `.sig` | 86.6 MB (bundles WebKitGTK) |
   | `A.I.D.P_0.1.0-rc.1_amd64.deb` + `.sig` | 6.5 MB |
   | `latest.json` | also has per-format keys such as `linux-x86_64-deb` and `windows-x86_64-nsis` |

   Each `.sig` should name key `EE9A69E11D7D346C`: decode the file from base64, take the second line, decode it, and read bytes 2 to 9 reversed. A different key means the secret holds the wrong private key, and installed apps would refuse the update.
6. **Publish** the draft as a normal release, not a pre-release: the updater reads `releases/latest`, which skips pre-releases.

## Notes

- **Not code-signed** (M6 plan, D2): Windows SmartScreen and macOS Gatekeeper warn on first run; the user guide shows the steps. macOS builds are ad-hoc signed (`signingIdentity: "-"`), which Apple silicon needs to open them at all.
- **No MSI:** WiX rejects versions like `0.1.0-rc.1`. For a local installer use `npm run tauri build -- --bundles nsis`. Without `TAURI_SIGNING_PRIVATE_KEY` set, `createUpdaterArtifacts` stays off locally (it lives in `src-tauri/tauri.updater.conf.json`, which only the workflow passes), so local builds need no key.
- **Pinned actions:** every action in `release.yml` is pinned to a full commit hash, because the job holds the signing key. To update one, find the new tag's commit (`gh api repos/<owner>/<action>/commits/<tag> -q .sha`), read what changed, and replace both the hash and the tag in its comment. `dtolnay/rust-toolchain` then needs `toolchain: stable` as an input.
- **A failed run** leaves its draft behind. Delete that draft on the Releases page before running the workflow again, or the draft job stops.
