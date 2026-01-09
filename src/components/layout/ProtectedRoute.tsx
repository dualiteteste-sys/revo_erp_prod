import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { session, loading, mustChangePassword, pendingEmpresaId } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-dashed rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (mustChangePassword) {
    const qs = pendingEmpresaId ? `?empresa_id=${encodeURIComponent(pendingEmpresaId)}` : "";
    return <Navigate to={`/auth/force-change-password${qs}`} replace />;
  }
  
  return children;
};

export default ProtectedRoute;
