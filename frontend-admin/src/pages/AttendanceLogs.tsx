import { useEffect, useState } from "react";
import { Download, Search, ChevronLeft, ChevronRight, Calendar, UserCheck, Clock, UserX, Users, Filter, RefreshCw } from "lucide-react";
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

interface DateSummaryItem {
  date: string;
  present: number;
  late: number;
  absent: number;
  total_users: number;
  attendance_rate: number;
}

interface SummaryData {
  dates: DateSummaryItem[];
  overall: {
    total_users: number;
    present: number;
    late: number;
    absent: number;
    total_days: number;
  };
}

export default function AttendanceLogs() {
  const { addNotification } = useStore();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [showDateSummaryTable, setShowDateSummaryTable] = useState(true);

  const pageSize = 50;

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    loadSummary();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadRecords();
  }, [page, search, statusFilter, dateFrom, dateTo]);

  const loadSummary = async () => {
    try {
      const res = await attendanceApi.summary({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setSummaryData(res.data);
    } catch (e) {
      console.error("Failed to load summary", e);
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await attendanceApi.records({
        search: search || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: pageSize,
      });
      setRecords(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      addNotification({ type: "error", message: "Failed to load attendance logs" });
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: "today" | "yesterday" | "week" | "month" | "all") => {
    setPage(1);
    const now = new Date();
    if (preset === "today") {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split("T")[0];
      setDateFrom(yStr);
      setDateTo(yStr);
    } else if (preset === "week") {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      setDateFrom(w.toISOString().split("T")[0]);
      setDateTo(todayStr);
    } else if (preset === "month") {
      const m = new Date(now);
      m.setDate(m.getDate() - 30);
      setDateFrom(m.toISOString().split("T")[0]);
      setDateTo(todayStr);
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };

  const filterByDate = (dateVal: string) => {
    setDateFrom(dateVal);
    setDateTo(dateVal);
    setPage(1);
  };

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.append("date_from", dateFrom);
    if (dateTo) params.append("date_to", dateTo);
    if (statusFilter) params.append("status", statusFilter);
    window.open(`/api/attendance/export/csv?${params.toString()}`, "_blank");
  };

  const totalPages = Math.ceil(total / pageSize);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "present":
        return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
      case "late":
        return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
      case "absent":
        return "bg-rose-500/15 text-rose-400 border border-rose-500/30";
      case "unknown":
        return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
      default:
        return "bg-white/5 text-white/50 border border-white/10";
    }
  };

  const datesList = summaryData?.dates || [];
  const currentSummaryItem = dateFrom && dateFrom === dateTo
    ? datesList.find((d) => d.date === dateFrom)
    : null;

  const displayPresent = currentSummaryItem ? currentSummaryItem.present : (summaryData?.overall.present || 0);
  const displayLate = currentSummaryItem ? currentSummaryItem.late : (summaryData?.overall.late || 0);
  const displayAbsent = currentSummaryItem ? currentSummaryItem.absent : (summaryData?.overall.absent || 0);
  const displayUsers = summaryData?.overall.total_users || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-cyan-400" />
            Attendance Logs & Date-Wise Summary
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {dateFrom ? (dateFrom === dateTo ? `Showing attendance for ${dateFrom}` : `Date Range: ${dateFrom} to ${dateTo}`) : "Showing all dates"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadSummary(); loadRecords(); }}
            className="p-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg border border-white/10 transition-all text-sm flex items-center gap-1.5"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={exportCsv}
            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-medium py-2 px-4 rounded-lg transition-all text-sm flex items-center gap-2 border border-cyan-500/20"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Date-Wise Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Present Card */}
        <div className="bg-[#0f1629] border border-emerald-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-emerald-400">Present</p>
              <h3 className="text-3xl font-extrabold text-white mt-1">{displayPresent}</h3>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-medium">
              Verified
            </span>
            <span className="text-xs text-white/40">Students present</span>
          </div>
        </div>

        {/* Late Card */}
        <div className="bg-[#0f1629] border border-amber-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-amber-400">Late</p>
              <h3 className="text-3xl font-extrabold text-white mt-1">{displayLate}</h3>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-medium">
              Delayed
            </span>
            <span className="text-xs text-white/40">Arrived after threshold</span>
          </div>
        </div>

        {/* Absent Card */}
        <div className="bg-[#0f1629] border border-rose-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-rose-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-rose-400">Absent</p>
              <h3 className="text-3xl font-extrabold text-white mt-1">{displayAbsent}</h3>
            </div>
            <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
              <UserX className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-medium">
              Unverified
            </span>
            <span className="text-xs text-white/40">Not detected today/date</span>
          </div>
        </div>

        {/* Total Active Card */}
        <div className="bg-[#0f1629] border border-cyan-500/30 rounded-xl p-4 relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-cyan-400">Enrolled Students</p>
              <h3 className="text-3xl font-extrabold text-white mt-1">{displayUsers}</h3>
            </div>
            <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-medium">
              {displayUsers > 0 ? (((displayPresent + displayLate) / displayUsers) * 100).toFixed(1) : 0}% Rate
            </span>
            <span className="text-xs text-white/40">Active roster</span>
          </div>
        </div>
      </div>

      {/* Date Presets & Filter Toolbar */}
      <div className="bg-[#0f1629] border border-white/10 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase text-white/40 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Presets:
            </span>
            <button
              onClick={() => applyPreset("today")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateFrom === todayStr && dateTo === todayStr
                  ? "bg-cyan-500 text-black font-bold"
                  : "bg-white/5 hover:bg-white/10 text-white/70"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => applyPreset("yesterday")}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-xs font-medium transition-all"
            >
              Yesterday
            </button>
            <button
              onClick={() => applyPreset("week")}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-xs font-medium transition-all"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyPreset("month")}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-xs font-medium transition-all"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => applyPreset("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                !dateFrom && !dateTo
                  ? "bg-cyan-500 text-black font-bold"
                  : "bg-white/5 hover:bg-white/10 text-white/70"
              }`}
            >
              All Time
            </button>
          </div>

          <button
            onClick={() => setShowDateSummaryTable(!showDateSummaryTable)}
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300 underline"
          >
            {showDateSummaryTable ? "Hide Date-Wise Breakdown" : "Show Date-Wise Breakdown"}
          </button>
        </div>

        {/* Date Inputs & Search */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, employee ID..."
              className="w-full bg-[#0b101d] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[#0b101d] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">All Status (Present, Late, Absent)</option>
            <option value="present">Present Only</option>
            <option value="late">Late Only</option>
            <option value="absent">Absent Only</option>
          </select>

          <div className="flex items-center gap-2 bg-[#0b101d] border border-white/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-white/40 font-medium">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="bg-transparent text-white text-sm focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 bg-[#0b101d] border border-white/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-white/40 font-medium">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="bg-transparent text-white text-sm focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Date-Wise Breakdown Summary Table */}
      {showDateSummaryTable && datesList.length > 0 && (
        <div className="bg-[#0f1629] border border-cyan-500/20 rounded-xl overflow-hidden space-y-2">
          <div className="px-4 py-3 bg-cyan-500/5 border-b border-cyan-500/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Date-Wise Attendance Breakdown Summary
            </h2>
            <span className="text-xs text-white/40">Click any date to filter logs</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-xs text-white/40 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-emerald-400">Present</th>
                  <th className="px-4 py-2.5 text-amber-400">Late</th>
                  <th className="px-4 py-2.5 text-rose-400">Absent</th>
                  <th className="px-4 py-2.5">Enrolled</th>
                  <th className="px-4 py-2.5">Attendance Rate</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {datesList.map((item) => {
                  const isSelected = dateFrom === item.date && dateTo === item.date;
                  return (
                    <tr
                      key={item.date}
                      className={`hover:bg-white/[0.04] transition-colors ${
                        isSelected ? "bg-cyan-500/10" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-semibold text-white flex items-center gap-2">
                        {item.date}
                        {item.date === todayStr && (
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-normal">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-emerald-400 font-bold">
                        {item.present}
                      </td>
                      <td className="px-4 py-2.5 text-amber-400 font-bold">
                        {item.late}
                      </td>
                      <td className="px-4 py-2.5 text-rose-400 font-bold">
                        {item.absent}
                      </td>
                      <td className="px-4 py-2.5 text-white/70">
                        {item.total_users}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-cyan-500"
                              style={{ width: `${Math.min(100, item.attendance_rate)}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/60 font-medium">
                            {item.attendance_rate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => filterByDate(item.date)}
                          className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                            isSelected
                              ? "bg-cyan-500 text-black font-bold"
                              : "bg-white/5 hover:bg-white/15 text-cyan-400 border border-cyan-500/30"
                          }`}
                        >
                          {isSelected ? "Active Filter" : "Filter Logs"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Attendance Logs Table */}
      <div className="bg-[#0f1629] border border-white/5 rounded-xl overflow-hidden space-y-2">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Detailed Student Logs ({total} records)
          </h2>
          {dateFrom && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-cyan-400 hover:underline"
            >
              Clear Date Filter
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">
                  User
                </th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">
                  Date
                </th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">
                  In / Out Time
                </th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">
                  Confidence
                </th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">
                  Liveness Score
                </th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">
                  Camera
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white text-sm font-medium">
                        {r.user_name || "Unknown"}
                      </p>
                      <p className="text-white/30 text-xs">{r.user_employee_id || "-"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70 text-sm font-mono">{r.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-white/80 text-sm font-mono">
                        In: {r.in_time ? new Date(r.in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : r.time_str || "-"}
                      </span>
                      <span className="text-white/40 text-xs font-mono mt-0.5">
                        Out: {r.out_time ? new Date(r.out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${getStatusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-cyan-400/70 text-sm font-mono">
                    {(r.confidence * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                          style={{ width: `${r.liveness_score * 100}%` }}
                        />
                      </div>
                      <span className="text-white/40 text-xs">
                        {(r.liveness_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-sm">
                    {r.camera_name || "-"}
                  </td>
                </tr>
              ))}

              {records.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/30 text-sm">
                    No attendance records found for selected criteria.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="animate-spin w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <p className="text-white/30 text-xs">
              {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 text-white/50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white/50 text-sm px-2 py-1">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 text-white/50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
