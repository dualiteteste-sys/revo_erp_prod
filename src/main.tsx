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
    // Tracing
    tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
    // Session Replay
    replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
    replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
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
                    <RouterProvider router={router} />
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
