import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { AdminGate } from "./components/AdminGate";
import "./index.css";
import "./styles/floating-chrome.css";

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={ROUTER_FUTURE}>
      <AdminAuthProvider>
        <AdminGate>
          <App />
        </AdminGate>
      </AdminAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
