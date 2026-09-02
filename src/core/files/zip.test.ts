import { describe, expect, it } from 'vitest';
import { crc32, zipBytes } from './zip';

/** Little-endian readers, so the assertions speak the format's own tongue. */
function u16(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}
function u32(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
}

const AT = new Date('2026-09-02T10:30:24');

describe('crc32', () => {
  it('matches the published value for a known vector', () => {
    // The classic test vector: crc32("123456789") = 0xCBF43926.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('zipBytes — the folder download (V3.0 pass 2)', () => {
  it('writes a one-entry archive every unzipper accepts', () => {
    const zip = zipBytes([{ name: 'Workbrain/Context.md', text: 'hello' }], AT);

    // Local header, field by field.
    expect(u32(zip, 0)).toBe(0x04034b50);
    expect(u16(zip, 8)).toBe(0); // STORE
    expect(u32(zip, 14)).toBe(crc32(new TextEncoder().encode('hello')));
    expect(u32(zip, 18)).toBe(5); // compressed
    expect(u32(zip, 22)).toBe(5); // uncompressed
    const nameLen = u16(zip, 26);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLen))).toBe('Workbrain/Context.md');

    // End record: one entry, and the central directory where it says.
    const eocd = zip.length - 22;
    expect(u32(zip, eocd)).toBe(0x06054b50);
    expect(u16(zip, eocd + 10)).toBe(1);
    const cdStart = u32(zip, eocd + 16);
    expect(u32(zip, cdStart)).toBe(0x02014b50);
    expect(u32(zip, cdStart + 42)).toBe(0); // local header offset
  });

  it('a three-file folder: offsets chain and the count is honest', () => {
    const zip = zipBytes(
      [
        { name: 'Workbrain/Context.md', text: '# Context\n' },
        { name: 'Workbrain/Skills.md', text: '# Skills\n' },
        { name: 'Workbrain/Actions.md', text: '# Actions\n' },
      ],
      AT,
    );
    const eocd = zip.length - 22;
    expect(u16(zip, eocd + 10)).toBe(3);
    let at = u32(zip, eocd + 16);
    const offsets: number[] = [];
    for (let i = 0; i < 3; i++) {
      expect(u32(zip, at)).toBe(0x02014b50);
      offsets.push(u32(zip, at + 42));
      at += 46 + u16(zip, at + 28); // fixed part + name
    }
    // Every recorded offset lands on a real local header.
    for (const o of offsets) expect(u32(zip, o)).toBe(0x04034b50);
    // And they ascend: the entries are laid out in order.
    expect([...offsets]).toEqual([...offsets].sort((a, b) => a - b));
  });

  it('is deterministic: same entries, same date, same bytes', () => {
    const a = zipBytes([{ name: 'Workbrain/Context.md', text: 'x' }], AT);
    const b = zipBytes([{ name: 'Workbrain/Context.md', text: 'x' }], AT);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
