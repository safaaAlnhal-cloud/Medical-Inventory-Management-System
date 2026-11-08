import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getHomePath } from '../constants/users';
import { useAuth } from '../context/AuthContext';

// Sends users without access to their own dashboard. An unknown role has no dashboard,
// so getHomePath falls back to /login instead of looping between guarded routes.
const RoleGuard = ({ allowedRoles = [] }) => {
  const { role } = useAuth();
  return allowedRoles.includes(role) ? <Outlet /> : <Navigate to={getHomePath(role)} replace />;
};

export default RoleGuard;
