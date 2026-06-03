import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

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
};

export const analyticsApi = {
  dashboard: () => client.get("/analytics/dashboard"),
};

export const attendanceApi = {
  todayStats: () => client.get("/attendance/today/stats"),
  records: (params?: any) => client.get("/attendance/records", { params }),
};

