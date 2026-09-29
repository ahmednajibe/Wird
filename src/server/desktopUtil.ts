/**
 * Pure helpers for the desktop entry point (desktop.ts), split out so tests
 * can import them without starting a server.
 */
export interface DesktopArgs {
  port?: number;
  noBrowser: boolean;
}

/** Parses '--no-browser' and '--port=N' from process.argv.slice(2). */
export function parseDesktopArgs(argv: string[]): DesktopArgs {
  let port: number | undefined;
  let noBrowser = false;
  for (const arg of argv) {
    if (arg === '--no-browser') {
      noBrowser = true;
    } else if (arg.startsWith('--port=')) {
      port = parsePort(arg.slice('--port='.length));
    } else if (arg === '--port') {
      throw new Error('Usage: --port=NUMBER');
    }
  }
  return { port, noBrowser };
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${raw}". Use an integer between 1 and 65535.`);
  }
  return port;
}

/** --port wins over env.PORT, which wins over the 4545 default. */
export function resolvePort(args: DesktopArgs, env: Record<string, string | undefined>): number {
  if (args.port !== undefined) return args.port;
  const raw = env.PORT?.trim();
  if (raw) return parsePort(raw);
  return 4545;
}

/** EADDRINUSE probe result: reuse the existing Wird window, or refuse. */
export function portConflictAction(health: unknown): 'open-existing' | 'foreign' {
  return typeof health === 'object' && health !== null && (health as { app?: unknown }).app === 'wird'
    ? 'open-existing'
    : 'foreign';
}

/** Command that opens a URL in the user's default browser, per platform. */
export function browserCommand(platform: NodeJS.Platform, url: string): { cmd: string; args: string[] } {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', url] };
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] };
}
