import { Suspense, lazy } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { PlatformSwitcher } from "./components/PlatformSwitcher";
import { HomePage } from "./pages/HomePage";

const InventoryModule = lazy(() =>
  import("./modules/InventoryModule").then((m) => ({ default: m.InventoryModule })),
);
const LspModule = lazy(() => import("./modules/LspModule").then((m) => ({ default: m.LspModule })));
const IpamModule = lazy(() => import("./modules/IpamModule").then((m) => ({ default: m.IpamModule })));

const NotesPanel = lazy(() =>
  import("./components/NotesPanel").then((m) => ({ default: m.NotesPanel })),
);
const IpCalculatorPanel = lazy(() =>
  import("./components/IpCalculatorPanel").then((m) => ({ default: m.IpCalculatorPanel })),
);
const VlsmPlannerPanel = lazy(() =>
  import("./components/VlsmPlannerPanel").then((m) => ({ default: m.VlsmPlannerPanel })),
);
const NetLensPanel = lazy(() =>
  import("./components/NetLensPanel").then((m) => ({ default: m.NetLensPanel })),
);

function ModuleFallback() {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center bg-gray-950 text-sm text-slate-400">
      Loading module…
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const onHome = pathname === "/";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-gray-950 text-slate-100">
      {!onHome ? <PlatformSwitcher /> : null}
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/inventory/*"
            element={
              <Suspense fallback={<ModuleFallback />}>
                <InventoryModule />
              </Suspense>
            }
          />
          <Route
            path="/lsp/*"
            element={
              <Suspense fallback={<ModuleFallback />}>
                <LspModule />
              </Suspense>
            }
          />
          <Route
            path="/ipam/*"
            element={
              <Suspense fallback={<ModuleFallback />}>
                <IpamModule />
              </Suspense>
            }
          />
        </Routes>
      </div>
      <Suspense fallback={null}>
        <NotesPanel />
        <IpCalculatorPanel />
        <VlsmPlannerPanel />
        <NetLensPanel />
      </Suspense>
    </div>
  );
}
