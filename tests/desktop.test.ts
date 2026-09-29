/**
 * Pure helpers of the desktop entry point (src/server/desktopUtil.ts):
 * argument parsing, port resolution, port-conflict decisions, and the
 * browser-launch command per platform.
 */
import { describe, expect, it } from 'vitest';
import {
  browserCommand,
  parseDesktopArgs,
  portConflictAction,
  resolvePort,
} from '../src/server/desktopUtil.js';

describe('parseDesktopArgs', () => {
  it('defaults to no flags', () => {
    expect(parseDesktopArgs([])).toEqual({ port: undefined, noBrowser: false });
  });

  it('parses --no-browser and --port', () => {
    expect(parseDesktopArgs(['--no-browser'])).toEqual({ port: undefined, noBrowser: true });
    expect(parseDesktopArgs(['--port=4592', '--no-browser'])).toEqual({ port: 4592, noBrowser: true });
  });

  it('rejects invalid ports', () => {
    for (const arg of ['--port=abc', '--port=0', '--port=-1', '--port=65536', '--port=45.5', '--port', '--port=']) {
      expect(() => parseDesktopArgs([arg]), arg).toThrow();
    }
  });
});

describe('resolvePort', () => {
  it('follows --port > PORT > 4545 precedence', () => {
    expect(resolvePort({ port: 4592, noBrowser: false }, { PORT: '1234' })).toBe(4592);
    expect(resolvePort({ noBrowser: false }, { PORT: '1234' })).toBe(1234);
    expect(resolvePort({ noBrowser: false }, { PORT: ' ' })).toBe(4545);
    expect(resolvePort({ noBrowser: false }, {})).toBe(4545);
  });

  it('rejects an invalid PORT env', () => {
    expect(() => resolvePort({ noBrowser: false }, { PORT: 'abc' })).toThrow();
    expect(() => resolvePort({ noBrowser: false }, { PORT: '70000' })).toThrow();
  });
});

describe('portConflictAction', () => {
  it('opens the existing window for a Wird health response', () => {
    expect(portConflictAction({ app: 'wird', version: '0.1.0' })).toBe('open-existing');
  });

  it('treats anything else as a foreign process', () => {
    for (const health of [null, undefined, 'wird', 42, {}, { app: 'other' }, { app: 'Wird' }, { ok: true }]) {
      expect(portConflictAction(health)).toBe('foreign');
    }
  });
});

describe('browserCommand', () => {
  const url = 'http://127.0.0.1:4545';
  it('uses cmd start on Windows', () => {
    expect(browserCommand('win32', url)).toEqual({ cmd: 'cmd', args: ['/c', 'start', '""', url] });
  });
  it('uses open on macOS', () => {
    expect(browserCommand('darwin', url)).toEqual({ cmd: 'open', args: [url] });
  });
  it('uses xdg-open elsewhere', () => {
    expect(browserCommand('linux', url)).toEqual({ cmd: 'xdg-open', args: [url] });
  });
});
