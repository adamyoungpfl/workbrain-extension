import { describe, it, expect } from 'vitest';
import { normalizeRedeemCode, redeemSkillCode, redeemUrl, REDEEM_BASE } from './redeem';
import { PACK_FORMAT } from './skillsPack';
import type { Answers } from '../../schema/storage.types';

/**
 * V2.8 VB-133 — the redeemer's core, walked with fakes for every weather:
 * malformed codes never touch the network, a dead code and a dead network
 * are one calm voice, and a live pack lands through VB-124's import with
 * all its guards. Nothing here needs a browser, which is the point of the
 * injected client.
 */

const NOW = '2026-08-27T12:00:00.000Z';
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

const PACK = JSON.stringify({
  format: PACK_FORMAT,
  pack: { id: 'pak_custom', name: 'Custom skill', publisher: 'Model Citizen', version: 1, publishedAt: NOW },
  skills: [
    {
      id: 'skl_custom01',
      rev: 1,
      updatedAt: NOW,
      origin: { kind: 'authored' },
      body: { skill_name: 'Board pack prep', skill_steps: '1. Gather. 2. Assemble.' },
    },
  ],
  deleted: [],
});

const respond = (ok: boolean, body = '') => async () => ({ ok, text: async () => body });

describe('normalizeRedeemCode / redeemUrl', () => {
  it('folds case and trims — codes are typed by people', () => {
    expect(normalizeRedeemCode('  wb-1234-abcd  ')).toBe('WB-1234-ABCD');
    expect(redeemUrl('wb-1234-abcd')).toBe(`${REDEEM_BASE}WB-1234-ABCD.workbrain-pack.json`);
  });

  it('refuses anything outside the issued shape, before any network', () => {
    for (const bad of ['', 'ab', 'has space', 'sneaky/../path', 'trailing-', '-leading', 'a'.repeat(40)]) {
      expect(normalizeRedeemCode(bad), bad).toBeNull();
      expect(redeemUrl(bad), bad).toBeNull();
    }
  });
});

describe('redeemSkillCode', () => {
  it('a malformed code is refused without touching the network', async () => {
    let touched = false;
    const result = await redeemSkillCode('nope!', EMPTY, NOW, async () => {
      touched = true;
      return { ok: true, text: async () => PACK };
    });
    expect(touched).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("doesn't look right");
  });

  it('an unknown code (404) is the calm no-answer voice', async () => {
    const result = await redeemSkillCode('WB-0000', EMPTY, NOW, respond(false));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("didn't answer");
  });

  it('a dead network is the same voice — a plane is not an error', async () => {
    const result = await redeemSkillCode('WB-1234', EMPTY, NOW, async () => {
      throw new Error('offline');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("try again when you're online");
  });

  it('a live code lands the skill through the pack path, id and all', async () => {
    const result = await redeemSkillCode('WB-1234', EMPTY, NOW, respond(true, PACK));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imported).toEqual(['Board pack prep']);
      expect(result.answers.repeatables['skills']).toHaveLength(1);
      expect(result.answers.recordIds?.['skills']?.[0]).toBe('skl_custom01');
    }
  });

  it('redeeming the same code twice updates in place — never a duplicate', async () => {
    const first = await redeemSkillCode('WB-1234', EMPTY, NOW, respond(true, PACK));
    expect(first.ok).toBe(true);
    const again = await redeemSkillCode('WB-1234', first.ok ? first.answers : EMPTY, NOW, respond(true, PACK));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.answers.repeatables['skills']).toHaveLength(1);
  });

  it("a body that is not a pack gets VB-124's own refusal voice", async () => {
    const result = await redeemSkillCode('WB-1234', EMPTY, NOW, respond(true, '<html>not a pack</html>'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('fresh copy');
  });
});
