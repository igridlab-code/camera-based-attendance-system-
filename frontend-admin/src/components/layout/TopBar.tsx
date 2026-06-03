import { Bell, Search, Menu, Sun, Moon } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useState } from "react";

export default function TopBar() {
  const { toggleSidebar, theme, setTheme, admin } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="h-16 bg-[#0a0e1a]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {searchOpen && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search..."
              autoFocus
              className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 w-64"
              onBlur={() => setSearchOpen(false)}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Search className="w-5 h-5" />
        </button>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <button className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
            {admin?.full_name?.charAt(0)?.toUpperCase() || "A"}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm text-white font-medium">{admin?.full_name || "Admin"}</p>
            <p className="text-xs text-white/40 capitalize">{admin?.role || "Administrator"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
