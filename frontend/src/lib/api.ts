// ==========================================
// FILE: frontend/src/lib/api.ts
// PURPOSE: Axios instance to make HTTP requests.
// ==========================================
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api/v1",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
// ==========================================
// END OF FILE: frontend/src/lib/api.ts
// LOCATION: frontend/src/lib/api.ts
// LAST UPDATED: October 19, 2026
// ==========================================