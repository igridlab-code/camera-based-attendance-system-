import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Clock, Building } from "lucide-react";
import { attendanceApi } from "@/api/client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#00f2ff", "#fbbf24", "#f43f5e", "#8b5cf6", "#10b981", "#ec4899"];

export default function Analytics() {
  const [trends, setTrends] = useState<any[]>([]);
  const [hourly, setHourly] = useState<any[]>([]);
  const [deptStats, setDeptStats] = useState<any[]>([]);
  const [todayStats, setTodayStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [trendsRes, hourlyRes, deptRes, statsRes] = await Promise.all([
        attendanceApi.trends(30),
        attendanceApi.hourly(),
        attendanceApi.departments(),
        attendanceApi.todayStats(),
      ]);
      setTrends(trendsRes.data || []);
      setHourly(hourlyRes.data || []);
      setDeptStats(deptRes.data || []);
      setTodayStats(statsRes.data || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const pieData = [
    { name: "Present", value: todayStats.today_present || 0 },
    { name: "Late", value: todayStats.today_late || 0 },
    { name: "Absent", value: (todayStats.total_users || 0) - (todayStats.today_present || 0) - (todayStats.today_late || 0) },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 99px;
        }
      `}</style>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white uppercase tracking-wider">Analytics Intelligence</h1>
        <p className="text-cyan-400/50 text-xs font-mono tracking-widest mt-0.5">COMPREHENSIVE TELEMETRY DATA MINING</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Attendance Efficiency", value: `${todayStats.attendance_rate?.toFixed?.(1) || 0}%`, icon: TrendingUp, color: "text-cyan-400", border: "border-cyan-500/20" },
          { label: "Daily Verification", value: todayStats.today_present || 0, icon: BarChart3, color: "text-emerald-400", border: "border-emerald-500/20" },
          { label: "Delayed Check-ins", value: todayStats.today_late || 0, icon: Clock, color: "text-amber-400", border: "border-amber-500/20" },
          { label: "Monitored Sectors", value: deptStats.length, icon: Building, color: "text-violet-400", border: "border-violet-500/20" },
        ].map((s) => (
          <div key={s.label} className={`backdrop-blur-xl bg-slate-950/40 border rounded-xl p-4 flex flex-col justify-between ${s.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-white/40 text-[9px] font-mono uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-2xl font-black font-mono text-white tracking-tight mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Trend Area Chart */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-5">30-Cycle Index Rate Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="colorPresent30" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f2ff" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#00f2ff" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorLate30" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAbsent30" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={10} tickFormatter={(v) => v?.slice(5)} className="font-mono" />
              <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} className="font-mono" />
              <Tooltip contentStyle={{ background: "rgba(10, 15, 30, 0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontFamily: "monospace", fontSize: "11px", backdropFilter: "blur(8px)" }} />
              <Area type="monotone" dataKey="present" stroke="#00f2ff" strokeWidth={2} fillOpacity={1} fill="url(#colorPresent30)" name="Present" />
              <Area type="monotone" dataKey="late" stroke="#fbbf24" strokeWidth={2} fillOpacity={1} fill="url(#colorLate30)" name="Late" />
              <Area type="monotone" dataKey="absent" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorAbsent30)" name="Absent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Distribution */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-5">Hourly Peak Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourly}>
              <defs>
                <linearGradient id="barGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f2ff" stopOpacity={0.8}/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
              <XAxis dataKey="hour" stroke="rgba(255,255,255,0.2)" fontSize={10} className="font-mono" />
              <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} className="font-mono" />
              <Tooltip contentStyle={{ background: "rgba(10, 15, 30, 0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontFamily: "monospace", fontSize: "11px", backdropFilter: "blur(8px)" }} />
              <Bar dataKey="count" fill="url(#barGlow)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sector Performance */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5 flex flex-col h-[280px]">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-5">Sector Performance Index</h3>
          <div className="flex-1 space-y-3.5 overflow-y-auto pr-1 custom-scrollbar">
            {deptStats.map((dept: any) => (
              <div key={dept.department} className="font-mono text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-white/60">{dept.department}</span>
                  <span className="text-white/30 text-[10px]">{dept.present_today}/{dept.total_users} UNIT</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all" style={{ width: `${dept.attendance_rate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Distribution Pie Chart */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5 flex flex-col justify-between">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-4">Verification Distribution</h3>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" stroke="rgba(10,15,30,0.8)" strokeWidth={3}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "rgba(10, 15, 30, 0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#fff", fontFamily: "monospace", fontSize: "11px", backdropFilter: "blur(8px)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 font-mono text-[9px] uppercase tracking-wider mt-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-white/40">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
