import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";

export default function Layout() {
  const { isSidebarOpen } = useStore();

  return (
    <div className="min-h-screen bg-[#060810] text-white">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-300",
          isSidebarOpen ? "lg:ml-64" : "lg:ml-16"
        )}
      >
        <TopBar />
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
