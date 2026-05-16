# Releasing

Signed XPIs are produced by the `Release Signed XPI` workflow
(`.github/workflows/release-signed-xpi.yml`), triggered when a tag matching
`v*` is pushed. There is no auto-signing on merge to `main`; tags are the only
release event.

## One-time setup

1. **AMO API credentials.** In repo Settings → Secrets and variables → Actions,
   set `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` from
   https://addons.mozilla.org/developers/addon/api/key/. Rotate them there if
   they are ever exposed; the workflow picks up new values on the next run.
2. **Tag authorization (optional but recommended).** Anyone with `push` access
   to the repo can trigger a release by pushing a `v*` tag. To restrict this,
   add a tag protection rule for `v*` under Settings → Code and automation →
   Tags.

## Cutting a release

1. Open a **release PR** that:
   - Bumps `version` in `manifest.json` to a 3-segment value
     (e.g. `0.0.2` → `0.0.3`). AMO requires the version to match
     `^(0|[1-9][0-9]{0,8})([.](0|[1-9][0-9]{0,8})){0,3}$` — digits and
     dots only, max 4 segments, no letters or hyphens.
   - Adds a matching `## [X.Y.Z]` section to `CHANGELOG.md` under
     `## [Unreleased]`. The header text must equal the version exactly;
     the workflow fails if no section matches.
2. Merge the release PR to `main`.
3. Tag the merge commit and push the tag:
   ```sh
   git checkout main
   git pull
   git tag v0.0.3
   git push origin v0.0.3
   ```
   The tag (minus `v`) must exactly equal `manifest.json`'s `version`.
4. Watch the workflow run in the Actions tab. On success, the signed XPI is
   published at:
   - Version-pinned: `https://github.com/<org>/<repo>/releases/download/v0.0.3/container_in_title-0.0.3-an+fx.xpi`
   - Stable alias: `https://github.com/<org>/<repo>/releases/latest/download/container_in_title.xpi`

## Testing changes before release

To get a signed, installable XPI for a candidate change without cutting a
release, open a pull request against `main` (a draft PR is fine). The
`pr-signed-xpi.yml` workflow signs the build via AMO and posts a comment
on the PR with a download link.

Each PR build gets a unique version of the form
`<manifest-version>.<build-id>`, where `<build-id>` encodes the workflow
run number and attempt so re-runs and successive pushes never collide on
AMO. PR build versions sort below the next stable release in Firefox's
version comparator, so anyone testing a PR build auto-updates to the
stable release once it ships.

PR builds are not GitHub Releases — the signed XPI is uploaded as a
workflow artifact and the PR comment is the canonical download point.
GitHub artifacts expire after 30 days.

## What the workflow does

1. Verifies `manifest.json` version equals the tag (minus the `v` prefix);
   fails loudly if they disagree.
2. Extracts the `## [X.Y.Z]` section from `CHANGELOG.md` for release notes.
3. Creates a **draft** GitHub Release with those notes (no assets yet).
4. Installs dependencies and signs the XPI via AMO (`web-ext sign --channel=unlisted`).
5. Uploads the signed XPI twice: under its original
   `container_in_title-<version>-an+fx.xpi` name, and renamed to
   `container_in_title.xpi` for the stable `latest` URL.
6. Flips the draft Release to published.

The draft-first ordering means anything that fails before signing leaves no
half-built Release and consumes no AMO version slot.

## Recovering from a failed release

| Failed step | State after failure | Recovery |
|---|---|---|
| Verify | No Release, no AMO call | Delete the tag (`git push --delete origin v0.0.3`), fix `manifest.json`, re-tag. |
| Changelog extraction | No Release, no AMO call | Add the missing `## [X.Y.Z]` section to `CHANGELOG.md` on `main`, delete and re-create the tag pointing at the new commit. |
| Draft create | No Release, no AMO call | Re-run the workflow from the Actions tab. The create step is idempotent. |
| Sign | Draft Release exists with notes, no assets | Re-run the workflow. `web-ext sign` is idempotent at the AMO level — if the version was already accepted, it fetches the existing signed file. If you need different bytes, bump the version and re-tag (AMO will not let you reuse a signed version). |
| Asset upload | Draft Release exists, assets partial | Re-run; uploads use `--clobber`. |
| Publish | Draft Release fully built, just not live | Flip the draft to published manually in the Releases UI, or re-run. |

## Authorization model

- AMO signing credentials live only in GitHub Actions secrets and are never
  exposed in logs. The workflow reads them via `env:` blocks scoped to the
  signing step.
- The right to cut a release is equivalent to the right to push a `v*` tag.
  Configure tag protection if that boundary needs to be narrower than `write`
  access to the repo.
- Do not sign locally. If the workflow is broken, fix the workflow rather
  than running `pnpm run sign` with credentials on a developer machine —
  local signing leaks the AMO secret into shell history, environment
  dumps, and process listings.
