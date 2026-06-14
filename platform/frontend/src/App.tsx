import { Route, Routes, useLocation } from "react-router-dom";
import { NotesPanel } from "./components/NotesPanel";
import { IpCalculatorPanel } from "./components/IpCalculatorPanel";
import { VlsmPlannerPanel } from "./components/VlsmPlannerPanel";
import { NetLensPanel } from "./components/NetLensPanel";
import { IpamModule } from "./modules/IpamModule";
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
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/inventory/*" element={<InventoryModule />} />
          <Route path="/lsp/*" element={<LspModule />} />
          <Route path="/ipam/*" element={<IpamModule />} />
        </Routes>
      </div>
      <NotesPanel />
      <IpCalculatorPanel />
      <VlsmPlannerPanel />
      <NetLensPanel />
    </div>
  );
}
