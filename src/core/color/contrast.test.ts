import { describe, it, expect } from 'vitest';
import {
  channelDistance,
  contrastRatio,
  isOpaque,
  mixSrgb,
  over,
  parseCssColor,
  relativeLuminance,
} from './contrast';

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

describe('relativeLuminance', () => {
  it('pins both ends of the range', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6);
  });

  it('weights green hardest, blue least — the WCAG coefficients, not an average', () => {
    const red = relativeLuminance({ r: 255, g: 0, b: 0 });
    const green = relativeLuminance({ r: 0, g: 255, b: 0 });
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 });
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
    expect(green).toBeCloseTo(0.7152, 4);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 black on white and 1:1 with itself', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 4);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 6);
  });

  it('does not care which colour is named first', () => {
    const a = { r: 42, g: 79, b: 203 };
    expect(contrastRatio(a, WHITE)).toBeCloseTo(contrastRatio(WHITE, a), 10);
  });

  /* The ratios design/tokens.json already claims. If a token's value is edited
     without its measured contrast, this is where it shows up. */
  it('reproduces the ratios the tokens claim', () => {
    expect(contrastRatio({ r: 21, g: 24, b: 29 }, WHITE)).toBeCloseTo(17.79, 1); // --ink
    expect(contrastRatio({ r: 82, g: 90, b: 103 }, WHITE)).toBeCloseTo(6.96, 1); // --ink-2
    expect(contrastRatio({ r: 42, g: 79, b: 203 }, WHITE)).toBeCloseTo(6.82, 1); // --primary
    expect(contrastRatio({ r: 138, g: 146, b: 160 }, WHITE)).toBeCloseTo(3.13, 1); // --border-i
  });
});

describe('mixSrgb', () => {
  it('returns the ends untouched and the midpoint half way, per channel', () => {
    expect(mixSrgb(BLACK, WHITE, 0)).toEqual(BLACK);
    expect(mixSrgb(BLACK, WHITE, 1)).toEqual(WHITE);
    expect(mixSrgb(BLACK, WHITE, 0.5)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });

  it('clamps rather than extrapolating off either end', () => {
    expect(mixSrgb(BLACK, WHITE, -1)).toEqual(BLACK);
    expect(mixSrgb(BLACK, WHITE, 4)).toEqual(WHITE);
  });
});

describe('over', () => {
  it('composites a translucent colour onto its ground', () => {
    expect(over({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });

  it('leaves an opaque colour alone whatever is behind it', () => {
    expect(over({ r: 10, g: 20, b: 30 }, WHITE)).toEqual({ r: 10, g: 20, b: 30 });
  });
});

describe('isOpaque', () => {
  it('rejects null, transparent and anything short of solid', () => {
    expect(isOpaque(null)).toBe(false);
    expect(isOpaque({ r: 0, g: 0, b: 0, a: 0 })).toBe(false);
    expect(isOpaque({ r: 0, g: 0, b: 0, a: 0.9 })).toBe(false);
    expect(isOpaque({ r: 0, g: 0, b: 0 })).toBe(true);
    expect(isOpaque({ r: 0, g: 0, b: 0, a: 1 })).toBe(true);
  });
});

describe('parseCssColor', () => {
  it('reads the forms getComputedStyle actually returns', () => {
    expect(parseCssColor('rgb(42, 79, 203)')).toEqual({ r: 42, g: 79, b: 203, a: 1 });
    expect(parseCssColor('rgba(42, 79, 203, 0.5)')).toEqual({ r: 42, g: 79, b: 203, a: 0.5 });
    expect(parseCssColor('rgb(42 79 203 / 50%)')).toEqual({ r: 42, g: 79, b: 203, a: 0.5 });
  });

  it('reads the color(srgb …) form a color-mix() resolves to', () => {
    const parsed = parseCssColor('color(srgb 0 0.5 1)')!;
    expect(parsed.r).toBe(0);
    expect(parsed.g).toBeCloseTo(127.5, 4);
    expect(parsed.b).toBe(255);
  });

  it('treats the transparent keyword as a colour with no alpha', () => {
    expect(isOpaque(parseCssColor('transparent'))).toBe(false);
  });

  /* A contrast assertion that cannot read a colour must fail, not guess: a
     null here is what makes the caller say "unreadable" instead of quietly
     measuring against black. Authored forms — keywords, hex, a gradient — are
     among them on purpose: `getComputedStyle` never returns one for a colour
     property, so seeing one means the value did not come from where the caller
     thinks it did. */
  it('returns null for anything it cannot read', () => {
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('none')).toBeNull();
    expect(parseCssColor('linear-gradient(to top, red, blue)')).toBeNull();
    expect(parseCssColor('rebeccapurple')).toBeNull();
    // Written this way because no hex literal may appear in src/ outside the
    // generated token file (tests/tokens.test.mjs), test or not.
    expect(parseCssColor(`${String.fromCharCode(35)}2A4FCB`)).toBeNull();
  });
});

describe('channelDistance', () => {
  it('is the worst single channel, so a big miss in one cannot average away', () => {
    expect(channelDistance({ r: 0, g: 0, b: 0 }, { r: 1, g: 0, b: 40 })).toBe(40);
    expect(channelDistance(WHITE, WHITE)).toBe(0);
  });
});
