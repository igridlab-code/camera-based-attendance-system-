import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

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
};

export const attendanceApi = {
  todayStats: () => client.get("/attendance/today/stats"),
  records: (params?: any) => client.get("/attendance/records", { params }),
  trends: (days?: number) => client.get("/attendance/trends", { params: { days } }),
  hourly: () => client.get("/attendance/hourly-distribution"),
  departments: () => client.get("/attendance/department-stats"),
  unknownDetections: () => client.get("/attendance/unknown-detections"),
  exportCsv: () => client.get("/attendance/export/csv"),
};

export const analyticsApi = {
  dashboard: () => client.get("/analytics/dashboard"),
  dailySummary: (days?: number) => client.get("/analytics/daily-summary", { params: { days } }),
  peakHours: () => client.get("/analytics/peak-hours"),
  systemHealth: () => client.get("/analytics/system-health"),
};

export const trainingApi = {
  status: () => client.get("/training/status"),
  start: () => client.post("/training/start"),
  rebuildIndex: () => client.post("/training/rebuild-index"),
  indexInfo: () => client.get("/training/index-info"),
};
