import { Toaster } from "react-hot-toast";
import LspApp from "@lsp/App";
import "@lsp/index.css";
import "@lsp/styles/odysseus.css";

export function LspModule() {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <LspApp />
      <Toaster position="bottom-right" toastOptions={{ className: "text-sm", duration: 5000 }} />
    </div>
  );
}
