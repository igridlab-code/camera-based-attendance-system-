import axios from "axios";

// Relative paths work from same origin (FastAPI serving this at /live/)
// Dev proxy in vite.config.ts rewrites /api → localhost:8000 when running standalone
const API_BASE = import.meta.env.VITE_API_URL || "/api";

// WebSocket base — derive from current page host so it works on any port
const _proto = window.location.protocol === "https:" ? "wss" : "ws";
const WS_BASE = import.meta.env.VITE_WS_URL || `${_proto}://${window.location.host}`;

const client = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
export { API_BASE, WS_BASE };

export const cameraApi = {
  list: () => client.get("/cameras"),
  get: (id: number) => client.get(`/cameras/${id}`),
};

export const analyticsApi = {
  dashboard: () => client.get("/analytics/dashboard"),
};

export const attendanceApi = {
  todayStats: () => client.get("/attendance/today/stats"),
  records: (params?: any) => client.get("/attendance/records", { params }),
};
