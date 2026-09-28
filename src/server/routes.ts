/**
 * HTTP API routes (JSON). Inputs are validated with zod; invalid input -> 400.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { dayOfWeek, diffDays, isIsoDate } from '../shared/dates.js';
import { ApiError, badRequest } from './errors.js';
import type { LearningService, ManualTaskInput } from './service.js';
import { calendar, dashboard, quran, resources, stats, tracks, week } from './views.js';

const isoDate = z.string().refine(isIsoDate, { message: 'expected a valid date YYYY-MM-DD' });

const manualTaskSchema = z.object({
  date: isoDate.optional(),
  track: z.string(),
  stream: z.string().optional(),
  title: z.string().trim().min(1, 'title is required').max(200),
  description: z.string().max(2000).optional(),
  minutes: z.number().int().min(1).max(600),
  type: z.enum(['learn', 'practice', 'build', 'review', 'memorize']),
  pagesCount: z.number().int().min(1).max(20).nullable().optional(),
  offCurriculum: z.boolean().optional(),
  completed: z.boolean().optional(),
  actualMinutes: z.number().int().min(1).max(600).nullable().optional(),
});

const completeSchema = z.object({ actualMinutes: z.number().int().min(1).max(600).nullable().optional() });
const regenerateSchema = z.object({ from: isoDate.optional() });
const daySchema = z.object({
  fasting: z.boolean().nullable(),
  capacityOverride: z.number().int().min(0).max(960).nullable(),
  note: z.string().max(500).nullable().optional(),
});

function formatIssues(err: z.ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw badRequest('Invalid input', formatIssues(r.error));
  return r.data;
}

async function jsonBody(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
}

function dateParam(value: string | undefined, fallback: string, name = 'date'): string {
  if (value === undefined || value === '') return fallback;
  if (!isIsoDate(value)) throw badRequest(`Invalid ${name} '${value}', expected YYYY-MM-DD`);
  return value;
}

function idParam(c: Context): number {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid task id');
  return id;
}

export function apiRoutes(service: LearningService): Hono {
  const api = new Hono();

  api.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) }, err.status);
    }
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  api.get('/health', (c) => c.json({ ok: true, today: service.today() }));

  api.get('/dashboard', (c) => {
    const date = dateParam(c.req.query('date'), service.today());
    return c.json(dashboard(service, date));
  });

  api.get('/week', (c) => {
    const start = dateParam(c.req.query('start'), service.today(), 'start');
    if (c.req.query('start') !== undefined && dayOfWeek(start) !== 0) {
      throw badRequest(`start must be a Sunday (weeks start on Sunday); got ${start}`);
    }
    return c.json(week(service, start));
  });

  api.post('/plan/regenerate', async (c) => {
    const body = parse(regenerateSchema, await jsonBody(c));
    const result = service.regenerate(body.from ?? service.today());
    service.syncQuranTasks();
    return c.json(result);
  });

  api.post('/tasks/score-preview', async (c) => {
    const body = parse(manualTaskSchema, await jsonBody(c)) as ManualTaskInput;
    return c.json(service.scorePreview(body));
  });

  api.post('/tasks', async (c) => {
    const body = parse(manualTaskSchema, await jsonBody(c)) as ManualTaskInput;
    return c.json(service.createManual(body), 201);
  });

  api.post('/tasks/:id/complete', async (c) => {
    const id = idParam(c);
    const body = parse(completeSchema, await jsonBody(c));
    return c.json(service.complete(id, body.actualMinutes ?? null));
  });

  api.post('/tasks/:id/uncomplete', (c) => c.json(service.uncomplete(idParam(c))));
  api.post('/tasks/:id/skip', (c) => c.json(service.skip(idParam(c))));
  api.delete('/tasks/:id', (c) => {
    service.deleteManual(idParam(c));
    return c.json({ ok: true });
  });

  api.get('/tracks', (c) => c.json(tracks(service)));
  api.post('/modules/:id/complete', (c) => {
    service.completeModule(c.req.param('id'));
    return c.json(tracks(service));
  });
  api.post('/modules/:id/reset', (c) => {
    service.resetModule(c.req.param('id'));
    return c.json(tracks(service));
  });

  api.get('/resources', (c) => c.json(resources(service)));
  api.get('/quran', (c) => c.json(quran(service)));
  api.get('/stats', (c) => c.json(stats(service)));

  api.get('/settings', (c) => c.json(service.settings()));
  api.put('/settings', async (c) => {
    const body = await jsonBody(c);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('Settings must be an object');
    return c.json(service.updateSettings(body));
  });

  api.get('/days/:date', (c) => {
    const date = dateParam(c.req.param('date'), '');
    return c.json(service.dayView(date));
  });
  api.put('/days/:date', async (c) => {
    const date = dateParam(c.req.param('date'), '');
    const body = parse(daySchema, await jsonBody(c));
    return c.json(service.updateDay(date, { fasting: body.fasting, capacityOverride: body.capacityOverride, note: body.note ?? null }));
  });

  api.get('/calendar', (c) => {
    const t = service.today();
    const from = dateParam(c.req.query('from'), t, 'from');
    const to = dateParam(c.req.query('to'), from, 'to');
    if (to < from) throw badRequest('to must be on or after from');
    if (diffDays(from, to) > 400) throw badRequest('calendar range is limited to 400 days');
    return c.json(calendar(service, from, to));
  });

  api.notFound((c) => c.json({ error: `Not found: ${c.req.method} ${c.req.path}` }, 404));
  return api;
}
