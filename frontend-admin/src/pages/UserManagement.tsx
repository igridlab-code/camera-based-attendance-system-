import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Trash2, Edit, UserCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { userApi } from "@/api/client";
import { useStore } from "@/store/useStore";

interface User {
  id: number;
  full_name: string;
  employee_id: string;
  department: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  created_at: string;
  face_samples_count: number;
}

export default function UserManagement() {
  const { addNotification } = useStore();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const pageSize = 20;

  useEffect(() => {
    loadUsers();
    loadDepartments();
  }, [page, search, deptFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await userApi.list({
        search: search || undefined,
        department: deptFilter || undefined,
        page,
        page_size: pageSize,
      });
      setUsers(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      addNotification({ type: "error", message: "Failed to load users" });
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await userApi.departments();
      setDepartments(res.data || []);
    } catch (e) {
      // silent
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await userApi.delete(id);
      addNotification({ type: "success", message: "User deleted successfully" });
      loadUsers();
    } catch (e) {
      addNotification({ type: "error", message: "Failed to delete user" });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-white/40 text-sm mt-0.5">{total} registered users</p>
        </div>
        <Link
          to="/register-user"
          className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-all text-sm flex items-center gap-2"
        >
          <UserCheck className="w-4 h-4" />
          Register User
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, ID, email..."
            className="w-full bg-[#0f1629] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
          className="bg-[#0f1629] border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#0f1629] border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Name</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Employee ID</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Department</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Role</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Face Samples</th>
                <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-right text-xs text-white/40 font-medium uppercase tracking-wider px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 flex items-center justify-center text-cyan-400 text-xs font-medium">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{user.full_name}</p>
                        <p className="text-white/30 text-xs">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70 text-sm">{user.employee_id}</td>
                  <td className="px-4 py-3 text-white/50 text-sm">{user.department || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50 capitalize">{user.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      user.face_samples_count > 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                    }`}>
                      {user.face_samples_count} samples
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`w-2 h-2 rounded-full inline-block ${user.is_active ? "bg-green-400" : "bg-red-400"}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/register-user?edit=${user.id}`} className="p-1.5 rounded hover:bg-white/5 text-white/30 hover:text-white transition-colors">
                        <Edit className="w-4 h-4" />
                      </Link>
                      <button onClick={() => deleteUser(user.id)} className="p-1.5 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/30 text-sm">
                    No users found
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <p className="text-white/30 text-xs">Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 text-white/50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white/50 text-sm px-2 py-1">{page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 text-white/50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
