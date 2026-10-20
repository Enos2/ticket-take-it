// ==========================================
// FILE: frontend/src/pages/public/Login.tsx
// PURPOSE: The login form for all users.
// ==========================================
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post("/auth/login", { email, password });
      loginStore(res.data.data.user, res.data.data.accessToken);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Welcome Back</h2>
        {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            className="w-full p-2 border rounded-md focus:ring-brand-500 focus:border-brand-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            className="w-full p-2 border rounded-md focus:ring-brand-500 focus:border-brand-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="w-full bg-brand-600 text-white p-2 rounded-md hover:bg-brand-700 transition">
          Sign In
        </button>
      </form>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Login.tsx
// LOCATION: frontend/src/pages/public/Login.tsx
// LAST UPDATED: October 19, 2026
// ==========================================