/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COINGLASS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
