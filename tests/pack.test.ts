/**
 * Plan-pack schema + validation: friendly errors, semantic checks, and the
 * catalog <-> pack round trip on the owner data.
 */
import { describe, expect, it } from 'vitest';
import { packToCatalogData, validatePack } from '../src/shared/pack.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import { OWNER_CATALOG_DATA, OWNER_PACK } from '../src/server/seed/ownerCatalog.js';

function errors(input: unknown): string[] {
  const r = validatePack(input);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.errors.map((e) => e.message);
}

function studyTrack(id = 'medicine') {
  return {
    id,
    kind: 'study' as const,
    label: 'Medicine',
    theme: 'blue',
    icon: 'heartbeat',
    streams: [{ id: 'main', label: 'Main' }],
  };
}

const TEMPLATE = [[{ track: 'medicine', stream: 'main', role: 'focus', kind: 'share', share: 1 }], [], [], [], [], [], []];

function studyPack(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    name: 'Test plan',
    tracks: [studyTrack()],
    modules: [],
    settings: { weeklyTemplate: TEMPLATE },
    ...overrides,
  };
}

describe('validatePack', () => {
  it('accepts the owner pack with zero errors', () => {
    const r = validatePack(OWNER_PACK);
    if (!r.ok) console.log(r.errors);
    expect(r.ok).toBe(true);
  });

  it('round trips the owner catalog through a pack', () => {
    const r = validatePack(OWNER_PACK);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(packToCatalogData(r.pack)).toEqual(OWNER_CATALOG_DATA);
  });

  it('accepts a minimal Quran-only pack', () => {
    const r = validatePack({ version: 1, name: 'Q', tracks: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.catalog.tracks).toHaveLength(1);
      expect(r.catalog.tracks[0]?.kind).toBe('quran');
      expect(r.settings).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('reports a missing required field', () => {
    const bad = studyPack();
    delete (bad.tracks[0] as Record<string, unknown>).label;
    expect(errors(bad).some((m) => m.includes('label is required'))).toBe(true);
  });

  it('rejects an id with a slash with a self-contained message', () => {
    const bad = studyPack();
    (bad.tracks[0] as Record<string, unknown>).id = 'Med/1';
    expect(errors(bad)).toContain(
      `tracks[0].id 'Med/1' is not allowed: use lowercase letters, digits and '-', starting with a letter or digit (no '/')`,
    );
  });

  it('reports an unknown module field with the allowed list', () => {
    const bad = studyPack({
      modules: [
        {
          id: 'med-x',
          track: 'medicine',
          stream: 'main',
          phase: { id: 'A1', title: 'P1' },
          title: 'X',
          estMinutes: 30,
          minutes: 30,
        },
      ],
    });
    expect(errors(bad)).toContain(
      `modules[0] (id 'med-x'): unknown field 'minutes'. Allowed fields: id, track, stream, phase, title, resources, estMinutes, kind, note, estimateUncertain, warmupDrills`,
    );
  });

  it('reports an unknown settings.quran field', () => {
    const bad = studyPack({ settings: { weeklyTemplate: TEMPLATE, quran: { enable: false } } });
    expect(errors(bad)).toContain(
      `settings.quran: unknown field 'enable'. Allowed fields: enabled, memorizationOrder, memorizeMinutes, minutesPerReviewPage, reviewCapMinutes, reviewMinMinutes, nearPages, rollingWindow, rollingMinSessions`,
    );
  });

  it('lists the allowed values for a bad theme', () => {
    const bad = studyPack();
    (bad.tracks[0] as Record<string, unknown>).theme = 'pink';
    expect(errors(bad)).toContain(
      `tracks[0] (id 'medicine'): theme 'pink' is not allowed. Allowed: amber, blue, violet, coral, green, teal, rose, slate`,
    );
  });

  it('reports a module referencing an unknown track', () => {
    const bad = studyPack({
      modules: [{ id: 'med-x', track: 'nope', stream: 'main', phase: { id: 'A1', title: 'P1' }, title: 'X', estMinutes: 30 }],
    });
    expect(errors(bad)).toContain(`module 'med-x' references track 'nope' which is not defined in tracks[]`);
  });

  it('reports a module referencing an unknown stream', () => {
    const bad = studyPack({
      modules: [{ id: 'med-x', track: 'medicine', stream: 'lab', phase: { id: 'A1', title: 'P1' }, title: 'X', estMinutes: 30 }],
    });
    expect(errors(bad)).toContain(`module 'med-x' references stream 'lab' which is not defined in track 'medicine'.streams[]`);
  });

  it('reports a template slot referencing an unknown track', () => {
    const bad = studyPack({
      settings: {
        weeklyTemplate: [[], [], [], [], [], [{ track: 'nope', stream: 'main', role: 'focus', kind: 'rest' }], []],
      },
    });
    expect(errors(bad)).toContain(`settings.weeklyTemplate[5][0] references track 'nope' which is not defined in tracks[]`);
  });

  it('reports a template slot referencing an unknown stream', () => {
    const bad = studyPack({
      settings: {
        weeklyTemplate: [[{ track: 'medicine', stream: 'lab', role: 'focus', kind: 'rest' }], [], [], [], [], [], []],
      },
    });
    expect(errors(bad)).toContain(
      `settings.weeklyTemplate[0][0] references stream 'lab' which is not defined in track 'medicine'.streams[]`,
    );
  });

  it('reports a library entry referencing an unknown stream', () => {
    const bad = studyPack({ library: [{ track: 'medicine', stream: 'lab', name: 'Book' }] });
    expect(errors(bad)).toContain(`library[0] references stream 'lab' which is not defined in track 'medicine'.streams[]`);
  });

  it('reports duplicate module ids', () => {
    const m = { track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'P1' }, title: 'X', estMinutes: 30 };
    const bad = studyPack({ modules: [{ ...m, id: 'med-x' }, { ...m, id: 'med-x', title: 'Y' }] });
    expect(errors(bad)).toContain(`modules[1]: duplicate module id 'med-x'`);
  });

  it('reports duplicate track and stream ids', () => {
    const bad = studyPack({ tracks: [studyTrack(), studyTrack()] });
    expect(errors(bad)).toContain(`tracks[1]: duplicate track id 'medicine'`);
    const badStream = studyPack();
    (badStream.tracks[0] as { streams: unknown[] }).streams.push({ id: 'main', label: 'Dup' });
    expect(errors(badStream)).toContain(`tracks[0].streams[1]: duplicate stream id 'main' in track 'medicine'`);
  });

  it('reports a phase with two titles in a stream', () => {
    const bad = studyPack({
      modules: [
        { id: 'med-a', track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'First' }, title: 'A', estMinutes: 30 },
        { id: 'med-b', track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'Different' }, title: 'B', estMinutes: 30 },
      ],
    });
    expect(errors(bad)).toContain(`phase 'A1' has two titles in medicine/main: 'First' (module 'med-a') and 'Different' (module 'med-b')`);
  });

  it('reports a split phase', () => {
    const bad = studyPack({
      modules: [
        { id: 'med-a', track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'P1' }, title: 'A', estMinutes: 30 },
        { id: 'med-c', track: 'medicine', stream: 'main', phase: { id: 'A2', title: 'P2' }, title: 'C', estMinutes: 30 },
        { id: 'med-b', track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'P1' }, title: 'B', estMinutes: 30 },
      ],
    });
    expect(errors(bad)).toContain(
      `phase 'A1' in medicine/main is split: module 'med-c' belongs to phase 'A2' but comes between modules of 'A1'. Keep each phase's modules together`,
    );
  });

  it('rejects a second Quran track and a Quran track with another id', () => {
    const quran = (id: string) => ({ id, kind: 'quran' as const, label: 'Quran', theme: 'amber', icon: 'book-open' });
    expect(errors({ version: 1, name: 'T', tracks: [quran('quran'), quran('quran')] })).toContain(
      `tracks[1]: only one Quran track is allowed`,
    );
    expect(errors({ version: 1, name: 'T', tracks: [quran('deen')] }).some((m) => m.includes(`the Quran track's id must be 'quran'`))).toBe(true);
  });

  it('rejects a Quran track with a streams field', () => {
    const bad = {
      version: 1,
      name: 'T',
      tracks: [{ id: 'quran', kind: 'quran', label: 'Quran', theme: 'amber', icon: 'book-open', streams: [] }],
    };
    expect(errors(bad).some((m) => m.includes(`unknown field 'streams'`))).toBe(true);
  });

  it('requires weeklyTemplate in the pack when it defines study tracks', () => {
    const bad = studyPack();
    delete (bad as Record<string, unknown>).settings;
    expect(errors(bad)).toContain('settings.weeklyTemplate is required when the pack defines study tracks');
  });

  it('requires weeklyTemplate to give at least one slot', () => {
    const bad = studyPack({ settings: { weeklyTemplate: [[], [], [], [], [], [], []] } });
    expect(errors(bad)).toContain('settings.weeklyTemplate must give at least one slot');
  });

  it('warns about streams without modules, without template time, and practice streams without drills', () => {
    const pack = {
      version: 1,
      name: 'T',
      tracks: [
        {
          id: 'medicine',
          kind: 'study',
          label: 'Medicine',
          theme: 'blue',
          icon: 'heartbeat',
          streams: [
            { id: 'main', label: 'Main' },
            { id: 'drills', label: 'Drills', style: 'practice' },
          ],
        },
      ],
      modules: [{ id: 'med-x', track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'P1' }, title: 'X', estMinutes: 30 }],
      settings: { weeklyTemplate: TEMPLATE },
    };
    const r = validatePack(pack);
    expect(r.ok).toBe(true);
    const w = r.warnings.map((x) => x.message);
    expect(w).toContain(`stream 'drills' in track 'medicine' has no modules; only open practice sessions will be planned`);
    expect(w).toContain(`stream 'drills' in track 'medicine' gets no time: no weeklyTemplate slot references it`);
    expect(w).toContain(`practice stream 'drills' in track 'medicine' has no defaultDrills; a generic warm-up text will be used`);
  });

  it('maps estMinutes failures to a friendly message naming the module id', () => {
    const bad = studyPack({
      modules: [
        { id: 'med-x', track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'P1' }, title: 'X', estMinutes: 0 },
        { id: 'med-y', track: 'medicine', stream: 'main', phase: { id: 'A1', title: 'P1' }, title: 'Y', estMinutes: 30 },
      ],
    });
    expect(errors(bad)).toContain(`modules[0] (id 'med-x'): estMinutes must be a whole number of minutes, at least 1`);
  });
});
