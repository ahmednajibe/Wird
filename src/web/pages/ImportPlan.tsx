import { ArrowRight, CaretLeft, CheckCircle, ClipboardText, FileArrowUp, Info, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, ApiError, errorMessage } from '../client/client';
import { useCatalog, useCommitImport } from '../client/hooks';
import type { ChangeCounts, IdReuse, ImportMode, ImportPreview, PackIssue } from '../client/types';
import { Button } from '../components/ui/Button';
import { Card, Chip, EmptyState, ErrorState, PageHeader, Segmented, Skeleton } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { cn, formatHours } from '../lib/format';

interface ParsedPack {
  ok: true;
  value: unknown;
}

function parseJson(text: string): ParsedPack | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lm = msg.match(/line (\d+) column (\d+)/i);
    if (lm) return { ok: false, message: `Not valid JSON near line ${lm[1]}, column ${lm[2]}` };
    const pm = msg.match(/position (\d+)/i);
    if (pm) {
      const pos = Number(pm[1]);
      const upto = text.slice(0, pos);
      const line = upto.split('\n').length;
      const col = pos - (upto.lastIndexOf('\n') + 1) + 1;
      return { ok: false, message: `Not valid JSON near line ${line}, column ${col}` };
    }
    return { ok: false, message: `Not valid JSON: ${msg}` };
  }
}

function IssueList({ issues, testId }: { issues: PackIssue[]; testId?: string }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm" data-testid={testId}>
      {issues.map((e, i) => (
        <li key={i} className="flex items-start gap-2">
          <WarningCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <span className="text-muted">
            {e.path ? <span className="num text-ink">{e.path}: </span> : null}
            {e.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WarningList({ warnings }: { warnings: PackIssue[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-warn/30 bg-warn/8 p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
        <Info size={15} className="text-warn" aria-hidden /> Warnings
      </div>
      <ul className="flex flex-col gap-1 text-sm text-muted">
        {warnings.map((w, i) => (
          <li key={i}>
            {w.path ? <span className="num">{w.path}: </span> : null}
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CountsTable({ counts }: { counts: { tracks: ChangeCounts; streams: ChangeCounts; modules: ChangeCounts } }) {
  const cols: (keyof ChangeCounts)[] = ['added', 'updated', 'unchanged', 'revived', 'archived'];
  return (
    <div className="overflow-x-auto" data-testid="preview-counts">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1.5 pr-3 font-medium" />
            {cols.map((c) => (
              <th key={c} className="py-1.5 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['tracks', 'streams', 'modules'] as const).map((k) => (
            <tr key={k} className="border-t border-line">
              <td className="py-1.5 pr-3 font-medium text-ink capitalize">{k}</td>
              {cols.map((c) => (
                <td key={c} className={cn('num py-1.5 pr-3', counts[k][c] > 0 ? 'text-ink' : 'text-subtle')}>
                  {counts[k][c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportPlanPage() {
  const catalog = useCatalog();
  const commit = useCommitImport();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [modeChoice, setModeChoice] = useState<ImportMode | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [reuse, setReuse] = useState<IdReuse>('reset');
  const [commitErrors, setCommitErrors] = useState<PackIssue[] | null>(null);

  const hasPlan = catalog.data?.hasPlan ?? false;
  const mode: ImportMode = modeChoice ?? (hasPlan ? 'update' : 'fresh');
  const okPreview = preview?.ok ? preview : null;

  const copyPrompt = async () => {
    setPromptError(null);
    try {
      const res = await api.planPrompt();
      await navigator.clipboard.writeText(res.markdown);
      toast({ title: 'Prompt copied', body: 'Paste it into your AI assistant.' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setPromptError('PLAN_PROMPT.md is missing from this install');
      else toast({ tone: 'error', title: 'Could not load the prompt', body: errorMessage(err) });
    }
  };

  const copyErrors = async (issues: PackIssue[]) => {
    await navigator.clipboard.writeText(issues.map((e) => `${e.path}: ${e.message}`).join('\n'));
    toast({ title: 'Errors copied', body: 'Paste them back into your AI assistant to fix plan.json.' });
  };

  const pickFile = async (file: File | null) => {
    if (!file) return;
    setText(await file.text());
    setParseError(null);
    setPreview(null);
  };

  const runPreview = async () => {
    setCommitErrors(null);
    const parsed = parseJson(text);
    if (!parsed.ok) {
      setParseError(parsed.message);
      setPreview(null);
      return;
    }
    setParseError(null);
    setPreviewing(true);
    try {
      setPreview(await api.importPreview(parsed.value, mode));
    } catch (err) {
      toast({ tone: 'error', title: 'Preview failed', body: errorMessage(err) });
    } finally {
      setPreviewing(false);
    }
  };

  const runImport = async () => {
    const parsed = parseJson(text);
    if (!parsed.ok) {
      setParseError(parsed.message);
      return;
    }
    setParseError(null);
    setCommitErrors(null);
    try {
      const res = await commit.mutateAsync({ pack: parsed.value, mode, onIdReuse: reuse });
      toast({ title: 'Plan imported', body: res.regenerated ? 'The plan from today was rebuilt.' : 'Nothing needed re-planning.' });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const det = err.rawDetails as { errors?: PackIssue[] } | undefined;
        setCommitErrors(det?.errors ?? [{ path: '', message: err.message }]);
      } else {
        toast({ tone: 'error', title: 'Import failed', body: errorMessage(err) });
      }
    }
  };

  if (catalog.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (catalog.isError) return <ErrorState message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Import a plan"
        subtitle="A plan.json file describes your tracks, streams, modules and settings. Preview it before anything changes."
        eyebrow={
          <Link to="/settings" className="inline-flex items-center gap-1 transition-colors hover:text-ink">
            <CaretLeft size={14} aria-hidden /> Back to Settings
          </Link>
        }
      />

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-ink">1. Write plan.json with an AI assistant</h2>
        <p className="text-sm text-muted">Give PLAN_PROMPT.md to an AI assistant. It will ask you a few questions and write plan.json.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" icon={ClipboardText} onClick={() => void copyPrompt()} data-testid="copy-prompt">
            Copy prompt
          </Button>
          {promptError && (
            <span className="text-sm text-warn" data-testid="prompt-missing">
              {promptError}
            </span>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-ink">2. Paste or pick the file</h2>
        <textarea
          className="field num min-h-40 font-mono text-xs"
          placeholder='{"version": 1, "name": "My plan", ...}'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setParseError(null);
            setPreview(null);
          }}
          aria-label="plan.json content"
          aria-invalid={Boolean(parseError)}
          data-testid="pack-input"
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 text-accent-ink underline underline-offset-2">
            <FileArrowUp size={15} aria-hidden />
            Choose a .json file
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} data-testid="pack-file" />
          </label>
          {parseError && (
            <span className="text-danger" role="alert" data-testid="parse-error">
              {parseError}
            </span>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-ink">3. How to apply it</h2>
        <Segmented<ImportMode>
          label="Import mode"
          value={mode}
          onChange={(v) => {
            setModeChoice(v);
            setPreview(null);
          }}
          options={[
            { value: 'update', label: 'Update my plan' },
            { value: 'fresh', label: 'Start fresh' },
          ]}
        />
        <p className="text-sm text-muted" data-testid="mode-hint">
          {mode === 'update'
            ? 'Tracks, streams and modules the file leaves out are archived, not deleted. Completed work, points and streaks are always kept.'
            : 'Everything not in the file is archived and the new plan takes over. Completed work, points and streaks are always kept.'}
        </p>
        <div>
          <Button variant="secondary" icon={ArrowRight} onClick={() => void runPreview()} loading={previewing} disabled={text.trim() === ''} data-testid="preview-button">
            Preview
          </Button>
        </div>
      </Card>

      {preview && !preview.ok && (
        <Card className="flex flex-col gap-4 border-danger/30 p-5 sm:p-6" data-testid="preview-errors">
          <h2 className="text-base font-semibold tracking-tight text-ink">The file needs a few fixes</h2>
          <IssueList issues={preview.errors} testId="preview-error-list" />
          <WarningList warnings={preview.warnings} />
          <div>
            <Button variant="secondary" size="sm" icon={ClipboardText} onClick={() => void copyErrors(preview.errors)} data-testid="copy-errors">
              Copy errors for your AI
            </Button>
          </div>
        </Card>
      )}

      {okPreview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="flex flex-col gap-4 p-5 sm:p-6" data-testid="preview-ok">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Preview: {okPreview.name}
              </h2>
              <p className="text-sm text-muted">{okPreview.regenerates ? `Today onward is re-planned from ${okPreview.regenerateFrom}.` : 'No re-planning needed.'}</p>
            </div>
            <CountsTable counts={okPreview.counts} />
            {okPreview.archived.length > 0 && (
              <div>
                <div className="label mb-2">Archived</div>
                <ul className="flex flex-col gap-1 text-sm text-muted" data-testid="archived-list">
                  {okPreview.archived.map((a) => (
                    <li key={`${a.kind}-${a.id}`}>
                      <span className="capitalize">{a.kind}</span> <span className="num text-ink">{a.id}</span>: {a.title}
                      {a.hasProgress && <Chip tone="warn" className="ml-2">has progress, kept in history</Chip>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {okPreview.settingsChanged.length > 0 && (
              <div>
                <div className="label mb-2">Settings that change</div>
                <div className="flex flex-wrap gap-1.5">
                  {okPreview.settingsChanged.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </div>
              </div>
            )}
            <WarningList warnings={okPreview.warnings} />
            {mode === 'fresh' && okPreview.reusedWithProgress.length > 0 && (
              <div className="rounded-[10px] border border-line-strong bg-surface-2/60 p-4" data-testid="reuse-question">
                <p className="text-sm font-medium text-ink">These modules already have progress. Reset it to 0, or keep it?</p>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                  {okPreview.reusedWithProgress.map((r) => (
                    <li key={r.id}>
                      <span className="num text-ink">{r.id}</span>: {r.title} ({formatHours(r.creditedMinutes)} credited{r.manualComplete ? ', manually completed' : ''})
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Segmented<IdReuse>
                    label="Progress on reused module ids"
                    value={reuse}
                    onChange={setReuse}
                    options={[
                      { value: 'reset', label: 'Reset to 0' },
                      { value: 'keep', label: 'Keep progress' },
                    ]}
                  />
                </div>
              </div>
            )}
            <div>
              <Button variant="primary" icon={CheckCircle} onClick={() => void runImport()} loading={commit.isPending} data-testid="commit-button">
                Import plan
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {commitErrors && (
        <Card className="flex flex-col gap-3 border-danger/30 p-5 sm:p-6" data-testid="commit-errors">
          <h2 className="text-base font-semibold tracking-tight text-ink">The server rejected this plan</h2>
          <IssueList issues={commitErrors} />
          <div>
            <Button variant="secondary" size="sm" icon={ClipboardText} onClick={() => void copyErrors(commitErrors)}>
              Copy errors for your AI
            </Button>
          </div>
        </Card>
      )}

      {!hasPlan && !preview && (
        <Card>
          <EmptyState icon={FileArrowUp} title="Nothing to update yet" body="This install has no study plan. Paste a plan.json above and choose 'Start fresh'." />
        </Card>
      )}
    </div>
  );
}
