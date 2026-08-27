import type { Answers } from '../../schema/storage.types';
import { importSkillsPack } from './skillsPack';
import type { ImportReport } from './skillsPack';

/**
 * V2.8 VB-133 — the Skill Redeemer's core: a code becomes a pack.
 *
 * The code a person gets when they buy or commission a custom skill (the
 * same skill also arrives as a file in their email) resolves to a STATIC
 * pack on the site — one file per customer code, CORS-opened on that path,
 * which is why the manifest still asks for nothing beyond storage and
 * sidePanel: the server invites the read, the extension carries no new
 * permission (Adam's decision 1, docs/V2.8-REFINEMENT.md).
 *
 * What travels: the CODE goes out (a token we issued — never the person's
 * content), a `workbrain-pack@1` comes back and lands through VB-124's
 * import path with every guard it already has — dedupe by id, hostile-input
 * caps, data-never-code, refusal voices. Redeeming twice updates in place,
 * exactly as adding the same pack twice always has.
 *
 * Degradation (the product must work on a plane): a fetch that fails —
 * offline, unknown code, a server having a day — is ONE quiet voice that
 * says what to do next and costs nothing. The code stays in the person's
 * email; nothing was consumed; trying again is free. Nothing about the
 * attempt is stored.
 *
 * Core purity: no fetch here except the injected one (CLAUDE.md's rule) —
 * the panel hands in `fetch`, the tests hand in fakes.
 */

export const REDEEM_BASE = 'https://www.model-citizen.org/packs/';

/** Codes are typed by people: trimmed, case-folded up, and only ever the
 * unambiguous charset we issue. Anything else is malformed BEFORE any
 * network is touched. */
export function normalizeRedeemCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/.test(code)) return null;
  return code;
}

export function redeemUrl(raw: string): string | null {
  const code = normalizeRedeemCode(raw);
  return code ? `${REDEEM_BASE}${code}.workbrain-pack.json` : null;
}

/** The injected client: exactly the sliver of fetch this needs. */
export interface RedeemFetch {
  (url: string): Promise<{ ok: boolean; text(): Promise<string> }>;
}

/** The live client — THE one sanctioned fetch site (scripts/audit.mjs's
 * network rule allows the literal only under core/packs, which makes this
 * file the injection seam rather than every caller): tests hand in fakes,
 * the panel hands in nothing. */
const liveFetch: RedeemFetch = (url) => fetch(url);

const VOICE_BAD_CODE = "That code doesn't look right. Check it against the one you were sent.";
const VOICE_NO_ANSWER = "That code didn't answer. Check it — or try again when you're online.";

export async function redeemSkillCode(
  rawCode: string,
  existing: Answers,
  importedAt: string,
  fetchFn: RedeemFetch = liveFetch,
): Promise<ImportReport> {
  const url = redeemUrl(rawCode);
  if (!url) return { ok: false, reason: VOICE_BAD_CODE };

  let text: string;
  try {
    const response = await fetchFn(url);
    if (!response.ok) return { ok: false, reason: VOICE_NO_ANSWER };
    text = await response.text();
  } catch {
    return { ok: false, reason: VOICE_NO_ANSWER };
  }

  return importSkillsPack(text, existing, importedAt);
}
