// ==========================================
// FILE: frontend/src/components/Navbar.tsx
// PURPOSE: Public top navigation bar with logo image.
// ==========================================
import { Link } from "react-router-dom";
import { useAuthStore } from "../lib/authStore";
import { Search, Heart } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuthStore();

  return (
    <nav className="bg-dark-base border-b border-dark-surface sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img src="/logo-full.png" alt="Ticket Take It" className="h-10 w-auto object-contain" />
        </Link>
        
        <div className="hidden md:flex space-x-8 text-sm font-medium text-text-muted">
          <Link to="/" className="hover:text-text-main transition">Discover</Link>
          <Link to="/events" className="hover:text-text-main transition">Events</Link>
          <Link to="/" className="hover:text-text-main transition">For Organizers</Link>
        </div>

        <div className="flex items-center space-x-6 text-sm font-medium">
          <button className="text-text-muted hover:text-text-main transition"><Search size={20} /></button>
          <button className="text-text-muted hover:text-text-main transition"><Heart size={20} /></button>
          
          {user ? (
            <>
              <Link to="/dashboard" className="text-text-main hover:text-brand-red transition">My Tickets</Link>
              <button onClick={logout} className="text-text-muted hover:text-text-main transition">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-text-main hover:text-brand-red transition">Sign in</Link>
              <Link to="/register" className="bg-brand-red text-white px-5 py-2.5 rounded-md hover:bg-brand-red/90 transition font-bold">Create Account</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/Navbar.tsx
// LOCATION: frontend/src/components/Navbar.tsx
// LAST UPDATED: October 20, 2026
// ==========================================