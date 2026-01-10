import { RouteObject, Navigate } from "react-router-dom";
import LandingPage from '../pages/landing/LandingPage';
import OsPortalPage from '../pages/portal/OsPortalPage';
import ContratoPortalPage from '../pages/portal/ContratoPortalPage';

export const publicRoutes: RouteObject[] = [
    { path: "/", element: <LandingPage /> },
    { path: "/portal/os/:token", element: <OsPortalPage /> },
    { path: "/portal/contrato/:token", element: <ContratoPortalPage /> },
    { path: "*", element: <Navigate to="/" replace /> }
];
