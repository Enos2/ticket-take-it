// ==========================================
// FILE: frontend/src/components/layout/MainLayout.tsx
// PURPOSE: Page frame for the public site: navigation, verification banner, content and footer.
// ==========================================
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import EmailBanner from "../EmailBanner";
import Footer from "../Footer";
import Navbar from "../Navbar";

export default function MainLayout() {
  const { pathname } = useLocation();

  // Every new screen starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <EmailBanner />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/layout/MainLayout.tsx
// ==========================================