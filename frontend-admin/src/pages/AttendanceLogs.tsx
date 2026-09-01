import { useEffect, useState } from "react";
import { Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { attendanceApi } from "@/api/client";
import { useStore } from "@/store/useStore";

interface AttendanceRecord {
  id: number;
  user_name: string;
  user_employee_id: string;
  timestamp: string;
  date: string;
  time_str: string;
  status: string;
  confidence: number;
  liveness_score: number;
  is_late: boolean;
  camera_name: string;
  in_time?: string;
  out_time?: string;
}

export default function AttendanceLogs() {
  const { addNotification } = useStore();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const pageSize = 50;

  useEffect(() => { loadRecords(); }, [page, search, statusFilter, dateFrom]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await attendanceApi.records({
        search: search || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        page,
        page_size: pageSize,
      });
      setRecords(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      addNotification({ type: "error", message: "Failed to load records" });
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    window.open("/api/attendance/export/csv", "_blank");
  };

  const totalPages = Math.ceil(total / pageSize);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "present": return "bg-green-500/15 text-green-400";
      case "late": return "bg-amber-500/15 text-amber-400";
      case "unknown": return "bg-red-500/15 text-red-400";
      default: return "bg-white/5 text-white/50";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance Logs</h1>
          <p className="text-white/40 text-sm mt-0.5">{total} records</p>
        </div>
        <button onClick={exportCsv} className="bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium py-2 px-4 rounded-lg transition-all text-sm flex items-center gap-2 border border-white/10">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, employee ID..." className="w-full bg-[#0f1629] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="bg-[#0f1629] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50">
          <option value="">All Status</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="bg-[#0f1629] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
      </div>

      {/* Table */}
      <div className="bg-[#0f1629] border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">User</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Date</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">In / Out Time</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Confidence</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Liveness</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Camera</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white text-sm">{r.user_name || "Unknown"}</p>
                      <p className="text-white/30 text-xs">{r.user_employee_id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/60 text-sm">{r.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-white/80 text-sm">In: {r.in_time ? new Date(r.in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : r.time_str || "-"}</span>
                      <span className="text-white/40 text-xs mt-0.5">Out: {r.out_time ? new Date(r.out_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "-"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getStatusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-cyan-400/60 text-sm">{(r.confidence * 100).toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full" style={{ width: `${r.liveness_score * 100}%` }} />
                      </div>
                      <span className="text-white/40 text-xs">{(r.liveness_score * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-sm">{r.camera_name || "-"}</td>
                </tr>
              ))}
              {records.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-white/30 text-sm">No records found</td></tr>
              )}
              {loading && (
                <tr><td colSpan={7} className="px-4 py-12 text-center"><div className="animate-spin w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto" /></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <p className="text-white/30 text-xs">{(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 text-white/50"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-white/50 text-sm px-2 py-1">{page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 text-white/50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
