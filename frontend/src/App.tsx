// ==========================================
// FILE: frontend/src/App.tsx
// PURPOSE: Sets up routing and layout.
// ==========================================
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Events from "./pages/public/Events";
import Login from "./pages/public/Login";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
            <Link to="/" className="text-2xl font-black text-brand-600 tracking-tight">Ticket Take It</Link>
            <div className="space-x-6 flex items-center">
              <Link to="/events" className="text-gray-600 hover:text-gray-900 font-medium">Events</Link>
              <Link to="/login" className="bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700 transition font-medium">Login</Link>
            </div>
          </div>
        </nav>

        <main className="py-8">
          <Routes>
            <Route path="/" element={<Events />} />
            <Route path="/events" element={<Events />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
// ==========================================
// END OF FILE: frontend/src/App.tsx
// LOCATION: frontend/src/App.tsx
// LAST UPDATED: October 19, 2026
// ==========================================