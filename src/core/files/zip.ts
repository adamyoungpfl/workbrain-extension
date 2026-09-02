/**
 * V3.0 pass 2 — a minimal ZIP writer, so "download the full workbrain
 * folder" (Adam, 2026-09-02) can hand over ONE file that every OS opens
 * into a folder, without adding a dependency for an archive of three
 * small markdown files.
 *
 * STORE method only (method 0, no compression): the entries are a few
 * kilobytes of text, and DEFLATE would buy nothing but an implementation
 * to maintain. What this writes is the full, honest subset of the format:
 * local file headers, a central directory, and the end-of-central-
 * directory record, with real CRC-32s — the three structures every
 * unzipper requires and nothing it merely tolerates.
 *
 * Deterministic by construction: the caller passes the timestamp, so the
 * same entries and the same date produce byte-identical archives (and the
 * unit test can pin real bytes).
 *
 * Entry names may carry '/' paths — 'Workbrain/Context.md' — which is
 * what makes the extracted result a FOLDER named Workbrain.
 */
export interface ZipEntry {
  /** Path inside the archive, '/'-separated. UTF-8, no leading slash. */
  name: string;
  /** The file's whole text. Encoded as UTF-8. */
  text: string;
}

/** The standard CRC-32 (polynomial 0xEDB88320), table-driven. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time/date pair, the format's own clock. Seconds round down to
 * evens — that is the format, not a bug. */
function dosClock(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

class ByteSink {
  private chunks: Uint8Array[] = [];
  length = 0;
  u16(v: number): void {
    this.chunks.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
    this.length += 2;
  }
  u32(v: number): void {
    this.chunks.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
    this.length += 4;
  }
  bytes(b: Uint8Array): void {
    this.chunks.push(b);
    this.length += b.length;
  }
  take(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

/** The archive. Flags carry 0x0800 (UTF-8 names) and nothing else. */
export function zipBytes(entries: readonly ZipEntry[], at: Date): Uint8Array {
  const encoder = new TextEncoder();
  const clock = dosClock(at);
  const sink = new ByteSink();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const body = encoder.encode(entry.text);
    const crc = crc32(body);
    central.push({ name, crc, size: body.length, offset: sink.length });
    sink.u32(0x04034b50); // local file header
    sink.u16(20); // version needed
    sink.u16(0x0800); // flags: UTF-8
    sink.u16(0); // method: STORE
    sink.u16(clock.time);
    sink.u16(clock.date);
    sink.u32(crc);
    sink.u32(body.length); // compressed = uncompressed under STORE
    sink.u32(body.length);
    sink.u16(name.length);
    sink.u16(0); // extra
    sink.bytes(name);
    sink.bytes(body);
  }

  const cdStart = sink.length;
  for (const c of central) {
    sink.u32(0x02014b50); // central directory header
    sink.u16(20); // made by
    sink.u16(20); // needed
    sink.u16(0x0800);
    sink.u16(0);
    sink.u16(clock.time);
    sink.u16(clock.date);
    sink.u32(c.crc);
    sink.u32(c.size);
    sink.u32(c.size);
    sink.u16(c.name.length);
    sink.u16(0); // extra
    sink.u16(0); // comment
    sink.u16(0); // disk
    sink.u16(0); // internal attrs
    sink.u32(0); // external attrs
    sink.u32(c.offset);
    sink.bytes(c.name);
  }
  const cdSize = sink.length - cdStart;

  sink.u32(0x06054b50); // end of central directory
  sink.u16(0);
  sink.u16(0);
  sink.u16(central.length);
  sink.u16(central.length);
  sink.u32(cdSize);
  sink.u32(cdStart);
  sink.u16(0); // comment
  return sink.take();
}
