import { RouteObject, Navigate } from "react-router-dom";
import LandingPage from '../pages/landing/LandingPage';
import OsPortalPage from '../pages/portal/OsPortalPage';

export const publicRoutes: RouteObject[] = [
    { path: "/", element: <LandingPage /> },
    { path: "/portal/os/:token", element: <OsPortalPage /> },
    { path: "*", element: <Navigate to="/" replace /> }
];
