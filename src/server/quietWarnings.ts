/**
 * Hides the node:sqlite ExperimentalWarning from the console. The desktop
 * binary cannot pass --no-warnings=ExperimentalWarning like the npm scripts
 * do, so it wraps emitWarning instead. Imported first by desktop.ts so the
 * wrapper is installed before node:sqlite is loaded in the CJS bundle.
 */
const original = process.emitWarning;

process.emitWarning = function emitWarning(
  warning: string | Error,
  ...args: unknown[]
): void {
  const name = warning instanceof Error ? warning.name : typeof args[0] === 'string' ? args[0] : (args[0] as { type?: string } | undefined)?.type;
  const message = warning instanceof Error ? warning.message : String(warning);
  if (name === 'ExperimentalWarning' && /sqlite/i.test(message)) return;
  return (original as (...a: unknown[]) => void).call(process, warning, ...args);
} as typeof process.emitWarning;
