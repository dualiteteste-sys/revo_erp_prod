import { RouteObject } from "react-router-dom";
import AuthLayout from "../pages/auth/AuthLayout";
import LoginPage from "../pages/auth/LoginPage";
import SignupPage from "../pages/auth/SignUpPage";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage";
import PendingVerificationPage from '../pages/auth/PendingVerificationPage';
import CallbackPage from "@/pages/auth/Callback";
import UpdatePasswordPage from "../pages/auth/UpdatePasswordPage";
import ConfirmedPage from "../pages/auth/Confirmed";
import ForceChangePasswordPage from "../pages/auth/ForceChangePasswordPage";
import AcceptInvite from "../pages/onboarding/AcceptInvite";

export const authRoutes: RouteObject[] = [
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
    // Standalone Auth Routes
    { path: "/auth/callback", element: <CallbackPage /> },
    { path: "/auth/confirmed", element: <ConfirmedPage /> },
    { path: "/auth/update-password", element: <UpdatePasswordPage /> },
    { path: "/auth/force-change-password", element: <ForceChangePasswordPage /> },
    { path: "/onboarding/accept", element: <AcceptInvite /> },
];
