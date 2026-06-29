import { lazy, Suspense } from "react";

const IpamPage = lazy(() =>
  import("../pages/ipam/IpamPage").then((m) => ({ default: m.IpamPage })),
);

export function IpamModule() {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading IPAM…</div>
        }
      >
        <IpamPage />
      </Suspense>
    </div>
  );
}
