import { Route, Routes, useLocation } from "react-router-dom";
import { NotesPanel } from "./components/NotesPanel";
import { PlatformSwitcher } from "./components/PlatformSwitcher";
import { InventoryModule } from "./modules/InventoryModule";
import { LspModule } from "./modules/LspModule";
import { HomePage } from "./pages/HomePage";

export default function App() {
  const { pathname } = useLocation();
  const onHome = pathname === "/";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-gray-950 text-slate-100">
      {!onHome ? <PlatformSwitcher /> : null}
      <div className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/inventory/*" element={<InventoryModule />} />
          <Route path="/lsp/*" element={<LspModule />} />
        </Routes>
      </div>
      <NotesPanel />
    </div>
  );
}
