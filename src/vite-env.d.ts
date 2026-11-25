/**
 * Minimal Vite environment typing.
 *
 * Declared explicitly (rather than referencing `vite/client`) because this
 * project's tsconfig does not include Vite's client types, so `import.meta.env`
 * would otherwise be a type error.
 */
interface ImportMetaEnv {
  /** Deriv App ID — public client identifier (safe in source; tokens are not). */
  readonly VITE_DERIV_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}