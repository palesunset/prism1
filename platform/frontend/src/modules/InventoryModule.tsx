import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@inventory/context/ThemeContext";
import { AuthProvider } from "@inventory/context/AuthContext";
import { ToastProvider } from "@inventory/context/ToastContext";
import { LoginGate } from "@inventory/components/common/LoginGate";
import InventoryApp from "@inventory/App";
import "@inventory/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export function InventoryModule() {
  return (
    <div className="inventory-shell h-full min-h-0 w-full overflow-hidden">
      <QueryClientProvider client={queryClient}>
        <div className="flex h-full min-h-0 w-full flex-col">
          <ThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <LoginGate>
                  <InventoryApp />
                </LoginGate>
              </ToastProvider>
            </AuthProvider>
          </ThemeProvider>
        </div>
      </QueryClientProvider>
    </div>
  );
}
