import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AdminLayout from './pages/AdminLayout';
import AdminSettings from './pages/AdminSettings';
import AdminUsers from './pages/AdminUsers';
import GatheringLayout from './pages/GatheringLayout';
import SetupTab from './pages/SetupTab';
import SplitTab from './pages/SplitTab';
import PaymentsTab from './pages/PaymentsTab';
import SettleTab from './pages/SettleTab';
import ExportTab from './pages/ExportTab';
import JoinGathering from './pages/JoinGathering';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) {
    // Preserve the originally requested URL so the login page can send the
    // user back to it after authenticating.
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user || user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="/admin/settings" replace />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>
      <Route
        path="/gathering/join/:shareCode"
        element={
          <ProtectedRoute>
            <JoinGathering />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gathering/:id"
        element={
          <ProtectedRoute>
            <GatheringLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SetupTab />} />
        <Route path="split" element={<SplitTab />} />
        <Route path="payments" element={<PaymentsTab />} />
        <Route path="settle" element={<SettleTab />} />
        <Route path="export" element={<ExportTab />} />
      </Route>
    </Routes>
  );
}

export default App;
