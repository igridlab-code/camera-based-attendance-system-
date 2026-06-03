import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  UserPlus,
  Users,
  Camera,
  ClipboardList,
  BarChart3,
  Brain,
  Settings,
  ShieldAlert,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/register-user", label: "Register User", icon: UserPlus },
  { path: "/users", label: "User Management", icon: Users },
  { path: "/cameras", label: "Cameras", icon: Camera },
  { path: "/attendance", label: "Attendance Logs", icon: ClipboardList },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/training", label: "AI Training", icon: Brain },
  { path: "/security", label: "Security", icon: ShieldAlert },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const { isSidebarOpen, toggleSidebar, logout } = useStore();

  return (
    <>
      {/* Mobile overlay */}
      {!isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-full z-50 bg-[#0a0e1a] border-r border-white/5",
          "transition-all duration-300 ease-in-out flex flex-col",
          isSidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full lg:translate-x-0 lg:w-16"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/5">
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-4 h-4 text-white" />
            </div>
            <span
              className={cn(
                "font-semibold text-white truncate transition-all duration-300",
                isSidebarOpen ? "opacity-100 w-auto" : "opacity-0 w-0 lg:hidden"
              )}
            >
              Smart Attendance
            </span>
          </Link>
          <button
            onClick={toggleSidebar}
            className="text-white/50 hover:text-white transition-colors lg:hidden"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
                  isActive
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-cyan-400")} />
                <span
                  className={cn(
                    "text-sm font-medium truncate transition-all duration-300",
                    isSidebarOpen ? "opacity-100 w-auto" : "opacity-0 w-0 lg:hidden"
                  )}
                >
                  {item.label}
                </span>
                {!isSidebarOpen && (
                  <div className="absolute left-14 bg-[#1a1f35] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/10">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-2 border-t border-white/5">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all w-full"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span
              className={cn(
                "text-sm font-medium transition-all duration-300",
                isSidebarOpen ? "opacity-100" : "opacity-0 lg:hidden"
              )}
            >
              Logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
