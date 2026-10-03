import { Fragment } from 'react';
import type { BaselineExplanation } from '../../shared/streak.js';
import { useI18n } from '../i18n';
import { baselineItems, type BaselineContext } from '../i18n/engineText';
import { cn } from '../lib/format';

/**
 * The "How this plan is calculated" list: short items built from the engine's
 * baseline numbers (never re-derived). Formulas stay left-to-right and never
 * wrap; plan data (a warm-up title) sits in a bidi isolate. Shared by the
 * Plan why panel and the Settings saved card.
 */
export function BaselineList({ expl, ctx, className }: { expl: BaselineExplanation; ctx?: BaselineContext; className?: string }) {
  const { lang } = useI18n();
  return (
    <ul className={cn('list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-muted marker:text-subtle', className)} data-testid="baseline-text">
      {baselineItems(expl, lang, ctx).map((it, i) => (
        <li key={i}>
          {it.kind === 'formula' ? (
            <>
              {it.label}: <bdi dir="ltr" className="num whitespace-nowrap">{it.formula}</bdi>
            </>
          ) : (
            it.parts.map((p, j) =>
              p.paren ? (
                <span key={j} className="whitespace-nowrap">
                  (<bdi dir="auto">{p.text}</bdi>)
                </span>
              ) : (
                <Fragment key={j}>{p.text}</Fragment>
              ),
            )
          )}
        </li>
      ))}
    </ul>
  );
}
