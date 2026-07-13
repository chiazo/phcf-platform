/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PB_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
