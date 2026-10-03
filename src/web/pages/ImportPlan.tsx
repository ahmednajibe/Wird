import { ArrowRight, CaretLeft, CheckCircle, ClipboardText, FileArrowUp, Info, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, ApiError, errorMessage } from '../client/client';
import { useCatalog, useCommitImport } from '../client/hooks';
import type { ChangeCounts, IdReuse, ImportMode, ImportPreview, PackIssue } from '../client/types';
import { Button } from '../components/ui/Button';
import { Card, Chip, EmptyState, ErrorState, PageHeader, Segmented, Skeleton } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { useI18n, type StringKey } from '../i18n';
import { isolate } from '../i18n/engineText';
import { cn, formatHours } from '../lib/format';

interface ParsedPack {
  ok: true;
  value: unknown;
}

type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

function parseJson(text: string, t: Translate): ParsedPack | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lm = msg.match(/line (\d+) column (\d+)/i);
    if (lm) return { ok: false, message: t('import.errJsonLine', { line: lm[1] ?? '', col: lm[2] ?? '' }) };
    const pm = msg.match(/position (\d+)/i);
    if (pm) {
      const pos = Number(pm[1]);
      const upto = text.slice(0, pos);
      const line = upto.split('\n').length;
      const col = pos - (upto.lastIndexOf('\n') + 1) + 1;
      return { ok: false, message: t('import.errJsonLine', { line, col }) };
    }
    return { ok: false, message: t('import.errJson', { msg: isolate(msg) }) };
  }
}

/** Server-side pack messages stay English: they are pasted back to the AI that wrote the plan. */
function ServerMessages({ children }: { children: ReactNode }) {
  const { t, lang } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      {lang === 'ar' && <p className="text-xs text-muted">{t('import.englishNote')}</p>}
      <div dir="ltr" lang="en" className="flex flex-col gap-3 text-start">
        {children}
      </div>
    </div>
  );
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
  const { t } = useI18n();
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-warn/30 bg-warn/8 p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
        <Info size={15} className="text-warn" aria-hidden /> {t('import.warnings')}
      </div>
      <ul className="flex flex-col gap-1 text-sm text-muted" dir="ltr" lang="en">
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

const COUNT_COLS: { key: keyof ChangeCounts; label: StringKey }[] = [
  { key: 'added', label: 'import.colAdded' },
  { key: 'updated', label: 'import.colUpdated' },
  { key: 'unchanged', label: 'import.colUnchanged' },
  { key: 'revived', label: 'import.colRevived' },
  { key: 'archived', label: 'import.colArchived' },
];
const COUNT_ROWS: { key: 'tracks' | 'streams' | 'modules'; label: StringKey }[] = [
  { key: 'tracks', label: 'import.rowTracks' },
  { key: 'streams', label: 'import.rowStreams' },
  { key: 'modules', label: 'import.rowModules' },
];

function CountsTable({ counts }: { counts: { tracks: ChangeCounts; streams: ChangeCounts; modules: ChangeCounts } }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto" data-testid="preview-counts">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-xs text-muted">
            <th className="py-1.5 pe-3 font-medium" />
            {COUNT_COLS.map((c) => (
              <th key={c.key} className="py-1.5 pe-3 font-medium">
                {t(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COUNT_ROWS.map((k) => (
            <tr key={k.key} className="border-t border-line">
              <td className="py-1.5 pe-3 font-medium text-ink">{t(k.label)}</td>
              {COUNT_COLS.map((c) => (
                <td key={c.key} className={cn('num py-1.5 pe-3', counts[k.key][c.key] > 0 ? 'text-ink' : 'text-subtle')}>
                  {counts[k.key][c.key]}
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
  const { t, tRich } = useI18n();

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
      toast({ title: t('import.promptCopied'), body: t('import.promptCopiedBody') });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setPromptError(t('import.promptMissing'));
      else toast({ tone: 'error', title: t('import.errPrompt'), body: errorMessage(err) });
    }
  };

  const copyErrors = async (issues: PackIssue[]) => {
    await navigator.clipboard.writeText(issues.map((e) => `${e.path}: ${e.message}`).join('\n'));
    toast({ title: t('import.errorsCopied'), body: t('import.errorsCopiedBody') });
  };

  const pickFile = async (file: File | null) => {
    if (!file) return;
    setText(await file.text());
    setParseError(null);
    setPreview(null);
  };

  const runPreview = async () => {
    setCommitErrors(null);
    const parsed = parseJson(text, t);
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
      toast({ tone: 'error', title: t('import.errPreview'), body: errorMessage(err) });
    } finally {
      setPreviewing(false);
    }
  };

  const runImport = async () => {
    const parsed = parseJson(text, t);
    if (!parsed.ok) {
      setParseError(parsed.message);
      return;
    }
    setParseError(null);
    setCommitErrors(null);
    try {
      const res = await commit.mutateAsync({ pack: parsed.value, mode, onIdReuse: reuse });
      toast({ title: t('import.imported'), body: res.regenerated ? t('import.importedRegen') : t('import.importedNoChange') });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const det = err.rawDetails as { errors?: PackIssue[] } | undefined;
        setCommitErrors(det?.errors ?? [{ path: '', message: err.message }]);
      } else {
        toast({ tone: 'error', title: t('import.errImport'), body: errorMessage(err) });
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
        title={t('route.import')}
        subtitle={t('import.subtitle')}
        eyebrow={
          <Link to="/settings" className="inline-flex items-center gap-1 transition-colors hover:text-ink">
            <CaretLeft size={14} className="rtl:-scale-x-100" aria-hidden /> {t('import.back')}
          </Link>
        }
      />

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-ink">{t('import.step1')}</h2>
        <p className="text-sm text-muted">{t('import.step1Body')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" icon={ClipboardText} onClick={() => void copyPrompt()} data-testid="copy-prompt">
            {t('import.copyPrompt')}
          </Button>
          {promptError && (
            <span className="text-sm text-warn" data-testid="prompt-missing">
              {promptError}
            </span>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-ink">{t('import.step2')}</h2>
        <textarea
          className="field num min-h-40 font-mono text-xs"
          dir="ltr"
          placeholder='{"version": 1, "name": "My plan", ...}'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setParseError(null);
            setPreview(null);
          }}
          aria-label={t('import.textAria')}
          aria-invalid={Boolean(parseError)}
          data-testid="pack-input"
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 text-accent-ink underline underline-offset-2">
            <FileArrowUp size={15} aria-hidden />
            {t('import.chooseFile')}
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
        <h2 className="text-base font-semibold tracking-tight text-ink">{t('import.step3')}</h2>
        <Segmented<ImportMode>
          label={t('import.mode')}
          value={mode}
          onChange={(v) => {
            setModeChoice(v);
            setPreview(null);
          }}
          options={[
            { value: 'update', label: t('import.modeUpdate') },
            { value: 'fresh', label: t('import.modeFresh') },
          ]}
        />
        <p className="text-sm text-muted" data-testid="mode-hint">
          {mode === 'update' ? t('import.modeUpdateHint') : t('import.modeFreshHint')}
        </p>
        <div>
          <Button variant="secondary" icon={ArrowRight} rtlFlipIcon onClick={() => void runPreview()} loading={previewing} disabled={text.trim() === ''} data-testid="preview-button">
            {t('import.preview')}
          </Button>
        </div>
      </Card>

      {preview && !preview.ok && (
        <Card className="flex flex-col gap-4 border-danger/30 p-5 sm:p-6" data-testid="preview-errors">
          <h2 className="text-base font-semibold tracking-tight text-ink">{t('import.fixesTitle')}</h2>
          <ServerMessages>
            <IssueList issues={preview.errors} testId="preview-error-list" />
            <WarningList warnings={preview.warnings} />
          </ServerMessages>
          <div>
            <Button variant="secondary" size="sm" icon={ClipboardText} onClick={() => void copyErrors(preview.errors)} data-testid="copy-errors">
              {t('import.copyErrors')}
            </Button>
          </div>
        </Card>
      )}

      {okPreview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="flex flex-col gap-4 p-5 sm:p-6" data-testid="preview-ok">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                {tRich('import.previewTitle', { name: <bdi>{okPreview.name}</bdi> })}
              </h2>
              <p className="text-sm text-muted">
                {okPreview.regenerates ? t('import.regenFrom', { date: okPreview.regenerateFrom }) : t('import.noReplan')}
              </p>
            </div>
            <CountsTable counts={okPreview.counts} />
            {okPreview.archived.length > 0 && (
              <div>
                <div className="label mb-2">{t('import.archived')}</div>
                <ul className="flex flex-col gap-1 text-sm text-muted" data-testid="archived-list">
                  {okPreview.archived.map((a) => (
                    <li key={`${a.kind}-${a.id}`}>
                      <span>{t(a.kind === 'track' ? 'import.kindTrack' : a.kind === 'stream' ? 'import.kindStream' : 'import.kindModule')}</span>{' '}
                      <span className="num text-ink" dir="ltr">
                        {a.id}
                      </span>
                      : <bdi>{a.title}</bdi>
                      {a.hasProgress && (
                        <Chip tone="warn" className="ms-2">
                          {t('import.hasProgress')}
                        </Chip>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {okPreview.settingsChanged.length > 0 && (
              <div>
                <div className="label mb-2">{t('import.settingsChanged')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {okPreview.settingsChanged.map((s) => (
                    <Chip key={s}>
                      <bdi dir="ltr">{s}</bdi>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            <WarningList warnings={okPreview.warnings} />
            {mode === 'fresh' && okPreview.reusedWithProgress.length > 0 && (
              <div className="rounded-[10px] border border-line-strong bg-surface-2/60 p-4" data-testid="reuse-question">
                <p className="text-sm font-medium text-ink">{t('import.reuseQ')}</p>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                  {okPreview.reusedWithProgress.map((r) => (
                    <li key={r.id}>
                      <span className="num text-ink" dir="ltr">
                        {r.id}
                      </span>
                      : <bdi>{r.title}</bdi> ({t('import.reuseCredits', { minutes: formatHours(r.creditedMinutes) })}
                      {r.manualComplete ? t('import.manualSuffix') : ''})
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Segmented<IdReuse>
                    label={t('import.reuseLabel')}
                    value={reuse}
                    onChange={setReuse}
                    options={[
                      { value: 'reset', label: t('import.reuseReset') },
                      { value: 'keep', label: t('import.reuseKeep') },
                    ]}
                  />
                </div>
              </div>
            )}
            <div>
              <Button variant="primary" icon={CheckCircle} onClick={() => void runImport()} loading={commit.isPending} data-testid="commit-button">
                {t('import.commit')}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {commitErrors && (
        <Card className="flex flex-col gap-3 border-danger/30 p-5 sm:p-6" data-testid="commit-errors">
          <h2 className="text-base font-semibold tracking-tight text-ink">{t('import.rejectedTitle')}</h2>
          <ServerMessages>
            <IssueList issues={commitErrors} />
          </ServerMessages>
          <div>
            <Button variant="secondary" size="sm" icon={ClipboardText} onClick={() => void copyErrors(commitErrors)}>
              {t('import.copyErrors')}
            </Button>
          </div>
        </Card>
      )}

      {!hasPlan && !preview && (
        <Card>
          <EmptyState icon={FileArrowUp} title={t('import.emptyTitle')} body={t('import.emptyBody')} />
        </Card>
      )}
    </div>
  );
}
