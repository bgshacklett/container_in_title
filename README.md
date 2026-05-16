# Container In Title

Firefox extension that prepends the current tab's container name to the window title so you can filter windows in time-tracking tools.

## Attribution and Fork Status

This project is maintained as a fork of an extension originally created by ResolveIT.

- Original authorship: ResolveIT
- Current repository: maintained by this fork's maintainers
- Affiliation: This fork is not affiliated with or endorsed by ResolveIT.
- Trademark notice: Any ResolveIT names or marks are referenced only to identify the upstream origin.

## Self-publishing and install (no about:debugging)

Firefox only installs permanently signed add-ons. Use Mozilla's unlisted signing to get a distributable XPI without publishing to the public registry.

1. **Prereqs**: Node 24 (current LTS), `pnpm`, and AMO API credentials (https://addons.mozilla.org/developers/addon/api/key/). The extension ID in `manifest.json` is `{220d013f-ca2e-42dc-8438-de3f4cb7b986}`; keep it as-is when signing.
2. **Build** (unsigned, for local verification): `pnpm run build`. Output lands in `artifacts/`.
3. **Sign** (creates the installable XPI): `AMO_JWT_ISSUER=<your-key> AMO_JWT_SECRET=<your-secret> pnpm run sign`. The signed file is written to `artifacts/` (e.g., `container_in_title-0.0.1-an+fx.xpi`).
4. **Install**: In Firefox, open `about:addons` → gear icon → "Install Add-on From File…" → pick the signed XPI. It installs permanently without using `about:debugging`.

Notes:
- The unsigned build is only installable if you disable signature enforcement in Developer Edition/ESR (`xpinstall.signatures.required=false`).
- Old `META-INF` signing artifacts are intentionally excluded; a fresh signature is generated during the `pnpm run sign` step.

## Compliance Checklist Before Public Release

- Keep `LICENSE` aligned with upstream MPL-2.0 terms.
- Keep attribution details in `NOTICE`.
- Do not publish using ResolveIT branding, logos, or marks in a way that implies endorsement.
