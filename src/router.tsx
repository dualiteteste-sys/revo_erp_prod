import { createBrowserRouter, Navigate } from "react-router-dom";

// Layouts and Guards
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import OnboardingGuard from "./components/auth/OnboardingGuard";
import AuthLayout from "./pages/auth/AuthLayout";

// Public Pages
import LandingPage from './pages/landing/LandingPage';

// Auth & Onboarding Pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignUpPage"; // Fixed import casing (SignUpPage)
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import PendingVerificationPage from './pages/auth/PendingVerificationPage';
import CallbackPage from "@/pages/auth/Callback";
import UpdatePasswordPage from "./pages/auth/UpdatePasswordPage";

// App Pages
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/products/ProductsPage';
import PartnersPage from './pages/partners/PartnersPage';
import UsersPage from './pages/settings/general/UsersPage';

export const router = createBrowserRouter([
  // Public routes
  { path: "/", element: <LandingPage /> },

  // Auth routes
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "pending-verification", element: <PendingVerificationPage /> },
    ],
  },
  { path: "/auth/callback", element: <CallbackPage /> },
  { path: "/auth/update-password", element: <UpdatePasswordPage /> },
  { path: "/onboarding/accept", element: <UpdatePasswordPage /> },

  // Protected app routes
  {
    path: "/app",
    element: (
      <ProtectedRoute>
        <OnboardingGuard>
          <MainLayout />
        </OnboardingGuard>
      </ProtectedRoute>
    ),
    children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        { path: "dashboard", element: <Dashboard /> },
        { path: "products", element: <ProductsPage /> },
        { path: "partners", element: <PartnersPage /> },
        { path: "configuracoes/geral/users", element: <UsersPage /> },
        { path: "*", element: <Navigate to="dashboard" replace /> },
    ]
  },

  // Catch-all
  { path: "*", element: <Navigate to="/" replace /> }
]);

export default router;
