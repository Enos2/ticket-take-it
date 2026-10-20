// ==========================================
// FILE: frontend/src/pages/public/Register.tsx
// PURPOSE: Registration page.
// ==========================================
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post("/auth/register", { email, password, fullName });
      loginStore(res.data.data.user, res.data.data.accessToken);
      navigate("/dashboard"); // Send them to their tickets dashboard
    } catch (err: any) {
      setError(err.response?.data?.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-dark-base">
      <form onSubmit={handleRegister} className="bg-dark-surface p-10 rounded-2xl border border-dark-surface/50 shadow-2xl w-full max-w-md">
        <h2 className="text-3xl font-black mb-2 text-text-main text-center">Create Account</h2>
        <p className="text-text-muted text-center mb-8 text-sm">Join Ticket Take It today.</p>
        
        {error && <p className="bg-brand-red/10 text-brand-red p-3 rounded mb-4 text-center text-sm border border-brand-red/20">{error}</p>}
        
        <div className="mb-5">
          <label className="block text-sm font-medium text-text-muted mb-2">Full Name</label>
          <input
            type="text"
            className="w-full p-3 bg-dark-base border border-dark-surface rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent text-text-main transition outline-none"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-text-muted mb-2">Email</label>
          <input
            type="email"
            className="w-full p-3 bg-dark-base border border-dark-surface rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent text-text-main transition outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="mb-8">
          <label className="block text-sm font-medium text-text-muted mb-2">Password</label>
          <input
            type="password"
            className="w-full p-3 bg-dark-base border border-dark-surface rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent text-text-main transition outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <button type="submit" className="w-full bg-brand-red text-white p-3 rounded-lg hover:bg-brand-red/90 transition font-bold shadow-lg shadow-brand-red/20">
          Create Account
        </button>

        <p className="text-center text-text-muted mt-6 text-sm">
          Already have an account? <Link to="/login" className="text-brand-gold hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Register.tsx
// LOCATION: frontend/src/pages/public/Register.tsx
// LAST UPDATED: October 20, 2026
// ==========================================