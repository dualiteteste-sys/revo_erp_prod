import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import router from "./router";
import "./index.css";
import { ToastProvider } from "./contexts/ToastProvider";
import { AuthProvider } from "./contexts/AuthProvider";
import { SupabaseProvider } from "./providers/SupabaseProvider";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
const root = document.getElementById("root")!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </SupabaseProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
