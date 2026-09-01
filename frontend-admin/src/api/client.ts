import axios from "axios";

// When served from FastAPI (same origin) → use relative /api path
// When running standalone dev server (port 3000) → proxy rewrites to backend
const API_BASE = import.meta.env.VITE_API_URL || "/api";
const _proto = window.location.protocol === "https:" ? "wss" : "ws";
const WS_BASE = import.meta.env.VITE_WS_URL || `${_proto}://${window.location.host}`;

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("admin");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default client;
export { WS_BASE };

export const authApi = {
  login: (username: string, password: string) =>
    client.post("/auth/login", { username, password }),
  me: () => client.get("/auth/me"),
};

export const userApi = {
  list: (params?: any) => client.get("/users", { params }),
  get: (id: number) => client.get(`/users/${id}`),
  create: (data: any) => client.post("/users", data),
  update: (id: number, data: any) => client.put(`/users/${id}`, data),
  delete: (id: number) => client.delete(`/users/${id}`),
  captureFace: (userId: number, imageData: string, sampleType?: string) =>
    client.post(`/users/${userId}/capture-face`, {
      user_id: userId,
      image_data: imageData,
      sample_type: sampleType || "front",
    }),
  departments: () => client.get("/users/departments/list"),
};

export const cameraApi = {
  list: () => client.get("/cameras"),
  get: (id: number) => client.get(`/cameras/${id}`),
  create: (data: any) => client.post("/cameras", data),
  update: (id: number, data: any) => client.put(`/cameras/${id}`, data),
  delete: (id: number) => client.delete(`/cameras/${id}`),
  test: (id: number) => client.post(`/cameras/${id}/test`),
  start: (id: number) => client.post(`/cameras/${id}/start`),
  stop: (id: number) => client.post(`/cameras/${id}/stop`),
  status: (id: number) => client.get(`/cameras/${id}/status`),
  allStatus: () => client.get("/cameras/status/all"),
  frame: (id: number) => client.get(`/cameras/${id}/frame`),
};

export const attendanceApi = {
  todayStats: () => client.get("/attendance/today/stats"),
  records: (params?: any) => client.get("/attendance/records", { params }),
  trends: (days?: number) => client.get("/attendance/trends", { params: { days } }),
  hourly: (date?: string) => client.get("/attendance/hourly-distribution", { params: date ? { date } : {} }),
  departments: () => client.get("/attendance/department-stats"),
  unknownDetections: (params?: any) => client.get("/attendance/unknown-detections", { params }),
  reviewDetection: (id: number, notes?: string) =>
    client.post(`/attendance/unknown-detections/${id}/review`, null, { params: { notes: notes || "" } }),
  exportCsv: (params?: any) => client.get("/attendance/export/csv", { params }),
  exportJson: (params?: any) => client.get("/attendance/export/json", { params }),
};

export const analyticsApi = {
  dashboard: () => client.get("/analytics/dashboard"),
  dailySummary: (days?: number) => client.get("/analytics/daily-summary", { params: { days } }),
  peakHours: (days?: number) => client.get("/analytics/peak-hours", { params: { days } }),
  systemHealth: () => client.get("/analytics/system-health"),
  userStats: (userId: number) => client.get(`/analytics/user-stats/${userId}`),
};

export const trainingApi = {
  status: () => client.get("/training/status"),
  start: () => client.post("/training/start"),
  rebuildIndex: () => client.post("/training/rebuild-index"),
  indexInfo: () => client.get("/training/index-info"),
};

export const settingsApi = {
  list: () => client.get("/settings"),
  get: (key: string) => client.get(`/settings/${key}`),
  update: (data: any) => client.put("/settings", data),
};
