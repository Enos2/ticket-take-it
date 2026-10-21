// ==========================================
// FILE: frontend/src/components/Navbar.tsx
// PURPOSE: Navbar with oversized logo that doesn't stretch the height.
// ==========================================
import { Link } from "react-router-dom";
import { useAuthStore } from "../lib/authStore";
import { Search, Heart } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuthStore();

  return (
    <nav className="bg-dark-base border-b border-dark-surface sticky top-0 z-50">
      {/* Fixed height for the navbar so the logo doesn't stretch it */}
      <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center relative">
        
        {/* Logo Wrapper */}
        <Link to="/" className="relative flex items-center">
          {/* 
            By making the image absolute, it no longer forces the navbar to grow. 
            We set it to height: 140px (h-36). 
            We use -translate-y-1/2 and top-1/2 to keep it perfectly centered vertically.
          */}
          <img 
            src="/logo-full.png" 
            alt="Ticket Take It" 
            className="absolute top-1/2 -translate-y-1/2 h-30 w-auto object-contain pointer-events-none" 
          />
          {/* Invisible spacer so the flexbox knows how much horizontal space the logo takes up */}
          <div className="w-48 h-10"></div> 
        </Link>
        
        <div className="hidden md:flex space-x-8 text-sm font-medium text-text-muted z-10">
          <Link to="/" className="hover:text-text-main transition">Discover</Link>
          <Link to="/events" className="hover:text-text-main transition">Events</Link>
          <Link to="/" className="hover:text-text-main transition">For Organizers</Link>
        </div>

        <div className="flex items-center space-x-6 text-sm font-medium z-10">
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
// LAST UPDATED: October 21, 2026
// ==========================================