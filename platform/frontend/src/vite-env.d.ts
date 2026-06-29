declare module "cytoscape-cose-bilkent";

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "@lsp/App" {
  import type { ComponentType } from "react";
  const App: ComponentType;
  export default App;
}

declare module "@inventory/App" {
  import type { ComponentType } from "react";
  const App: ComponentType;
  export default App;
}
