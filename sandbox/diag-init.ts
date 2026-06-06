/**
 * OTEL diag logger ring buffer — must be imported BEFORE any module whose
 * top-level code touches OpenTelemetry (the adapter, the SDK, instrumentation).
 *
 * ESM hoists `import` and `export … from` declarations: all transitive
 * modules execute in dependency order before any module-level code runs in
 * the importer. If `diag.setLogger()` lived alongside the adapter re-export
 * in `telemetry.ts`, the adapter's own module body (which calls
 * `instrumentSDK()` — building the tracer provider, OTLP exporter, etc.)
 * would have already run by the time the logger was installed. Init-time
 * diagnostics would silently go to the default no-op logger.
 *
 * Splitting this into its own module pins the load order: importers do
 * `import './diag-init.ts';` first, then import the adapter, guaranteeing
 * the logger is in place before any OTEL code runs.
 */

import { diag, DiagLogLevel } from '@opentelemetry/api';

export interface DiagEntry { ts: string; level: string; msg: string; }

const DIAG_BUFFER_MAX = 50;
export const diagBuffer: DiagEntry[] = [];

function recordDiag(level: string, args: unknown[]) {
  const msg = args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
  diagBuffer.push({ ts: new Date().toISOString(), level, msg });
  if (diagBuffer.length > DIAG_BUFFER_MAX) diagBuffer.shift();
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

diag.setLogger(
  {
    verbose: () => {},
    debug:   () => {},
    info:    (...a) => recordDiag('info', a),
    warn:    (...a) => recordDiag('warn', a),
    error:   (...a) => recordDiag('error', a),
  },
  DiagLogLevel.INFO,
);
