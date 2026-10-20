// ==========================================
// FILE: frontend/src/App.tsx
// PURPOSE: Sets up routing.
// ==========================================
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Navbar from "./components/Navbar";
import Home from "./pages/public/Home";
import Events from "./pages/public/Events";
import EventDetail from "./pages/public/EventDetail";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import UserDashboard from "./pages/user/UserDashboard";
import DashboardLayout from "./components/layout/DashboardLayout";
import SellerDashboard from "./pages/seller/SellerDashboard";
import CreateEvent from "./pages/seller/CreateEvent";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<><Navbar /><Home /></>} />
          <Route path="/events" element={<><Navbar /><Events /></>} />
          <Route path="/events/:id" element={<><Navbar /><EventDetail /></>} />
          <Route path="/login" element={<><Navbar /><Login /></>} />
          <Route path="/register" element={<><Navbar /><Register /></>} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<UserDashboard />} />
            </Route>

            <Route path="/seller" element={<DashboardLayout />}>
              <Route index element={<SellerDashboard />} />
              <Route path="create-event" element={<CreateEvent />} />
            </Route>

            <Route path="/admin" element={<DashboardLayout />}>
              <Route index element={<AdminDashboard />} />
            </Route>

          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
// ==========================================
// END OF FILE: frontend/src/App.tsx
// LOCATION: frontend/src/App.tsx
// LAST UPDATED: October 20, 2026
// ==========================================