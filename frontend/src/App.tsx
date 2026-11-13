// ==========================================
// FILE: frontend/src/App.tsx
// PURPOSE: Routes.
// ==========================================
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AccountLayout from "./components/layout/AccountLayout";
import AdminLayout from "./components/layout/AdminLayout";
import MainLayout from "./components/layout/MainLayout";
import SellerLayout from "./components/layout/SellerLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { PageSpinner } from "./components/ui/Spinner";
import { useAuth } from "./lib/authStore";

// Each page is loaded only when it is first opened.
const Home = lazy(() => import("./pages/public/Home"));
const Events = lazy(() => import("./pages/public/Events"));
const EventDetail = lazy(() => import("./pages/public/EventDetail"));
const Login = lazy(() => import("./pages/public/Login"));
const Register = lazy(() => import("./pages/public/Register"));
const VerifyEmail = lazy(() => import("./pages/public/VerifyEmail"));
const ForgotPassword = lazy(() => import("./pages/public/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/public/ResetPassword"));
const NotFound = lazy(() => import("./pages/public/NotFound"));
const Terms = lazy(() => import("./pages/public/Terms"));
const Privacy = lazy(() => import("./pages/public/Privacy"));
const Refunds = lazy(() => import("./pages/public/Refunds"));
const Help = lazy(() => import("./pages/public/Help"));
const Settings = lazy(() => import("./pages/user/Settings"));
const SavedEvents = lazy(() => import("./pages/user/SavedEvents"));
const Organizer = lazy(() => import("./pages/public/Organizer"));

const Checkout = lazy(() => import("./pages/user/Checkout"));
const CheckoutComplete = lazy(() => import("./pages/user/CheckoutComplete"));
const MyTickets = lazy(() => import("./pages/user/MyTickets"));
const MyOrders = lazy(() => import("./pages/user/MyOrders"));
const OrderDetail = lazy(() => import("./pages/user/OrderDetail"));
const Receipt = lazy(() => import("./pages/user/Receipt"));
const Transfers = lazy(() => import("./pages/user/Transfers"));

const SellerApply = lazy(() => import("./pages/seller/SellerApply"));
const SellerDashboard = lazy(() => import("./pages/seller/SellerDashboard"));
const CreateEvent = lazy(() => import("./pages/seller/CreateEvent"));
const EventManage = lazy(() => import("./pages/seller/EventManage"));
const EventOverview = lazy(() => import("./pages/seller/EventOverview"));
const EventTickets = lazy(() => import("./pages/seller/EventTickets"));
const EventGuests = lazy(() => import("./pages/seller/EventGuests"));
const EventEdit = lazy(() => import("./pages/seller/EventEdit"));
const EventAttendees = lazy(() => import("./pages/seller/EventAttendees"));
const Scan = lazy(() => import("./pages/user/Scan"));
const LiveAttendance = lazy(() => import("./pages/user/LiveAttendance"));
const DoorTeam = lazy(() => import("./pages/seller/DoorTeam"));
const EventDoor = lazy(() => import("./pages/seller/EventDoor"));
const SellerOrders = lazy(() => import("./pages/seller/SellerOrders"));
const SellerEarnings = lazy(() => import("./pages/seller/SellerEarnings"));

const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers"));
const AdminEvents = lazy(() => import("./pages/admin/AdminEvents"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminRefunds = lazy(() => import("./pages/admin/AdminRefunds"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminPayouts = lazy(() => import("./pages/admin/AdminPayouts"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit"));
const AdminSystem = lazy(() => import("./pages/admin/AdminSystem"));

export default function App() {
  const init = useAuth((s) => s.init);
  const status = useAuth((s) => s.status);

  // Restore the saved session once, when the app opens.
  useEffect(() => {
    void init();
  }, [init]);

  if (status === "loading") return <PageSpinner />;

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route element={<MainLayout />}>
          {/* public */}
          <Route index element={<Home />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:slug" element={<EventDetail />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="verify-email" element={<VerifyEmail />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="terms" element={<Terms />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="refunds" element={<Refunds />} />
          <Route path="help" element={<Help />} />
          <Route path="organizers/:id" element={<Organizer />} />

          {/* signed-in people only */}
          <Route element={<ProtectedRoute />}>
            <Route path="checkout/complete" element={<CheckoutComplete />} />
            <Route path="scan" element={<Scan />} />
            <Route path="scan/:eventId/live" element={<LiveAttendance />} />
            <Route path="checkout/:orderId" element={<Checkout />} />

            {/* order confirmation emails link here */}
            <Route path="my-tickets" element={<Navigate to="/account/tickets" replace />} />

            <Route path="account" element={<AccountLayout />}>
              <Route index element={<Navigate to="tickets" replace />} />
              <Route path="tickets" element={<MyTickets />} />
              <Route path="orders" element={<MyOrders />} />
              <Route path="transfers" element={<Transfers />} />
              <Route path="settings" element={<Settings />} />
              <Route path="saved" element={<SavedEvents />} />
              <Route path="orders/:orderId" element={<OrderDetail />} />
              <Route path="orders/:orderId/receipt" element={<Receipt />} />
            </Route>

            {/* selling */}
            <Route path="seller/apply" element={<SellerApply />} />
            <Route path="seller" element={<SellerLayout />}>
              <Route index element={<SellerDashboard />} />
              <Route path="scan" element={<Navigate to="/scan" replace />} />
              <Route path="door" element={<DoorTeam />} />
              <Route path="orders" element={<SellerOrders />} />
              <Route path="earnings" element={<SellerEarnings />} />
              <Route path="events/new" element={<CreateEvent />} />
              <Route path="events/:eventId" element={<EventManage />}>
                <Route index element={<EventOverview />} />
                <Route path="tickets" element={<EventTickets />} />
                <Route path="guests" element={<EventGuests />} />
                <Route path="details" element={<EventEdit />} />
                <Route path="attendees" element={<EventAttendees />} />
                <Route path="door" element={<EventDoor />} />
              </Route>
            </Route>
          </Route>

          {/* administrators only */}
          <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="sellers" element={<AdminSellers />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="refunds" element={<AdminRefunds />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="payouts" element={<AdminPayouts />} />
              <Route path="audit" element={<AdminAudit />} />
              <Route path="system" element={<AdminSystem />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
// ==========================================
// END OF FILE: frontend/src/App.tsx
// ==========================================