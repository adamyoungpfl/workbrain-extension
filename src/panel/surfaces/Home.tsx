import { useEffect, useState } from 'react';
import { Banner, BrandMark, Button, FileRow } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { computeNextMove, mostRecentAnsweredAt } from '../../core/freshness/nextMove';
import { daysSince } from '../../core/freshness/clocks';
import { FileActions } from './FileActions';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './Home.css';

export interface HomeProps {
  /** Starts (or resumes — `Flow` always resumes from wherever `wb:answers`
   * actually leaves off, see core/flow/runner.ts's `findPosition`) the
   * Context interview with no deep-link override. */
  onStart: () => void;
  /** Deep-links straight into the given due role's `role_durability`
   * question — App.tsx turns this record index into the real `Position`,
   * since building one needs the actual ported `Step` object, which this
   * component has no reason to import just to hand back up. */
  onAnswerDue: (recordIndex: number) => void;
  onOpenProof: () => void;
}

const EMPTY_ANSWERS: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
const CONTACT_URL = 'https://www.model-citizen.org/contact';

const PERSON_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);

/**
 * docs/RELEASE-1.md R1-12: "Files with freshness, one next-move card, the
 * quiet 'talk to a person' row. Derived entirely — nothing about progress
 * is stored." Every value on this screen (the next-move card, the file's
 * badge/age, whether the "new here?" hint shows at all) is recomputed from
 * `wb:answers` on every render, the same way `Flow` derives its own current
 * question — see core/freshness/nextMove.ts's header comment. There is no
 * "have I shown this before" flag anywhere: a person who clears their own
 * answers sees the empty state again, correctly, because that's genuinely
 * what's true.
 *
 * Also the landing point for a *finished* Context interview as of R1-12 —
 * `Flow`'s own "done" screen now hands off here immediately (see
 * `onDone` on Flow.tsx) rather than showing its own end state, which is
 * what makes Download/Import (`FileActions`) live here instead of there.
 */
export function Home({ onStart, onAnswerDue, onOpenProof }: HomeProps) {
  const [answers, setAnswersState] = useState<Answers | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:answers').then((stored) => {
      if (!cancelled) setAnswersState(stored ?? EMPTY_ANSWERS);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!answers) return null;

  async function persist(next: Answers): Promise<boolean> {
    setAnswersState(next);
    const result = await setLocal('wb:answers', next);
    return result.ok;
  }

  const nextMove = computeNextMove(answers);
  const hasStarted = nextMove.kind !== 'start';
  const lastAnswered = mostRecentAnsweredAt(answers);
  const ageDays = lastAnswered ? daysSince(lastAnswered, new Date()) : null;

  const fileSubtitle = !hasStarted
    ? S.notBuiltYet
    : `${S.fileContextWhat} · ${ageDays === 0 ? S.updatedToday : S.daysOld(ageDays ?? 0)}`;

  const fileBadge =
    nextMove.kind === 'due'
      ? { label: S.badgeDue(nextMove.items.length), tone: 'due' as const }
      : nextMove.kind === 'current'
        ? { label: S.badgeCurrent, tone: 'fresh' as const }
        : undefined;

  return (
    <div className="home">
      {/* V1.1 VB-01 — the welcome state. Still just the `start` branch of the
          same derived next move, not a surface and not a stored "have I
          welcomed them" flag: someone who clears their answers is genuinely
          starting over and correctly gets this screen again. Everything below
          it on Home (the file row, the "bring your file" hint, Import, the
          privacy note) is unchanged and still renders — this replaces the
          bare "You have not started yet." card, not the page. */}
      {nextMove.kind === 'start' && (
        <section className="home-welcome" aria-labelledby="home-welcome-headline">
          <BrandMark />
          {/* Real, selectable text — not an image of a word, and not the mark
              doing double duty as the name. `appName` is the same string the
              extension is called everywhere else. */}
          <p className="home-welcome-wordmark">{S.appName}</p>
          <p className="home-welcome-byline">{S.brandByline}</p>
          <h2 id="home-welcome-headline" className="home-welcome-headline">
            {S.welcomeHeadline}
          </h2>
          <p className="home-welcome-sub">{S.welcomeSub}</p>
          <Button type="button" variant="primary" onClick={onStart}>
            {S.emptyNoFileAction}
          </Button>
          <p className="home-welcome-time">{S.welcomeTime}</p>
        </section>
      )}

      {nextMove.kind === 'due' && (
        <Banner
          title={S.driftHeading(nextMove.items.length)}
          action={
            <Button type="button" variant="primary" onClick={() => onAnswerDue(nextMove.items[0]!.recordIndex)}>
              {S.driftAction(nextMove.items.length)}
            </Button>
          }
        >
          {S.driftBecauseRole(
            nextMove.items[0]!.role,
            S.agoLabel(nextMove.items[0]!.elapsed.value, nextMove.items[0]!.elapsed.unit),
          )}
        </Banner>
      )}

      {nextMove.kind === 'current' && (
        <Banner variant="good" title={S.allCurrentHeading}>
          {S.allCurrentSub}
        </Banner>
      )}

      <p className="home-section-label">{S.homeFilesLabel}</p>
      <div className="home-filelist">
        <FileRow name={S.fileContext} subtitle={fileSubtitle} badge={fileBadge} onClick={onStart} />
      </div>

      {hasStarted && (
        <Button type="button" variant="secondary" onClick={onOpenProof}>
          {S.proofCta}
        </Button>
      )}

      {nextMove.kind === 'start' && <p className="home-hint">{S.emptyNewDevice}</p>}
      <FileActions answers={answers} onImport={persist} />

      <p className="home-section-label">{S.homeHelpLabel}</p>
      <FileRow name={S.homeHelpTitle} subtitle={S.homeHelpSub} icon={PERSON_ICON} iconTone="primary" href={CONTACT_URL} />

      <p className="home-privacy">{S.homePrivacyNote}</p>
    </div>
  );
}
