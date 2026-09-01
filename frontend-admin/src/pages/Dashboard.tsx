import { useEffect, useState } from "react";
import {
  Users, Camera, UserCheck, UserX, Clock,
  TrendingUp, Activity, Zap
} from "lucide-react";
import { analyticsApi, attendanceApi } from "@/api/client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

const COLORS = ["#00f2ff", "#fbbf24", "#f43f5e", "#8b5cf6"];

interface Stats {
  total_users: number;
  today_present: number;
  today_late: number;
  today_absent: number;
  attendance_rate: number;
  total_cameras: number;
  online_cameras: number;
  unknown_detections_today: number;
  system_health: string;
  window_info?: {
    window_id: number;
    interval_min: number;
    next_processing: string;
    countdown_seconds: number;
  };
  recent_activity: Array<{
    id: number;
    user_name: string;
    employee_id: string;
    timestamp: string;
    in_time: string | null;
    out_time: string | null;
    window_id: number;
    status: string;
    confidence: number;
  }>;
  department_breakdown: Array<{
    department: string;
    total: number;
    present: number;
    rate: number;
  }>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Auto-countdown state
  const [countdown, setCountdown] = useState<number>(0);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (stats?.window_info?.countdown_seconds) {
      setCountdown(stats.window_info.countdown_seconds);
    }
  }, [stats]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    try {
      const [dashRes, trendsRes] = await Promise.all([
        analyticsApi.dashboard(),
        attendanceApi.trends(14),
      ]);
      setStats(dashRes.data);
      setTrends(trendsRes.data || []);
    } catch (e) {
      console.error("Failed to load dashboard data", e);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Total Registered",
      value: stats?.total_users || 0,
      icon: Users,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]",
    },
    {
      title: "Verified Present",
      value: stats?.today_present || 0,
      icon: UserCheck,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]",
    },
    {
      title: "Late Check-ins",
      value: stats?.today_late || 0,
      icon: Clock,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]",
    },
    {
      title: "System Feeds",
      value: `${stats?.online_cameras || 0}/${stats?.total_cameras || 0}`,
      icon: Camera,
      color: "text-violet-400",
      bgColor: "bg-violet-500/10",
      borderColor: "border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.1)]",
    },
  ];

  const pieData = [
    { name: "Present", value: stats?.today_present || 0 },
    { name: "Late", value: stats?.today_late || 0 },
    { name: "Absent", value: stats?.today_absent || 0 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">Dashboard</h1>
          <p className="text-cyan-400/50 text-xs font-mono tracking-widest mt-0.5">REAL-TIME BIOMETRIC ATTENDANCE HUD</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span className={
              `px-3 py-1 rounded-full text-[10px] font-mono uppercase ${
                stats?.system_health === "healthy"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/25"
              }`
            }>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${stats?.system_health === "healthy" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                {stats?.system_health === "healthy" ? "Core Node Ok" : "Service Degraded"}
              </span>
            </span>
          </div>
          {stats?.window_info && (
            <div className="text-[10px] font-mono text-cyan-400/80 bg-cyan-900/20 px-3 py-1 rounded-full border border-cyan-500/20">
              WINDOW {stats.window_info.window_id} • NEXT IN {formatCountdown(countdown)}
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            className={`backdrop-blur-xl bg-slate-950/40 border rounded-xl p-5 hover:border-white/10 transition-all duration-300 relative overflow-hidden group ${card.borderColor}`}
          >
            {/* Subtle glow hover blob */}
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-colors pointer-events-none" />

            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/40 text-[10px] font-mono uppercase tracking-wider">{card.title}</p>
                <p className="text-3xl font-black text-white mt-1.5 font-mono tracking-tight">{card.value}</p>
              </div>
              <div className={`${card.bgColor} p-2.5 rounded-lg border border-white/5`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attendance Trends with Glowing Neon Gradients */}
        <div className="lg:col-span-2 backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Telemetry Trends (14 Cycles)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f2ff" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#00f2ff" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={10} tickFormatter={(v) => v?.slice(5)} className="font-mono" />
              <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} className="font-mono" />
              <Tooltip
                contentStyle={{
                  background: "rgba(10, 15, 30, 0.95)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  backdropFilter: "blur(8px)"
                }}
              />
              <Area type="monotone" dataKey="present" stroke="#00f2ff" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPresent)" name="Present" />
              <Area type="monotone" dataKey="late" stroke="#fbbf24" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLate)" name="Late" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Today's Distribution */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Telemetry Distribution
          </h3>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" stroke="rgba(10,15,30,0.8)" strokeWidth={3}>
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgba(10, 15, 30, 0.95)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  backdropFilter: "blur(8px)"
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-4 font-mono text-[9px] uppercase tracking-wider">
            {pieData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                <span className="text-white/40">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Department Breakdown + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department Stats */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-5">Sector Performance breakdown</h3>
          <div className="space-y-3.5">
            {stats?.department_breakdown?.map((dept) => (
              <div key={dept.department} className="flex items-center gap-3 font-mono">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white/60 text-xs">{dept.department}</span>
                    <span className="text-white/30 text-[10px]">{dept.present}/{dept.total} UNIT</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${dept.rate}%` }}
                    />
                  </div>
                </div>
                <span className="text-cyan-400 text-xs font-bold w-12 text-right">{dept.rate}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-xl p-5 flex flex-col h-[280px]">
          <h3 className="text-white font-mono text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Live Event Feed
          </h3>
          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1 custom-scrollbar">
            {stats?.recent_activity?.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors border border-white/5 hover:border-white/10"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
                  activity.status === "present"
                    ? "bg-green-500/10 border-green-500/20"
                    : activity.status === "late"
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-rose-500/10 border-rose-500/20"
                }`}>
                  {activity.status === "present" ? (
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  ) : activity.status === "late" ? (
                    <Clock className="w-4 h-4 text-amber-400" />
                  ) : (
                    <UserX className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-xs font-bold truncate">{activity.user_name}</p>
                    <span className="text-[9px] font-mono text-cyan-400 bg-cyan-400/10 px-1.5 rounded">W{activity.window_id}</span>
                  </div>
                  <p className="text-white/30 text-[9px] font-mono mt-0.5 tracking-wider">{activity.employee_id}</p>
                </div>
                <div className="text-right flex-shrink-0 font-mono">
                  <p className="text-white/60 text-[9px]">
                    IN {activity.in_time} 
                    {activity.out_time && activity.out_time !== activity.in_time && ` / OUT ${activity.out_time}`}
                  </p>
                  <p className="text-cyan-400/60 text-[10px] font-bold">{(activity.confidence * 100).toFixed(0)}% CONF</p>
                </div>
              </div>
            ))}
            {(!stats?.recent_activity || stats.recent_activity.length === 0) && (
              <p className="text-white/20 text-xs font-mono text-center py-12 uppercase">Telemetry stream idle</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
