import { describe, it, expect } from 'vitest';
import { CAPS, PACK_FORMAT, exportSkillsPack, importSkillsPack } from './skillsPack';
import type { Answers } from '../../schema/storage.types';

const NOW = '2026-08-26T12:00:00.000Z';
const EARLIER = '2026-08-01T12:00:00.000Z';

function seededRandom(): (bytes: number) => Uint8Array {
  let n = 0;
  return (count) => Uint8Array.from({ length: count }, () => n++ % 256);
}

function skillsAnswers(): Answers {
  return {
    values: {},
    repeatables: {
      skills: [
        {
          skill_name: 'Weekly status',
          skill_trigger: 'Every Friday.',
          skill_steps: '1. Gather. 2. Draft.',
          skill_output: 'One page.',
        },
      ],
    },
    answeredAt: {
      'skills#0#skill_trigger': EARLIER,
      'skills#0#skill_steps': NOW, // the freshest — updatedAt must pick this
    },
    reflectedAt: {},
  };
}

describe('exportSkillsPack', () => {
  it('exports the one format: publisher self, body keys = the interview field ids', () => {
    const { envelope } = exportSkillsPack(skillsAnswers(), NOW, seededRandom());
    expect(envelope.format).toBe(PACK_FORMAT);
    expect(envelope.pack.publisher).toBe('self');
    expect(envelope.skills).toHaveLength(1);
    expect(envelope.skills[0]!.body.skill_name).toBe('Weekly status');
    expect(envelope.skills[0]!.body.skill_steps).toBe('1. Gather. 2. Draft.');
    expect(envelope.deleted).toEqual([]);
  });

  it('export is the moment every skill becomes library-ready: ids minted, returned answers carry them', () => {
    const { envelope, answers } = exportSkillsPack(skillsAnswers(), NOW, seededRandom());
    expect(envelope.skills[0]!.id).toMatch(/^skl_[a-z2-7]{10}$/);
    expect(answers.recordIds?.skills?.[0]).toBe(envelope.skills[0]!.id);
    // A second export re-uses the same identity — minting is once.
    const again = exportSkillsPack(answers, NOW, seededRandom());
    expect(again.envelope.skills[0]!.id).toBe(envelope.skills[0]!.id);
  });

  it('updatedAt is the freshest compound stamp, denormalized into the envelope only', () => {
    const { envelope } = exportSkillsPack(skillsAnswers(), NOW, seededRandom());
    expect(envelope.skills[0]!.updatedAt).toBe(NOW);
    // rev is the documented deferral: 1 until per-commit accounting ships.
    expect(envelope.skills[0]!.rev).toBe(1);
  });
});

describe('importSkillsPack', () => {
  const empty: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

  it('round-trips byte-for-byte, unknown body keys preserved, never dropped', () => {
    const { envelope } = exportSkillsPack(skillsAnswers(), NOW, seededRandom());
    envelope.skills[0]!.body['skill_future_field'] = 'From a newer Workbrain.';
    const report = importSkillsPack(JSON.stringify(envelope), empty, NOW);
    if (!report.ok) throw new Error(report.reason);
    expect(report.imported).toEqual(['Weekly status']);
    const record = report.answers.repeatables.skills![0]!;
    expect(record.skill_steps).toBe('1. Gather. 2. Draft.');
    expect(record['skill_future_field']).toBe('From a newer Workbrain.'); // forward compat
    // Identity travelled: the record wears the envelope's id.
    expect(report.answers.recordIds?.skills?.[0]).toBe(envelope.skills[0]!.id);
    // Stamps landed as the envelope's updatedAt, under the compound keys.
    expect(report.answers.answeredAt['skills#0#skill_steps']).toBe(NOW);
  });

  it('dedupes BY ID — same id updates in place; a new id appends; names never dedupe', () => {
    const { envelope, answers } = exportSkillsPack(skillsAnswers(), NOW, seededRandom());
    // Same id, edited body → replaces record 0.
    envelope.skills[0]!.body.skill_output = 'Two pages now.';
    const updated = importSkillsPack(JSON.stringify(envelope), answers, NOW);
    if (!updated.ok) throw new Error(updated.reason);
    expect(updated.answers.repeatables.skills).toHaveLength(1);
    expect(updated.answers.repeatables.skills![0]!.skill_output).toBe('Two pages now.');
    // Different id, SAME name → appends: two people genuinely have two
    // "Weekly status" skills.
    envelope.skills[0]!.id = 'skl_elsewhere1';
    const appended = importSkillsPack(JSON.stringify(envelope), updated.answers, NOW);
    if (!appended.ok) throw new Error(appended.reason);
    expect(appended.answers.repeatables.skills).toHaveLength(2);
    expect(appended.answers.recordIds?.skills?.[1]).toBe('skl_elsewhere1');
  });

  it('refuses an unknown format WHOLE, in the product voice', () => {
    const report = importSkillsPack(JSON.stringify({ format: 'workbrain-pack@9', skills: [] }), empty, NOW);
    expect(report.ok).toBe(false);
    if (!report.ok) expect(report.reason).toContain('Update the extension');
  });

  it('refuses non-JSON with the "fresh copy" voice, never an error code', () => {
    const report = importSkillsPack('<html>not a pack</html>', empty, NOW);
    expect(report.ok).toBe(false);
    if (!report.ok) {
      expect(report.reason).toContain('fresh copy');
      expect(report.reason).not.toMatch(/error|json|parse/i);
    }
  });

  it('caps are per-skill: the offender is reported by name, the rest import', () => {
    const { envelope } = exportSkillsPack(skillsAnswers(), NOW, seededRandom());
    envelope.skills.push({
      id: 'skl_toolong111',
      rev: 1,
      updatedAt: NOW,
      origin: { kind: 'authored' },
      body: { skill_name: 'Oversized', skill_steps: 'x'.repeat(CAPS.fieldChars + 1) },
    });
    const report = importSkillsPack(JSON.stringify(envelope), empty, NOW);
    if (!report.ok) throw new Error(report.reason);
    expect(report.imported).toEqual(['Weekly status']);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]!.name).toBe('Oversized');
    expect(report.skipped[0]!.reason).toContain('skill_steps');
  });

  it('a pack over the skill cap is refused whole, with the split-it suggestion', () => {
    const skills = Array.from({ length: CAPS.skillsPerPack + 1 }, (_, i) => ({
      id: `skl_bulk${String(i).padStart(6, '0')}`,
      rev: 1,
      updatedAt: NOW,
      origin: { kind: 'authored' as const },
      body: { skill_name: `Skill ${i}` },
    }));
    const report = importSkillsPack(
      JSON.stringify({ format: PACK_FORMAT, pack: { id: 'p', name: 'p', publisher: 'p', version: 1, publishedAt: NOW }, skills, deleted: [] }),
      empty,
      NOW,
    );
    expect(report.ok).toBe(false);
    if (!report.ok) expect(report.reason).toContain('smaller packs');
  });

  it('a nameless skill is skipped by that reason; tombstones are counted, never applied', () => {
    const { envelope, answers } = exportSkillsPack(skillsAnswers(), NOW, seededRandom());
    const existingId = envelope.skills[0]!.id;
    const withDeletes = {
      ...envelope,
      skills: [{ id: 'skl_noname000', rev: 1, updatedAt: NOW, origin: { kind: 'authored' as const }, body: { skill_trigger: 'orphan' } }],
      deleted: [{ id: existingId, at: NOW }],
    };
    const report = importSkillsPack(JSON.stringify(withDeletes), answers, NOW);
    if (!report.ok) throw new Error(report.reason);
    expect(report.skipped[0]!.reason).toBe('it has no name');
    expect(report.deletedIgnored).toBe(1);
    // The tombstoned skill is STILL HERE — applying deletions is sync-land.
    expect(report.answers.repeatables.skills).toHaveLength(1);
  });
});
