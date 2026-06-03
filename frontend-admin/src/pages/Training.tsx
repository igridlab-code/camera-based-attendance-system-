import { useEffect, useState } from "react";
import { Play, Loader2, CheckCircle, RefreshCw } from "lucide-react";
import { trainingApi } from "@/api/client";
import { useStore } from "@/store/useStore";

export default function Training() {
  const { addNotification } = useStore();
  const [status, setStatus] = useState<any>(null);
  const [indexInfo, setIndexInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const [sRes, iRes] = await Promise.all([trainingApi.status(), trainingApi.indexInfo()]);
      setStatus(sRes.data);
      setIndexInfo(iRes.data);
    } catch (e) {
      // silent
    }
  };

  const startTraining = async () => {
    setLoading(true);
    try {
      await trainingApi.start();
      addNotification({ type: "success", message: "Training started" });
    } catch (e: any) {
      addNotification({ type: "error", message: e.response?.data?.detail || "Failed to start training" });
    } finally {
      setLoading(false);
    }
  };

  const rebuildIndex = async () => {
    setLoading(true);
    try {
      await trainingApi.rebuildIndex();
      addNotification({ type: "success", message: "Index rebuilt" });
      loadStatus();
    } catch (e) {
      addNotification({ type: "error", message: "Failed to rebuild index" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Model Training</h1>
        <p className="text-white/40 text-sm mt-0.5">Manage face recognition index and model</p>
      </div>

      {/* Status Card */}
      <div className="bg-[#0f1629] border border-white/5 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            status?.is_training ? "bg-amber-500/15" : "bg-green-500/15"
          }`}>
            {status?.is_training ? (
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-400" />
            )}
          </div>
          <div>
            <h3 className="text-white font-semibold">
              {status?.is_training ? "Training in Progress" : "System Ready"}
            </h3>
            <p className="text-white/40 text-sm">{status?.current_step || "Idle"}</p>
          </div>
        </div>

        {status?.is_training && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">Progress</span>
              <span className="text-cyan-400">{status.progress?.toFixed?.(1) || 0}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${status.progress || 0}%` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/[0.02] rounded-lg p-3 text-center">
            <p className="text-white/30 text-xs">Embeddings</p>
            <p className="text-white text-lg font-semibold">{indexInfo?.total_embeddings || 0}</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-3 text-center">
            <p className="text-white/30 text-xs">Unique Users</p>
            <p className="text-white text-lg font-semibold">{indexInfo?.unique_users || 0}</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-3 text-center">
            <p className="text-white/30 text-xs">Accuracy</p>
            <p className="text-white text-lg font-semibold">{status?.last_accuracy ? `${(status.last_accuracy * 100).toFixed(1)}%` : "N/A"}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-[#0f1629] border border-white/5 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={startTraining}
            disabled={status?.is_training || loading}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg transition-all flex items-center gap-2"
          >
            {status?.is_training ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {status?.is_training ? "Training..." : "Start Training"}
          </button>
          <button
            onClick={rebuildIndex}
            disabled={status?.is_training || loading}
            className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white/70 hover:text-white font-medium py-2.5 px-6 rounded-lg transition-all flex items-center gap-2 border border-white/10"
          >
            <RefreshCw className="w-4 h-4" />
            Rebuild Index
          </button>
        </div>
      </div>

      {/* Users in Index */}
      {indexInfo?.users_with_embeddings && indexInfo.users_with_embeddings.length > 0 && (
        <div className="bg-[#0f1629] border border-white/5 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Users in Recognition Index</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {indexInfo.users_with_embeddings.map((u: any) => (
              <div key={u.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/15 flex items-center justify-center text-cyan-400 text-xs font-medium">
                    {u.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white text-sm">{u.name}</p>
                    <p className="text-white/30 text-xs">{u.employee_id}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
