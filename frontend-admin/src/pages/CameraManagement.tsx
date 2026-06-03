import { useEffect, useState } from "react";
import { Camera, Plus, Trash2, TestTube } from "lucide-react";
import { cameraApi } from "@/api/client";
import { useStore } from "@/store/useStore";

interface CameraData {
  id: number;
  name: string;
  source_url: string;
  camera_type: string;
  location: string;
  is_active: boolean;
  resolution: string;
  fps: number;
  health_status: string;
  last_online_at: string;
}

export default function CameraManagement() {
  const { addNotification } = useStore();
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", source_url: "0", camera_type: "webcam", location: "", resolution: "640x480", fps: 30 });

  useEffect(() => { loadCameras(); }, []);

  const loadCameras = async () => {
    try {
      const res = await cameraApi.list();
      setCameras(res.data || []);
    } catch (e) {
      addNotification({ type: "error", message: "Failed to load cameras" });
    } finally {
      setLoading(false);
    }
  };

  const addCamera = async () => {
    try {
      await cameraApi.create(form);
      addNotification({ type: "success", message: `Camera "${form.name}" added` });
      setShowAdd(false);
      setForm({ name: "", source_url: "0", camera_type: "webcam", location: "", resolution: "640x480", fps: 30 });
      loadCameras();
    } catch (e: any) {
      addNotification({ type: "error", message: e.response?.data?.detail || "Failed to add camera" });
    }
  };

  const testCamera = async (id: number) => {
    setTesting(id);
    try {
      const res = await cameraApi.test(id);
      addNotification({
        type: res.data.success ? "success" : "error",
        message: res.data.message,
      });
    } catch (e) {
      addNotification({ type: "error", message: "Test failed" });
    }
    setTesting(null);
  };

  const deleteCamera = async (id: number) => {
    if (!confirm("Delete this camera?")) return;
    try {
      await cameraApi.delete(id);
      addNotification({ type: "success", message: "Camera deleted" });
      loadCameras();
    } catch (e) {
      addNotification({ type: "error", message: "Failed to delete" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Camera Management</h1>
          <p className="text-white/40 text-sm mt-0.5">Configure and monitor camera streams</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-all text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Camera
        </button>
      </div>

      {showAdd && (
        <div className="bg-[#0f1629] border border-white/5 rounded-xl p-5 space-y-3">
          <h3 className="text-white font-semibold text-sm">New Camera</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Camera name" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
            <input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="Source (0, 1, rtsp://...)" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
          </div>
          <div className="flex gap-2">
            <button onClick={addCamera} className="bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all">Add Camera</button>
            <button onClick={() => setShowAdd(false)} className="text-white/40 hover:text-white text-sm py-2 px-4 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.map((cam) => (
          <div key={cam.id} className="bg-[#0f1629] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  cam.health_status === "online" ? "bg-green-500/15" : "bg-amber-500/15"
                }`}>
                  <Camera className={`w-5 h-5 ${cam.health_status === "online" ? "text-green-400" : "text-amber-400"}`} />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm">{cam.name}</h4>
                  <p className="text-white/30 text-xs">{cam.source_url}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                cam.is_active ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
              }`}>
                {cam.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div className="bg-white/[0.02] rounded-lg p-2">
                <p className="text-white/30">Type</p>
                <p className="text-white/70 capitalize">{cam.camera_type}</p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-2">
                <p className="text-white/30">Resolution</p>
                <p className="text-white/70">{cam.resolution}</p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-2">
                <p className="text-white/30">FPS</p>
                <p className="text-white/70">{cam.fps}</p>
              </div>
            </div>

            {cam.location && (
              <p className="text-white/30 text-xs mt-2">{cam.location}</p>
            )}

            <div className="flex gap-1 mt-3 pt-3 border-t border-white/5">
              <button onClick={() => testCamera(cam.id)} disabled={testing === cam.id} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs transition-all disabled:opacity-50">
                <TestTube className="w-3.5 h-3.5" />
                {testing === cam.id ? "Testing..." : "Test"}
              </button>
              <button onClick={() => deleteCamera(cam.id)} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        {cameras.length === 0 && !loading && (
          <div className="col-span-2 text-center py-16 bg-[#0f1629] border border-white/5 rounded-xl">
            <Camera className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No cameras configured</p>
            <button onClick={() => setShowAdd(true)} className="text-cyan-400 text-sm mt-2 hover:underline">Add your first camera</button>
          </div>
        )}
      </div>
    </div>
  );
}
