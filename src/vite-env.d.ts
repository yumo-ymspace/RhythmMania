/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOLD_TICK_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
