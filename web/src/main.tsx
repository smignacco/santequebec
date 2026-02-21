import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getCurrentRole, UserRole } from './auth';
import { LoginOrg } from './pages/LoginOrg';
import { OrgDashboard } from './pages/OrgDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import './styles.css';

function ProtectedRoute({ role, children }: { role: UserRole; children: React.ReactElement }) {
  const currentRole = getCurrentRole();
  if (!currentRole) return <Navigate to="/login" replace />;
  if (currentRole !== role) return <Navigate to={currentRole === 'ADMIN' ? '/admin' : '/org'} replace />;
  return children;
}

function LoginRoute() {
  const currentRole = getCurrentRole();
  if (!currentRole) return <LoginOrg />;
  return <Navigate to={currentRole === 'ADMIN' ? '/admin' : '/org'} replace />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/org" element={<ProtectedRoute role="ORG_USER"><OrgDashboard /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
