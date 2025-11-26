import { RouteObject, Navigate } from "react-router-dom";
import LandingPage from '../pages/landing/LandingPage';

export const publicRoutes: RouteObject[] = [
    { path: "/", element: <LandingPage /> },
    { path: "*", element: <Navigate to="/" replace /> }
];
