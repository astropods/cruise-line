/**
 * Public CLI distribution endpoints. Serve the binaries baked into the image
 * by the cli-builder Dockerfile stage, plus a templated install.sh so users
 * can install with a single `curl | sh`.
 *
 * All routes here are unauthenticated — the CLI needs to be installable
 * before the user has any credentials.
 */
import { Hono } from 'hono';
import { stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { AppError } from '../middleware/error.js';
import { SUPPORTED_TARGETS } from '../cli-dist.js';

export const downloadRoutes = new Hono();

// dist/cli/ is populated by the cli-builder stage of the Dockerfile.
// In dev the directory may not exist; endpoints return 404 rather than
// crashing on missing files so `bun run dev` still works.
const CLI_DIR = join(process.cwd(), 'dist', 'cli');

const SUPPORTED_TARGET_SET = new Set<string>(SUPPORTED_TARGETS);

/**
 * GET /download/cruise-line-<os>-<arch>
 * GET /download/cruise-line-<os>-<arch>.sha256
 *
 * Streams the binary or its checksum sidecar. Content-Disposition is set so
 * a browser save-as gives a sensible filename.
 */
downloadRoutes.get('/download/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (!filename) throw new AppError(400, 'Missing filename');

  const match = filename.match(/^cruise-line-(darwin-(?:arm64|amd64))(\.sha256)?$/);
  if (!match) {
    throw new AppError(404, 'Not found');
  }
  const target = match[1]!;
  const isChecksum = !!match[2];

  if (!SUPPORTED_TARGET_SET.has(target)) {
    throw new AppError(404, 'Unsupported target');
  }

  const filePath = join(CLI_DIR, filename);
  if (!existsSync(filePath)) {
    throw new AppError(404, 'CLI binaries are not built in this image');
  }

  // Streaming via Bun.file lets Bun handle the file descriptor + content-length
  // instead of loading the entire binary into memory on every request.
  const file = Bun.file(filePath);
  const size = (await stat(filePath)).size;

  return new Response(file.stream(), {
    headers: {
      'Content-Type': isChecksum ? 'text/plain' : 'application/octet-stream',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
});

/**
 * GET /install.sh
 *
 * One-liner installer. HOST is baked in at request time from config.appUrl
 * so `curl -fsSL https://cl.example.com/install.sh | sh` "just works" —
 * the script downloads binaries from the same host that served it.
 */
downloadRoutes.get('/install.sh', async (c) => {
  const host = config.appUrl.replace(/\/$/, '');
  const script = renderInstallScript(host);
  return new Response(script, {
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});

function renderInstallScript(host: string): string {
  // Rendered as a heredoc-like template. Only HOST is interpolated; the rest
  // is literal shell so a code reviewer can inspect it as a normal script.
  // The script does its own sha256 verification against the sidecar file, so
  // a MITM'd binary is caught before it lands on disk.
  return `#!/usr/bin/env sh
# Cruise Line CLI installer
# Downloads and installs the cruise-line binary matching this deployment.
set -eu

HOST="${host}"

OS=$(uname -s | tr 'A-Z' 'a-z')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
esac

case "\${OS}-\${ARCH}" in
  darwin-arm64|darwin-amd64) ;;
  *)
    echo "Cruise Line CLI is available for macOS only (darwin-arm64, darwin-amd64)." >&2
    echo "Detected: \${OS}-\${ARCH}" >&2
    exit 1
    ;;
esac

TARGET="cruise-line-\${OS}-\${ARCH}"
URL="\${HOST}/download/\${TARGET}"

# Install dir: prefer /usr/local/bin if writable, else ~/.local/bin.
# CRUISE_LINE_INSTALL_DIR overrides both.
if [ -n "\${CRUISE_LINE_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="\$CRUISE_LINE_INSTALL_DIR"
elif [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="\$HOME/.local/bin"
fi
mkdir -p "\$INSTALL_DIR"

TARGET_PATH="\$INSTALL_DIR/cruise-line"
TMP=$(mktemp)
# On any failure past here, don't leave a half-written temp file behind.
trap 'rm -f "\$TMP"' EXIT

echo "Downloading \$URL"
if ! curl -fsSL "\$URL" -o "\$TMP"; then
  echo "Download failed." >&2
  exit 1
fi

# Verify SHA256 against the server-published sidecar. Missing shasum is not
# fatal — some minimal containers don't ship it — but we warn loudly.
if command -v shasum >/dev/null 2>&1; then
  EXPECTED=$(curl -fsSL "\${URL}.sha256" | tr -d ' \\n\\t')
  ACTUAL=$(shasum -a 256 "\$TMP" | awk '{print $1}')
  if [ "\$EXPECTED" != "\$ACTUAL" ]; then
    echo "Checksum mismatch. Expected \$EXPECTED, got \$ACTUAL." >&2
    exit 1
  fi
else
  echo "Warning: shasum not found — skipping checksum verification." >&2
fi

chmod +x "\$TMP"
mv "\$TMP" "\$TARGET_PATH"
trap - EXIT

echo ""
echo "Installed cruise-line to \$TARGET_PATH"

# PATH check
case ":\$PATH:" in
  *":\$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "Note: \$INSTALL_DIR is not in your PATH."
    echo "Add this to your shell profile (e.g. ~/.zshrc or ~/.bashrc):"
    echo "  export PATH=\\"\$INSTALL_DIR:\\\$PATH\\""
    ;;
esac

echo ""
echo "Get started:"
echo "  cruise-line login \$HOST"
`;
}
