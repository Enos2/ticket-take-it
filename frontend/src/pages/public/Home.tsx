// ==========================================
// FILE: frontend/src/pages/public/Home.tsx
// PURPOSE: Main landing page with cinematic hero.
// ==========================================
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Events from "./Events";

export default function Home() {
  return (
    <div className="bg-dark-base min-h-screen">
      {/* Hero Section */}
      <section className="relative w-full max-w-7xl mx-auto px-6 pt-20 pb-16 flex flex-col md:flex-row items-center justify-between">
        
        {/* Left: Text */}
        <div className="md:w-1/2 z-10 mb-12 md:mb-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-12 bg-brand-red"></div>
            <span className="text-brand-gold text-xs font-bold tracking-[0.2em] uppercase">Your World, Your Moment</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-text-main leading-[1.1] mb-6">
            Make room for <br />
            something <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-red to-brand-red/70">unforgettable.</span>
          </h1>
          
          <p className="text-text-muted text-lg max-w-lg mb-10 leading-relaxed">
            Find the events worth leaving home for. From once-in-a-lifetime to the discoveries that become your next story.
          </p>
          
          <div className="flex items-center gap-6">
            <Link to="/events" className="bg-brand-red text-white px-8 py-4 rounded-md font-bold hover:bg-brand-red/90 transition flex items-center gap-2 shadow-[0_0_20px_rgba(227,38,54,0.3)]">
              Explore events <ArrowRight size={18} />
            </Link>
            <div className="text-sm text-text-muted">
              <p>Discover with confidence</p>
            </div>
          </div>
        </div>

        {/* Right: Glossy Logo & Hero Image */}
        <div className="md:w-1/2 relative flex justify-center">
          {/* Glow effect behind logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-red/20 blur-[100px] rounded-full"></div>
          
          <div className="relative z-10 bg-dark-surface p-8 rounded-2xl border border-dark-surface/50 shadow-2xl">
            <img src="/logo-icon.png" alt="TTI Logo" className="w-64 h-auto object-contain drop-shadow-[0_0_30px_rgba(227,38,54,0.5)]" />
          </div>

          {/* Decorative elements */}
          <div className="absolute -bottom-6 -right-6 bg-dark-surface border border-brand-gold/30 p-4 rounded-xl shadow-lg">
            <p className="text-brand-gold text-xs font-bold uppercase tracking-wider mb-1">Editor's Pick</p>
            <p className="text-text-main font-bold text-lg">Good nights.<br />Great stories.</p>
          </div>
        </div>
      </section>

      {/* Featured Events Section */}
      <section className="border-t border-dark-surface pt-10">
        <Events />
      </section>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Home.tsx
// LOCATION: frontend/src/pages/public/Home.tsx
// LAST UPDATED: October 20, 2026
// ==========================================