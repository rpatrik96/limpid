#!/usr/bin/env bash
#
# Assemble a shareable Limpid bundle: the VS Code extension (.vsix), the headless
# CLI, the LLM operator guide, and example configs — one zip to hand to a
# collaborator. Re-run any time; the output (share/dist/) is git-ignored.
#
#   npm run package:share        # or: bash scripts/package-share.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./apps/extension/package.json').version")"
STAGE="share/dist/limpid-share-${VERSION}"
ZIP="share/dist/limpid-share-${VERSION}.zip"
echo "Packaging Limpid ${VERSION} → ${ZIP}"

# 1. Build the extension, package the .vsix, and build the CLI.
npm run build -w apps/extension >/dev/null
(cd apps/extension && npx --yes @vscode/vsce package --no-dependencies >/dev/null)
npm run build -w apps/cli >/dev/null

VSIX="apps/extension/limpid-${VERSION}.vsix"
[ -f "$VSIX" ] || { echo "ERROR: $VSIX not found (vsce package failed?)" >&2; exit 1; }

# 2. Assemble the bundle.
rm -rf "${STAGE}"
mkdir -p "${STAGE}/cli" "${STAGE}/examples"
cp "$VSIX" "${STAGE}/"                                   # the VS Code extension
cp apps/cli/dist/cli.js "${STAGE}/cli/limpid.js"        # the headless CLI
cp share/README.md share/LIMPID_FOR_LLMS.md "${STAGE}/"
cp -R share/examples/. "${STAGE}/examples/"             # incl. dotfiles (.pre-commit-config.yaml)

# 3. Zip it (flat, with the versioned top-level folder).
rm -f "${ZIP}"
(cd share/dist && zip -rq "limpid-share-${VERSION}.zip" "limpid-share-${VERSION}")

echo "Done. Contents:"
(cd "${STAGE}" && find . -type f | sort | sed 's/^/  /')
echo
ls -lh "${ZIP}"
