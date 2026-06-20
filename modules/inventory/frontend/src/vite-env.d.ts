/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Optional: where the browser checks Ollama (default tries 127.0.0.1:11434 then localhost:11434) */
  readonly VITE_OLLAMA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
