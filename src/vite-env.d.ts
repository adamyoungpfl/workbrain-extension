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
}
