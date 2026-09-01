import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { attendanceApi } from "@/api/client";

interface UnknownDetection {
  id: number;
  snapshot_path: string;
  timestamp: string;
  camera_id: number;
  confidence: number;
  liveness_score: number;
  is_reviewed: boolean;
}

export default function Security() {
  const [detections, setDetections] = useState<UnknownDetection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDetections(); }, []);

  const loadDetections = async () => {
    try {
      const res = await attendanceApi.unknownDetections();
      setDetections(res.data.items || []);
    } catch (e) {}
    finally { setLoading(false); }
  };

  const stats = {
    total: detections.length,
    unreviewed: detections.filter((d) => !d.is_reviewed).length,
    today: detections.filter((d) => new Date(d.timestamp).toDateString() === new Date().toDateString()).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Security Center</h1>
        <p className="text-white/40 text-sm mt-0.5">Unknown face detections and security alerts</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Detections", value: stats.total, icon: ShieldAlert, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "Unreviewed", value: stats.unreviewed, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Today", value: stats.today, icon: Clock, color: "text-red-400", bg: "bg-red-500/10" },
        ].map((s) => (
          <div key={s.label} className="bg-[#0f1629] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`${s.bg} p-1.5 rounded`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
              <span className="text-white/40 text-xs">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-[#0f1629] border border-white/5 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4">Unknown Face Detections</h3>
        {detections.length === 0 && !loading && (
          <div className="text-center py-12">
            <ShieldCheck className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No unknown detections</p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {detections.map((d) => (
            <div key={d.id} className={`rounded-lg overflow-hidden border ${d.is_reviewed ? "border-white/5" : "border-amber-500/30"} bg-black/30`}>
              <div className="aspect-video bg-black/50 flex items-center justify-center overflow-hidden">
                {d.snapshot_path ? (
                  <img src={d.snapshot_path} alt="Unknown Face" className="w-full h-full object-cover" />
                ) : (
                  <ShieldAlert className="w-8 h-8 text-white/10" />
                )}
              </div>
              <div className="p-2">
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">{new Date(d.timestamp).toLocaleTimeString()}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${d.is_reviewed ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"}`}>{d.is_reviewed ? "Reviewed" : "New"}</span>
                </div>
                <p className="text-white/30 text-xs mt-1">Camera {d.camera_id}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
