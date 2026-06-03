import { create } from "zustand";

interface AdminUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
}

interface AppState {
  token: string | null;
  admin: AdminUser | null;
  isAuthenticated: boolean;
  isSidebarOpen: boolean;
  theme: "dark" | "light";
  notifications: Array<{
    id: string;
    type: "success" | "error" | "warning" | "info";
    message: string;
  }>;
  
  setToken: (token: string | null) => void;
  setAdmin: (admin: AdminUser | null) => void;
  logout: () => void;
  toggleSidebar: () => void;
  setTheme: (theme: "dark" | "light") => void;
  addNotification: (n: { type: "success" | "error" | "warning" | "info"; message: string }) => void;
  removeNotification: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  token: localStorage.getItem("token"),
  admin: JSON.parse(localStorage.getItem("admin") || "null"),
  isAuthenticated: !!localStorage.getItem("token"),
  isSidebarOpen: true,
  theme: (localStorage.getItem("theme") as "dark" | "light") || "dark",
  notifications: [],

  setToken: (token) => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
    set({ token, isAuthenticated: !!token });
  },

  setAdmin: (admin) => {
    if (admin) localStorage.setItem("admin", JSON.stringify(admin));
    else localStorage.removeItem("admin");
    set({ admin });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("admin");
    set({ token: null, admin: null, isAuthenticated: false });
  },

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },

  addNotification: (n) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { id: Date.now().toString(), ...n },
      ],
    })),

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
}));
