/**
 * The two Vite build-time constants this codebase reads, typed by hand
 * rather than by pulling in the whole of `vite/client`.
 *
 * `vite/client` also declares ambient modules for every asset type Vite can
 * import (`*.svg?raw`, `*.css?inline`, web workers, and so on), which would
 * quietly make a handful of imports this repo deliberately does not allow
 * typecheck fine. Naming only what we use keeps the compiler honest.
 *
 * Added for V1.2 VB-09, whose dev-only reset is gated on `DEV` so it
 * dead-code-eliminates out of production builds.
 */
interface ImportMetaEnv {
  /** True under `npm run dev`, replaced with a literal `false` by `vite build`. */
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  /**
   * V2.7 VB-130 — the one glob this repo performs: the splash's bundled
   * shard photographs, eagerly resolved to emitted URLs. Typed for exactly
   * that call shape and nothing wider, for the same reason this file
   * exists at all: `vite/client`'s full ambient surface would quietly make
   * imports we deliberately do not allow typecheck fine.
   */
  glob(
    pattern: string,
    options: { eager: true; query: '?url'; import: 'default' },
  ): Record<string, string>;
}

/**
 * BS-00 — the manifest's version, replaced at build time by
 * `vite.config.ts`'s `define`. Declared here for the same reason the two
 * `import.meta.env` members above are: name exactly what we use, so the
 * compiler stays honest about everything we do not.
 */
declare const __WB_VERSION__: string;
