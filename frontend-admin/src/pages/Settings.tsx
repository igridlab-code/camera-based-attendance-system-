import { useState, useEffect } from "react";
import { Settings, Bell, Shield, Clock } from "lucide-react";
import { useStore } from "@/store/useStore";
import { settingsApi } from "@/api/client";

export default function SettingsPage() {
  const { addNotification } = useStore();
  const [activeTab, setActiveTab] = useState("general");
  const [isLoading, setIsLoading] = useState(true);

  const [settings, setSettings] = useState({
    class_start_time: "09:00",
    attendance_interval: 40,
    session_duration_hours: 8,
    late_threshold_minutes: 10,
    recognition_threshold: "0.45",
    liveness_threshold: "0.6",
    enable_email: "false",
    enable_telegram: "false",
    attendance_mode: "full_day",
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await settingsApi.list();
      setSettings(prev => ({ ...prev, ...res.data }));
    } catch (error) {
      addNotification({ type: "error", message: "Failed to load settings" });
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { key: "general", label: "General", icon: Settings },
    { key: "attendance", label: "Attendance Config", icon: Clock },
    { key: "security", label: "Security", icon: Shield },
    { key: "notifications", label: "Notifications", icon: Bell },
  ];

  const saveSettings = async () => {
    try {
      await settingsApi.update(settings);
      addNotification({ type: "success", message: "Settings saved successfully" });
    } catch (error) {
      addNotification({ type: "error", message: "Failed to save settings" });
    }
  };

  if (isLoading) {
    return <div className="text-white">Loading settings...</div>;
  }

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
              {/* Future general settings */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">System Name</label>
                <input type="text" value="Smart Attendance AI" disabled className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white/50 text-sm cursor-not-allowed" />
              </div>
            </div>
          </>
        )}

        {activeTab === "attendance" && (
          <>
            <h3 className="text-white font-semibold mb-4">Attendance Window Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Attendance Mode</label>
                <select value={settings.attendance_mode || "full_day"} onChange={(e) => setSettings({ ...settings, attendance_mode: e.target.value })} className="w-full bg-[#1a2235] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50">
                  <option value="full_day">Full Day Mode (1 per day)</option>
                  <option value="period_wise">Period-wise Mode</option>
                </select>
                <p className="text-xs text-white/40 mt-1">Record attendance once a day or multiple times.</p>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1.5">Class Start Time (HH:MM)</label>
                <input type="time" value={settings.class_start_time} onChange={(e) => setSettings({ ...settings, class_start_time: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                <p className="text-xs text-white/40 mt-1">When the first attendance window begins.</p>
              </div>
              
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Attendance Interval (minutes)</label>
                <select value={settings.attendance_interval} onChange={(e) => setSettings({ ...settings, attendance_interval: parseInt(e.target.value) })} className="w-full bg-[#1a2235] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50">
                  <option value={10}>10 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={40}>40 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={120}>2 hours</option>
                  <option value={480}>8 hours (Full Day)</option>
                </select>
                <p className="text-xs text-white/40 mt-1">Interval between attendance marking.</p>
              </div>
              
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Session Duration (Hours)</label>
                <input type="number" value={settings.session_duration_hours} onChange={(e) => setSettings({ ...settings, session_duration_hours: parseInt(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                <p className="text-xs text-white/40 mt-1">Total hours per day before marking absent.</p>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1.5">Late Threshold (minutes)</label>
                <input type="number" value={settings.late_threshold_minutes} onChange={(e) => setSettings({ ...settings, late_threshold_minutes: parseInt(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                <p className="text-xs text-white/40 mt-1">Minutes after start time to be marked Late.</p>
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
                <input type="range" min="0.2" max="0.8" step="0.05" value={parseFloat(settings.recognition_threshold)} onChange={(e) => setSettings({ ...settings, recognition_threshold: e.target.value })} className="w-full accent-cyan-500" />
                <p className="text-cyan-400 text-sm mt-1">{settings.recognition_threshold}</p>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Liveness Detection Threshold</label>
                <input type="range" min="0.2" max="0.9" step="0.05" value={parseFloat(settings.liveness_threshold)} onChange={(e) => setSettings({ ...settings, liveness_threshold: e.target.value })} className="w-full accent-cyan-500" />
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
                    onClick={() => {
                      const current = settings[item.key as keyof typeof settings] === "true";
                      setSettings({ ...settings, [item.key]: (!current).toString() });
                    }}
                    className={`w-11 h-6 rounded-full transition-all relative ${settings[item.key as keyof typeof settings] === "true" ? "bg-cyan-500" : "bg-white/10"}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${settings[item.key as keyof typeof settings] === "true" ? "left-5.5" : "left-0.5"}`} />
                  </button>
                </div>
              ))}
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
