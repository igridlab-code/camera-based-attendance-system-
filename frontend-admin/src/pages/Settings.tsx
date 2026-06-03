import { useState } from "react";
import { Settings, Bell, Camera, Shield } from "lucide-react";
import { useStore } from "@/store/useStore";

export default function SettingsPage() {
  const { addNotification } = useStore();
  const [activeTab, setActiveTab] = useState("general");

  const [settings, setSettings] = useState({
    attendance_start: "09:00",
    attendance_end: "18:00",
    late_threshold: 15,
    cooldown_minutes: 5,
    recognition_threshold: 0.45,
    liveness_threshold: 0.6,
    enable_email: false,
    enable_telegram: false,
  });

  const tabs = [
    { key: "general", label: "General", icon: Settings },
    { key: "security", label: "Security", icon: Shield },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "camera", label: "Camera", icon: Camera },
  ];

  const saveSettings = () => {
    addNotification({ type: "success", message: "Settings saved (demo mode)" });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-white/40 text-sm mt-0.5">Configure system preferences</p>
      </div>

      <div className="flex gap-1 bg-[#0f1629] border border-white/5 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-cyan-500/15 text-cyan-400"
                : "text-white/40 hover:text-white/60 hover:bg-white/5"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-[#0f1629] border border-white/5 rounded-xl p-6 space-y-4">
        {activeTab === "general" && (
          <>
            <h3 className="text-white font-semibold mb-4">General Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Attendance Start Time</label>
                <input type="time" value={settings.attendance_start} onChange={(e) => setSettings({ ...settings, attendance_start: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Attendance End Time</label>
                <input type="time" value={settings.attendance_end} onChange={(e) => setSettings({ ...settings, attendance_end: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Late Threshold (minutes)</label>
                <input type="number" value={settings.late_threshold} onChange={(e) => setSettings({ ...settings, late_threshold: parseInt(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Cooldown Period (minutes)</label>
                <input type="number" value={settings.cooldown_minutes} onChange={(e) => setSettings({ ...settings, cooldown_minutes: parseInt(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
              </div>
            </div>
          </>
        )}

        {activeTab === "security" && (
          <>
            <h3 className="text-white font-semibold mb-4">Security Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Face Recognition Threshold</label>
                <input type="range" min="0.2" max="0.8" step="0.05" value={settings.recognition_threshold} onChange={(e) => setSettings({ ...settings, recognition_threshold: parseFloat(e.target.value) })} className="w-full accent-cyan-500" />
                <p className="text-cyan-400 text-sm mt-1">{settings.recognition_threshold}</p>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Liveness Detection Threshold</label>
                <input type="range" min="0.2" max="0.9" step="0.05" value={settings.liveness_threshold} onChange={(e) => setSettings({ ...settings, liveness_threshold: parseFloat(e.target.value) })} className="w-full accent-cyan-500" />
                <p className="text-cyan-400 text-sm mt-1">{settings.liveness_threshold}</p>
              </div>
            </div>
          </>
        )}

        {activeTab === "notifications" && (
          <>
            <h3 className="text-white font-semibold mb-4">Notification Settings</h3>
            <div className="space-y-3">
              {[
                { key: "enable_email", label: "Email Alerts", desc: "Send attendance alerts via email" },
                { key: "enable_telegram", label: "Telegram Alerts", desc: "Send alerts via Telegram bot" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3 border-b border-white/5">
                  <div>
                    <p className="text-white text-sm">{item.label}</p>
                    <p className="text-white/30 text-xs">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, [item.key]: !settings[item.key as keyof typeof settings] })}
                    className={`w-11 h-6 rounded-full transition-all relative ${settings[item.key as keyof typeof settings] ? "bg-cyan-500" : "bg-white/10"}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${settings[item.key as keyof typeof settings] ? "left-5.5" : "left-0.5"}`} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "camera" && (
          <>
            <h3 className="text-white font-semibold mb-4">Camera Defaults</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Default Resolution</label>
                <select className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50">
                  <option>640x480</option>
                  <option>1280x720</option>
                  <option>1920x1080</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Default FPS</label>
                <input type="number" defaultValue={30} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
              </div>
            </div>
          </>
        )}

        <div className="pt-4 border-t border-white/5">
          <button onClick={saveSettings} className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-2.5 px-6 rounded-lg transition-all text-sm">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
