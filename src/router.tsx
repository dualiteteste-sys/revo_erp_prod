import { createBrowserRouter, Navigate } from "react-router-dom";
import { publicRoutes } from "./routes/public.routes";
import { authRoutes } from "./routes/auth.routes";
import { appRoutes } from "./routes/app.routes";

export const router = createBrowserRouter([
  ...publicRoutes,
  ...authRoutes,
  ...appRoutes,
  // Catch-all global: Redireciona para a landing page
  { path: "*", element: <Navigate to="/" replace /> }
], {
  // @ts-ignore - Future flags are valid in runtime but types might be outdated
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  }
});

export default router;
