/**
 * Data-directory resolution for the packaged app (resolveDataDir /
 * resolveDesktopDbPath) plus the unchanged dev-mode resolveDbPath.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  logDirFor,
  resolveDataDir,
  resolveDbPath,
  resolveDesktopDbPath,
  type DataDirInput,
} from '../src/server/config.js';

const input = (over: Partial<DataDirInput>): DataDirInput => ({
  platform: 'linux',
  env: {},
  home: '/home/u',
  cwd: '/work/app',
  ...over,
});

describe('resolveDataDir', () => {
  it('uses LEARNING_DATA_DIR first (absolute)', () => {
    expect(resolveDataDir(input({ env: { LEARNING_DATA_DIR: '/data/wird' } }))).toBe('/data/wird');
  });
  it('resolves a relative LEARNING_DATA_DIR against cwd', () => {
    expect(resolveDataDir(input({ platform: 'win32', env: { LEARNING_DATA_DIR: 'mydata' }, home: 'C:\\Users\\a', cwd: 'D:\\app' }))).toBe(
      'D:\\app\\mydata',
    );
  });
  it('ignores a blank LEARNING_DATA_DIR', () => {
    expect(resolveDataDir(input({ env: { LEARNING_DATA_DIR: '   ' } }))).toBe('/home/u/.local/share/wird');
  });
  it('portable exeDir wins over the per-user dir', () => {
    expect(
      resolveDataDir(input({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\L' }, home: 'C:\\U', cwd: 'D:\\x', exeDir: 'E:\\Wird', portable: true })),
    ).toBe('E:\\Wird\\data');
  });
  it('portable without exeDir falls through to per-user', () => {
    expect(resolveDataDir(input({ portable: true, exeDir: undefined }))).toBe('/home/u/.local/share/wird');
    expect(resolveDataDir(input({ portable: false, exeDir: '/exe' }))).toBe('/home/u/.local/share/wird');
  });
  it('win32 uses LOCALAPPDATA (never Roaming)', () => {
    expect(
      resolveDataDir(input({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, home: 'C:\\Users\\a', cwd: 'D:\\x' })),
    ).toBe('C:\\Users\\a\\AppData\\Local\\Wird');
  });
  it('win32 falls back to home\\AppData\\Local', () => {
    expect(resolveDataDir(input({ platform: 'win32', env: {}, home: 'C:\\Users\\a', cwd: 'D:\\x' }))).toBe(
      'C:\\Users\\a\\AppData\\Local\\Wird',
    );
  });
  it('darwin uses ~/Library/Application Support/Wird', () => {
    expect(resolveDataDir(input({ platform: 'darwin', home: '/Users/a' }))).toBe('/Users/a/Library/Application Support/Wird');
  });
  it('linux honours an absolute XDG_DATA_HOME', () => {
    expect(resolveDataDir(input({ env: { XDG_DATA_HOME: '/xdg/data' } }))).toBe('/xdg/data/wird');
  });
  it('linux ignores a relative XDG_DATA_HOME and uses ~/.local/share', () => {
    expect(resolveDataDir(input({ env: { XDG_DATA_HOME: 'relative/xdg' } }))).toBe('/home/u/.local/share/wird');
    expect(resolveDataDir(input({}))).toBe('/home/u/.local/share/wird');
  });
});

describe('resolveDesktopDbPath', () => {
  it('LEARNING_DB_PATH wins', () => {
    expect(resolveDesktopDbPath(input({ env: { LEARNING_DB_PATH: '/elsewhere/x.db', LEARNING_DATA_DIR: '/data/wird' } }))).toBe(
      '/elsewhere/x.db',
    );
  });
  it('resolves a relative LEARNING_DB_PATH against cwd', () => {
    expect(resolveDesktopDbPath(input({ env: { LEARNING_DB_PATH: 'tmp/x.db' } }))).toBe('/work/app/tmp/x.db');
  });
  it('defaults to <data dir>/learning.db', () => {
    expect(resolveDesktopDbPath(input({}))).toBe('/home/u/.local/share/wird/learning.db');
  });
});

describe('logDirFor / resolveDbPath', () => {
  it('logDirFor appends logs', () => {
    expect(logDirFor('/data/wird')).toBe(join('/data/wird', 'logs'));
  });
  it('resolveDbPath keeps its original behavior', () => {
    const cwd = 'D:\\work\\app';
    expect(resolveDbPath({}, cwd)).toBe(join(cwd, 'data', 'learning.db'));
    expect(resolveDbPath({ LEARNING_DB_PATH: 'custom.db' }, cwd)).toBe(join(cwd, 'custom.db'));
    expect(resolveDbPath({ LEARNING_DB_PATH: '  ' }, cwd)).toBe(join(cwd, 'data', 'learning.db'));
  });
});
