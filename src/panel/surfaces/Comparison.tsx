import { S } from '../strings';
import { STAGES, comparison, latestTask } from '../../core/report/runs';
import type { Stage } from '../../core/report/runs';
import type { ReportState } from '../../schema/storage.types';
import './Comparison.css';

/**
 * SPINE STEP 3 — the same task, answered at each stage
 * (docs/MEASUREMENT-SPINE.md).
 *
 * This is the product's whole argument in one view: here is what your AI did
 * with your own question before any of this, here is what it did with your
 * file, and — once there is a recipe — here is what it did with both.
 *
 * ── IT ARGUES WITH THE PERSON'S OWN WORK, NOT WITH A CLAIM ───────────────
 *
 * Nothing on this screen is our assertion. The task is theirs, both answers
 * came from their AI, the score is what they ticked, and the gaps are what
 * their AI said it could not find. The surface's whole job is to put them next
 * to each other in the right order and then say nothing.
 *
 * ── PARTIAL IS THE NORMAL STATE ──────────────────────────────────────────
 *
 * Most people will have two stages, some one, and — until step 4 lands — none
 * will have three. So a missing stage is drawn as a stated absence rather than
 * a gap: the skill row says what would fill it, and a missing baseline says why
 * it cannot be filled in now. A greyed box with no explanation would read as
 * something broken.
 *
 * ── AND NOTHING IS DERIVED INTO A VERDICT ────────────────────────────────
 *
 * No "23% better", no arrow, no score out of a hundred. `docs/GUARDRAILS.md`
 * bans a composite score and the reason applies here with force: a number we
 * computed over two pieces of prose would be the one thing on this screen we
 * made up. The reader is the judge, which is also the only way the comparison
 * means anything to them.
 */
export interface ComparisonProps {
  report: ReportState | undefined;
  /** Which task to show. Defaults to the most recently run one. */
  task?: string | undefined;
}

const STAGE_LABEL: Record<Stage, string> = {
  baseline: S.compareStageBaseline,
  context: S.compareStageContext,
  skill: S.compareStageSkill,
};

export function Comparison({ report, task }: ComparisonProps) {
  const subject = (task ?? latestTask(report) ?? '').trim();
  const runs = subject ? comparison(report, subject) : {};
  const any = STAGES.some((stage) => runs[stage]);

  if (!subject || !any) {
    return (
      <section className="comparison">
        <h2 className="comparison-title">{S.compareTitle}</h2>
        <p className="comparison-empty">{S.compareEmpty}</p>
      </section>
    );
  }

  return (
    <section className="comparison">
      <h2 className="comparison-title">{S.compareTitle}</h2>
      <p className="comparison-lead">{S.compareLead(subject)}</p>

      <ol className="comparison-stages">
        {STAGES.map((stage) => {
          const run = runs[stage];
          return (
            <li key={stage} className="comparison-stage" data-stage={stage} data-has={run ? 'yes' : 'no'}>
              <h3 className="comparison-stage-name">{STAGE_LABEL[stage]}</h3>

              {run ? (
                <>
                  <p className="comparison-answer">{run.answer}</p>
                  {run.score && (
                    <p className="comparison-score">{S.compareScored(run.score.value, run.score.of)}</p>
                  )}
                  {run.missing && run.missing.length > 0 && (
                    <div className="comparison-missing">
                      <p className="comparison-missing-label">{S.compareMissing}</p>
                      <ul>
                        {run.missing.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                /* A STATED ABSENCE, never a blank. The two have different
                   reasons and both are worth saying: a skill run has not
                   happened yet, and a baseline can no longer be taken. */
                <p className="comparison-absent">
                  {stage === 'baseline' ? S.compareNoBaseline : S.compareNotYet}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
