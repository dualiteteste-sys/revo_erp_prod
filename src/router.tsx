import { createBrowserRouter, Navigate } from "react-router-dom";
import { publicRoutes } from "./routes/public.routes";
import { authRoutes } from "./routes/auth.routes";
import { appRoutes } from "./routes/app.routes";

export const router = createBrowserRouter(
  [
    ...publicRoutes,
    ...authRoutes,
    ...appRoutes,
    // Catch-all global: Redireciona para a landing page
    { path: "*", element: <Navigate to="/" replace /> },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);

export default router;
