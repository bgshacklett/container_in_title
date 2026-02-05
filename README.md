# Container In Title

Firefox extension that prepends the current tab's container name to the window title so you can filter windows in time-tracking tools.

## Self-publishing and install (no about:debugging)

Firefox only installs permanently signed add-ons. Use Mozilla's unlisted signing to get a distributable XPI without publishing to the public registry.

1. **Prereqs**: Node 18+, `npm`, and AMO API credentials (https://addons.mozilla.org/developers/addon/api/key/). The extension ID in `manifest.json` is `{220d013f-ca2e-42dc-8438-de3f4cb7b986}`; keep it as-is when signing.
2. **Build** (unsigned, for local verification): `npm run build`. Output lands in `artifacts/`.
3. **Sign** (creates the installable XPI): `AMO_JWT_ISSUER=<your-key> AMO_JWT_SECRET=<your-secret> npm run sign`. The signed file is written to `artifacts/` (e.g., `container_in_title-0.0.1-an+fx.xpi`).
4. **Install**: In Firefox, open `about:addons` → gear icon → "Install Add-on From File…" → pick the signed XPI. It installs permanently without using `about:debugging`.

Notes:
- The unsigned build is only installable if you disable signature enforcement in Developer Edition/ESR (`xpinstall.signatures.required=false`).
- Old `META-INF` signing artifacts are intentionally excluded; a fresh signature is generated during the `npm run sign` step.
