// src/login/ProtectedRoute.tsx
import React from "react";

interface ProtectedRouteProps {
  children: React.ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  return children;
};

export default ProtectedRoute;
