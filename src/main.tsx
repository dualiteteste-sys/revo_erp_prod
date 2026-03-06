import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import router from "./router";
import "./styles/tokens.css";
import "./index.css";
import { ToastProvider } from "./contexts/ToastProvider";
import { AuthProvider } from "./contexts/AuthProvider";
import { SupabaseProvider } from "./providers/SupabaseProvider";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalErrorBoundary } from "./components/error/GlobalErrorBoundary";
import * as Sentry from "@sentry/react";
import { ConfirmProvider } from "./contexts/ConfirmProvider";
import { setupGlobalErrorHandlers } from "./lib/global-error-handlers";
import { initRouteSnapshot } from "./lib/telemetry/routeSnapshot";
import { OpsOverlayProvider } from "./contexts/OpsOverlayProvider";
import { maybeRedirectAuthCallbackToConfirmed, maybeRedirectToCanonicalSiteUrl } from "./lib/siteUrl";

const redirectedToCanonical = maybeRedirectToCanonicalSiteUrl();
const redirectedAuthCallback = !redirectedToCanonical && maybeRedirectAuthCallbackToConfirmed();

if (!redirectedToCanonical && !redirectedAuthCallback) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Tracing: 10% em prod (economiza quota Sentry), 100% em dev para diagnóstico completo
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Session Replay: 5% de sessões normais em prod, 100% quando há erro
    replaysSessionSampleRate: import.meta.env.PROD ? 0.05 : 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  initRouteSnapshot(router);
  setupGlobalErrorHandlers();

  const queryClient = new QueryClient();
  const root = document.getElementById("root")!;

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SupabaseProvider>
            <ToastProvider>
              <ConfirmProvider>
                <AuthProvider>
                  <OpsOverlayProvider>
                    <RouterProvider router={router} future={{ v7_startTransition: true }} />
                  </OpsOverlayProvider>
                </AuthProvider>
              </ConfirmProvider>
            </ToastProvider>
          </SupabaseProvider>
        </QueryClientProvider>
      </GlobalErrorBoundary>
    </React.StrictMode>
  );
}
