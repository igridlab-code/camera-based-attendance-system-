import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useStore } from "@/store/useStore";
import Layout from "@/components/layout/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import RegisterUser from "@/pages/RegisterUser";
import UserManagement from "@/pages/UserManagement";
import CameraManagement from "@/pages/CameraManagement";
import AttendanceLogs from "@/pages/AttendanceLogs";
import Analytics from "@/pages/Analytics";
import Training from "@/pages/Training";
import Security from "@/pages/Security";
import SettingsPage from "@/pages/Settings";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="register-user" element={<RegisterUser />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="cameras" element={<CameraManagement />} />
          <Route path="attendance" element={<AttendanceLogs />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="training" element={<Training />} />
          <Route path="security" element={<Security />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
