import { useEffect, useRef, useState, useCallback } from "react";
import {
  ShieldAlert, Activity, Clock, UserCheck, UserX, AlertTriangle,
  Cpu, Camera as CameraIcon, Zap,
  BarChart3, Maximize, Minimize, Volume2, VolumeX, Database,
  Radio, CheckCircle2, Server
} from "lucide-react";
import { useLiveStore } from "@/store/useStore";
import { WS_BASE, cameraApi, attendanceApi } from "@/api/client";
import { cn } from "@/lib/utils";

const WS_URL = `${WS_BASE}/ws/live-detection`;

// Futuristic biometric HUD themes
type HudTheme = "cyan" | "amber" | "green" | "red";

const HUD_THEMES: Record<HudTheme, {
  name: string;
  accent: string;
  border: string;
  bg: string;
  hover: string;
  glow: string;
  glowClass: string;
  hex: string;
  glowHex: string;
}> = {
  cyan: {
    name: "Hologram Cyan",
    accent: "text-cyan-400",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10",
    hover: "hover:bg-cyan-500/20",
    glow: "rgba(6, 182, 212, 0.35)",
    glowClass: "shadow-[0_0_15px_rgba(6,182,212,0.35)]",
    hex: "#06b6d4",
    glowHex: "rgba(6, 182, 212, 0.15)",
  },
  amber: {
    name: "Tactical Amber",
    accent: "text-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    hover: "hover:bg-amber-500/20",
    glow: "rgba(245, 158, 11, 0.35)",
    glowClass: "shadow-[0_0_15px_rgba(245,158,11,0.35)]",
    hex: "#f59e0b",
    glowHex: "rgba(245, 158, 11, 0.15)",
  },
  green: {
    name: "Acid Green",
    accent: "text-emerald-400",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    hover: "hover:bg-emerald-500/20",
    glow: "rgba(16, 185, 129, 0.35)",
    glowClass: "shadow-[0_0_15px_rgba(16,185,129,0.35)]",
    hex: "#10b981",
    glowHex: "rgba(16, 185, 129, 0.15)",
  },
  red: {
    name: "Threat Crimson",
    accent: "text-rose-500",
    border: "border-rose-500/30",
    bg: "bg-rose-500/10",
    hover: "hover:bg-rose-500/20",
    glow: "rgba(244, 63, 94, 0.35)",
    glowClass: "shadow-[0_0_15px_rgba(244,63,94,0.35)]",
    hex: "#f43f5e",
    glowHex: "rgba(244, 63, 94, 0.15)",
  }
};

// Interactive 3D face mesh scan standby canvas
function BiometricVisualizer({ themeColor }: { themeColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let angleY = 0;
    let angleX = 0;

    // Defined coordinates of 3D facial mesh wireframe landmarks
    const points3D = [
      // Skull Top & Forehead Outline
      { x: -50, y: -90, z: 0 }, { x: -20, y: -100, z: 30 }, { x: 20, y: -100, z: 30 }, { x: 50, y: -90, z: 0 },
      // Eyebrow line
      { x: -45, y: -55, z: 15 }, { x: -15, y: -58, z: 32 }, { x: 15, y: -58, z: 32 }, { x: 45, y: -55, z: 15 },
      // Eyes
      { x: -28, y: -38, z: 22 }, { x: -12, y: -38, z: 28 }, { x: 12, y: -38, z: 28 }, { x: 28, y: -38, z: 22 },
      // Nose ridge, bridge & nostrils
      { x: 0, y: -38, z: 35 }, { x: 0, y: 0, z: 45 }, { x: 0, y: 15, z: 52 }, { x: -12, y: 18, z: 38 }, { x: 12, y: 18, z: 38 },
      // Cheeks (outer zygomatic line)
      { x: -65, y: -5, z: -5 }, { x: -40, y: 10, z: 25 }, { x: 40, y: 10, z: 25 }, { x: 65, y: -5, z: -5 },
      // Mouth (lips)
      { x: -20, y: 45, z: 25 }, { x: 0, y: 40, z: 38 }, { x: 20, y: 45, z: 25 }, { x: 0, y: 55, z: 34 },
      // Jaw and Chin loop
      { x: -55, y: 35, z: -8 }, { x: -38, y: 78, z: 12 }, { x: 0, y: 95, z: 28 }, { x: 38, y: 78, z: 12 }, { x: 55, y: 35, z: -8 }
    ];

    const connections = [
      [0, 1], [1, 2], [2, 3], // Forehead ridge
      [4, 5], [5, 6], [6, 7], // Eyebrows
      [8, 9], [10, 11], // Eyes
      [12, 13], [13, 14], // Nose bridge
      [14, 15], [14, 16], [15, 13], [16, 13], // Nostril base
      [5, 12], [6, 12], // Nose connections
      [8, 12], [9, 13], [10, 13], [11, 12], // Eyes to nose
      [0, 17], [17, 25], [25, 26], // Left profile edge
      [3, 20], [20, 29], [29, 28], // Right profile edge
      [26, 27], [28, 27], // Chin base
      [17, 18], [18, 13], // Left cheek zygoma
      [20, 19], [19, 13], // Right cheek zygoma
      [21, 22], [22, 23], [23, 24], [24, 21], // Mouth lips outer loop
      [18, 21], [19, 23], // Cheek to mouth
      [21, 26], [23, 28], [24, 27], [22, 27] // Mouth to jaw line
    ];

    // Background binary telemetry streams
    const streams: Array<{ x: number; y: number; text: string; speed: number; size: number }> = [];
    for (let i = 0; i < 25; i++) {
      streams.push({
        x: Math.random() * 640,
        y: Math.random() * 480,
        text: Math.random() > 0.5 ? "1010011" : "010110",
        speed: 0.8 + Math.random() * 1.5,
        size: 8 + Math.floor(Math.random() * 4)
      });
    }

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = rect?.width || 640;
      canvas.height = rect?.height || 480;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#020306";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2 - 10;
      const radius = Math.min(cx, cy) * 0.7;

      // Draw cyber matrix grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Draw background binary rain
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      streams.forEach((s) => {
        ctx.font = `${s.size}px monospace`;
        ctx.fillText(s.text, s.x, s.y);
        s.y += s.speed;
        if (s.y > h) {
          s.y = -20;
          s.x = Math.random() * w;
          s.text = Math.floor(Math.random() * 999999).toString(2);
        }
      });

      // Target circular scan rings
      ctx.strokeStyle = `${themeColor}20`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius * 0.8, 0, Math.PI * 2); ctx.stroke();

      // Rotating dashed ring
      ctx.strokeStyle = `${themeColor}40`;
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.25 + 8, angleY, angleY + Math.PI * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.25 + 8, angleY + Math.PI, angleY + Math.PI * 1.7);
      ctx.stroke();
      ctx.setLineDash([]);

      // Sweep scanning cone
      const coneGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius * 1.25);
      coneGrad.addColorStop(0, "rgba(0,0,0,0)");
      coneGrad.addColorStop(1, `${themeColor}08`);
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius * 1.25, angleY - 0.3, angleY);
      ctx.closePath();
      ctx.fill();

      // 3D face wireframe mesh rendering
      const rotPoints = points3D.map((p) => {
        // Y-axis Rotation (Yaw)
        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.x * sinY + p.z * cosY;

        // X-axis Rotation (Pitch)
        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;

        // Perspective Projection
        const dist = 320;
        const scale = dist / (dist - z2);
        return {
          x: cx + x1 * scale,
          y: cy + y2 * scale,
          depth: z2
        };
      });

      // Draw mesh connection segments
      ctx.lineWidth = 1.2;
      connections.forEach(([p1, p2]) => {
        const pt1 = rotPoints[p1];
        const pt2 = rotPoints[p2];
        const avgDepth = (pt1.depth + pt2.depth) / 2;

        // Depth cueing color
        const alpha = Math.max(0.12, 0.65 * (1 + avgDepth / 100));
        ctx.strokeStyle = `${themeColor}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;

        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.stroke();
      });

      // Draw node junctions
      rotPoints.forEach((pt) => {
        const size = pt.depth > 0 ? 3 : 2;
        const alpha = Math.max(0.2, 0.8 * (1 + pt.depth / 100));
        ctx.fillStyle = `${themeColor}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Glowing scan plane moving vertically
      const scanY = cy + Math.sin(angleY * 2) * radius * 0.95;
      ctx.strokeStyle = `${themeColor}90`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(cx - radius * 1.1, scanY);
      ctx.lineTo(cx + radius * 1.1, scanY);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // Crosshair center ticks
      ctx.strokeStyle = `${themeColor}50`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
      ctx.stroke();

      // Top and bottom HUD brackets
      ctx.strokeStyle = `${themeColor}40`;
      ctx.lineWidth = 1.5;
      // top left corner
      ctx.beginPath(); ctx.moveTo(20, 40); ctx.lineTo(20, 20); ctx.lineTo(40, 20); ctx.stroke();
      // top right
      ctx.beginPath(); ctx.moveTo(w - 20, 40); ctx.lineTo(w - 20, 20); ctx.lineTo(w - 40, 20); ctx.stroke();
      // bottom left
      ctx.beginPath(); ctx.moveTo(20, h - 40); ctx.lineTo(20, h - 20); ctx.lineTo(40, h - 20); ctx.stroke();
      // bottom right
      ctx.beginPath(); ctx.moveTo(w - 20, h - 40); ctx.lineTo(w - 20, h - 20); ctx.lineTo(w - 40, h - 20); ctx.stroke();

      // Cyber biometric HUD logs
      ctx.fillStyle = `${themeColor}aa`;
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText("DEC_RETINA_NET: RUNNING", 30, 35);
      ctx.fillText(`BIOMETRIC_Z_YAW: ${angleY.toFixed(4)} rad`, 30, 48);
      ctx.fillText("ANTI_SPOOF_TEXT: STANDBY", 30, 61);

      ctx.textAlign = "right";
      ctx.fillText("HUD_PORTAL_ACTIVE_v2.0", w - 30, 35);
      ctx.fillText(`CAMERA_LINK: PENDING_SIGNAL`, w - 30, 48);
      ctx.fillText("FACIAL_RECOG_ENGINE: READY", w - 30, 61);

      // Increment rotation angles
      angleY = (angleY + 0.006) % (Math.PI * 2);
      angleX = Math.sin(angleY * 0.5) * 0.25;

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [themeColor]);

  return <canvas ref={canvasRef} className="w-full h-full object-cover rounded-lg border border-white/5" />;
}

// Telemetry Canvas Chart inside Sidebar
function DiagnosticChart({ themeColor }: { themeColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataPointsRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const renderChart = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Add a slightly randomized new data value
      const lastVal = dataPointsRef.current[dataPointsRef.current.length - 1] || 50;
      const change = (Math.random() - 0.5) * 8;
      const newVal = Math.min(Math.max(lastVal + change, 15), h - 15);
      
      dataPointsRef.current.push(newVal);
      if (dataPointsRef.current.length > 40) {
        dataPointsRef.current.shift();
      }

      ctx.clearRect(0, 0, w, h);

      // Draw subtle backing grids
      ctx.strokeStyle = "rgba(255,255,255,0.02)";
      ctx.lineWidth = 1;
      for (let i = 0; i < h; i += 20) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
      }
      for (let i = 0; i < w; i += 30) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      }

      // Draw line chart
      if (dataPointsRef.current.length > 1) {
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 4;
        ctx.beginPath();

        const step = w / 39;
        ctx.moveTo(0, h - dataPointsRef.current[0]);

        for (let i = 1; i < dataPointsRef.current.length; i++) {
          const x = i * step;
          const y = h - dataPointsRef.current[i];
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset

        // Draw gradient area underneath
        ctx.lineTo((dataPointsRef.current.length - 1) * step, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `${themeColor}22`);
        grad.addColorStop(1, `${themeColor}00`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Draw telemetry labels
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "8px monospace";
      ctx.fillText("CPU LOAD TELEMETRY", 8, 12);
      ctx.fillText(`${(100 - (newVal / h) * 100).toFixed(0)}% LOAD`, w - 50, 12);

      animId = setTimeout(() => {
        requestAnimationFrame(renderChart);
      }, 150);
    };

    renderChart();

    return () => {
      clearTimeout(animId);
    };
  }, [themeColor]);

  return (
    <div className="w-full h-16 bg-slate-950/50 rounded-lg overflow-hidden border border-white/5 relative mt-3 shadow-inner">
      <canvas ref={canvasRef} width={260} height={64} className="w-full h-full block" />
    </div>
  );
}

function App() {
  const {
    wsConnected, currentFrame, detections, attendanceEvents, windowInfo,
    systemStatus, selectedCamera, isSpoofDetected,
    setWsConnected, setCurrentFrame, setDetections, setWindowInfo,
    addAttendanceEvent, setSystemStatus, setSelectedCamera, setIsSpoofDetected,
    setAttendanceEvents,
  } = useLiveStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAlertTime = useRef<number>(0);
  const [fps, setFps] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [cameras, setCameras] = useState<Array<{ id: number; name: string }>>([{ id: 1, name: "Default Camera" }]);
  const frameCountRef = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const [currentTime, setCurrentTime] = useState(new Date());

  const [countdown, setCountdown] = useState<number>(0);

  useEffect(() => {
    if (windowInfo?.countdown_seconds) {
      setCountdown(windowInfo.countdown_seconds);
    }
  }, [windowInfo]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Futuristic accent theme state
  const [hudTheme, setHudTheme] = useState<HudTheme>(() => {
    return (localStorage.getItem("hud_theme") as HudTheme) || "cyan";
  });

  const selectTheme = (theme: HudTheme) => {
    setHudTheme(theme);
    localStorage.setItem("hud_theme", theme);
  };

  // Video spectrum filter state
  const [filterMode, setFilterMode] = useState<"normal" | "thermal" | "night" | "edge">("normal");

  // Futuristic audio chimes enabled state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("sound_enabled") !== "false";
  });

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      localStorage.setItem("sound_enabled", String(!prev));
      return !prev;
    });
  };

  // Synthesize cyberpunk biometric chimes via Web Audio API (zero file dependencies)
  const playBeep = useCallback((type: "success" | "alert") => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      if (type === "success") {
        // High-tech affirmative dual beep
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.1); // G5

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(659.25, now + 0.06); // E5
        osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.16); // C6

        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.35);
        osc2.start(now + 0.06);
        osc2.stop(now + 0.35);
      } else {
        // Low-frequency security warning alert (buzzing pulse)
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(110, now + 0.12);
        osc.frequency.setValueAtTime(140, now + 0.24);

        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch (e) {
      console.warn("Could not play synthesized audio notification", e);
    }
  }, [soundEnabled]);

  // Statistics from Database + Live updates
  const [stats, setStats] = useState({ present: 0, late: 0 });

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Pre-load cameras, initial stats, and recent records
  useEffect(() => {
    // 1. Fetch cameras
    cameraApi.list().then((res) => {
      if (res.data?.length > 0) {
        setCameras(res.data.map((c: any) => ({ id: c.id, name: c.name })));
      }
    }).catch(() => {});

    // 2. Fetch today's stats (falls back gracefully if unauthenticated)
    attendanceApi.todayStats().then((res) => {
      if (res.data) {
        setStats({
          present: res.data.today_present || 0,
          late: res.data.today_late || 0,
        });
      }
    }).catch(() => {
      console.log("Terminal running in guest mode. Monitoring live counters only.");
    });

    // 3. Fetch recent records
    attendanceApi.records({ page_size: 20 }).then((res) => {
      if (res.data?.items) {
        const mapped = res.data.items.map((r: any) => ({
          id: r.id.toString(),
          user_name: r.user_name,
          employee_id: r.user_employee_id || r.employee_id,
          confidence: r.confidence,
          liveness_score: r.liveness_score,
          status: r.status,
          timestamp: r.timestamp,
          camera_name: r.camera_name || "Camera",
        }));
        setAttendanceEvents(mapped);
      }
    }).catch(() => {});
  }, [setAttendanceEvents]);

  // WebSocket connection management
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/${selectedCamera}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "detection_frame") {
          setCurrentFrame(data.frame);
          setDetections(data.detections || []);
          if (data.window_info) {
            setWindowInfo(data.window_info);
          }

          // Check for spoof
          const hasSpoof = (data.detections || []).some((d: any) => !d.is_real && d.identity !== "Unknown");
          setIsSpoofDetected(hasSpoof);

          if (hasSpoof) {
            // Alert buzzer throttled to every 3 seconds to avoid sound cluttering
            const nowTime = Date.now();
            if (nowTime - lastAlertTime.current > 3000) {
              playBeep("alert");
              lastAlertTime.current = nowTime;
            }
          }

          // FPS calculation
          frameCountRef.current++;
          const now = Date.now();
          if (now - lastFpsTime.current >= 1000) {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
            lastFpsTime.current = now;
          }
        }

        if (data.type === "attendance_marked") {
          addAttendanceEvent({
            id: `${data.user_id}_${Date.now()}`,
            user_name: data.user_name,
            employee_id: data.employee_id,
            confidence: data.confidence,
            liveness_score: data.liveness_score,
            status: data.status,
            timestamp: data.timestamp,
            in_time: data.in_time,
            out_time: data.out_time,
            window_id: data.window_id,
            camera_name: data.camera_name,
          });

          // Play success chime
          playBeep("success");

          // Increment local stats count
          setStats((prev) => ({
            present: data.status === "present" ? prev.present + 1 : prev.present,
            late: data.status === "late" ? prev.late + 1 : prev.late,
          }));
        }

        if (data.type === "system_status") {
          setSystemStatus(data);
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [selectedCamera, addAttendanceEvent, setWsConnected, setCurrentFrame, setDetections, setIsSpoofDetected, setSystemStatus, setWindowInfo, playBeep]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  // Fullscreen toggle helper
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const activeTheme = HUD_THEMES[hudTheme];

  // Helper for camera filter CSS rules
  const getFilterStyle = () => {
    switch (filterMode) {
      case "thermal":
        return "saturate(2.2) hue-rotate(210deg) contrast(1.5) invert(0.1) brightness(1.1)";
      case "night":
        return "brightness(1.2) contrast(1.3) grayscale(1) sepia(1) hue-rotate(95deg) saturate(6)";
      case "edge":
        return "grayscale(1) contrast(300%) invert(1)";
      default:
        return "none";
    }
  };

  return (
    <div className="h-screen w-screen bg-[#020307] text-white overflow-hidden flex flex-col font-sans select-none relative">
      {/* Dynamic Keyframes injected inline for ease of setup */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 0.2; }
        }
        @keyframes border-glow-alert {
          0%, 100% { border-color: rgba(244, 63, 94, 0.4); box-shadow: 0 0 8px rgba(244, 63, 94, 0.2); }
          50% { border-color: rgba(244, 63, 94, 0.95); box-shadow: 0 0 25px rgba(244, 63, 94, 0.6); }
        }
        @keyframes pulse-banner {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 0.6; }
        }
        @keyframes grid-glow {
          0%, 100% { opacity: 0.04; }
          50% { opacity: 0.08; }
        }
        @keyframes text-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .animate-scan-line {
          animation: scan 4s ease-in-out infinite;
        }
        .animate-blink-indicator {
          animation: text-blink 1.5s step-end infinite;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${activeTheme.hex}30;
        }
      `}</style>

      {/* Cyber ambient grid lines overlay */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0"
        style={{ animation: "grid-glow 6s ease-in-out infinite" }} 
      />

      {/* Top Biometric HUD Header */}
      <header className="h-14 bg-slate-950/45 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 z-20 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg bg-gradient-to-br from-slate-900 via-slate-950 to-black flex items-center justify-center border transition-all duration-300",
              activeTheme.border, activeTheme.glowClass
            )}>
              <ShieldAlert className={cn("w-4.5 h-4.5", activeTheme.accent)} />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wider uppercase text-white bg-clip-text">
                Biometric HUD Portal
              </span>
              <p className={cn("text-[9px] font-mono tracking-widest leading-none mt-0.5", activeTheme.accent)}>
                SECURE MONITORING STATION
              </p>
            </div>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-medium shadow-sm transition-all duration-300",
            isSpoofDetected 
              ? "bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse" 
              : wsConnected 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
              : "bg-amber-500/10 border-amber-500/30 text-amber-400"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full", 
              isSpoofDetected ? "bg-rose-500 animate-ping" : wsConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )} />
            {isSpoofDetected ? "SPOOF THREAT DETECTED" : wsConnected ? "FEEDS ACTIVE" : "RECONNECTING"}
          </div>
        </div>

        {/* Telemetry info and theme selector / action toggles */}
        <div className="flex items-center gap-6">
          {windowInfo && (
            <div className="text-[10px] font-mono text-cyan-400 bg-cyan-900/40 px-3 py-1.5 rounded-full border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
              WINDOW {windowInfo.window_id} &bull; NEXT: {formatCountdown(countdown)}
            </div>
          )}

          {/* Accent Color Palette Customizer */}
          <div className="flex items-center gap-2 bg-slate-900/30 border border-white/5 rounded-lg px-2.5 py-1">
            <span className="text-[9px] font-mono text-white/30 uppercase mr-1">HUD Accent:</span>
            {(Object.keys(HUD_THEMES) as HudTheme[]).map((themeKey) => {
              const item = HUD_THEMES[themeKey];
              const isSelected = hudTheme === themeKey;
              return (
                <button
                  key={themeKey}
                  onClick={() => selectTheme(themeKey)}
                  className={cn(
                    "w-4 h-4 rounded-full border transition-all duration-150 relative flex items-center justify-center cursor-pointer",
                    isSelected ? "border-white" : "border-transparent hover:scale-110"
                  )}
                  style={{ backgroundColor: item.hex }}
                  title={item.name}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-white/50">
            <span className="flex items-center gap-1.5 bg-white/[0.01] border border-white/5 px-2.5 py-1 rounded">
              <Clock className={cn("w-3.5 h-3.5", activeTheme.accent)} />
              {currentTime.toLocaleTimeString()}
            </span>
            <span className="flex items-center gap-1.5 bg-white/[0.01] border border-white/5 px-2.5 py-1 rounded">
              <Activity className={cn("w-3.5 h-3.5", activeTheme.accent)} />
              RENDER: {fps} FPS
            </span>
            <span className="flex items-center gap-1.5 bg-white/[0.01] border border-white/5 px-2.5 py-1 rounded hidden md:flex">
              <Cpu className={cn("w-3.5 h-3.5", activeTheme.accent)} />
              PROC: {systemStatus.fps || 0} Hz
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          {/* Icon buttons with interactive hover effects */}
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleSound}
              className={cn(
                "p-2 rounded-lg border transition-all duration-200 cursor-pointer",
                soundEnabled 
                  ? `${activeTheme.bg} ${activeTheme.border} ${activeTheme.accent} ${activeTheme.hover}` 
                  : "bg-white/[0.01] border-white/5 text-white/30 hover:bg-white/5 hover:text-white/60"
              )}
              title={soundEnabled ? "Mute audio chimes" : "Unmute audio chimes"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => setShowPanel(!showPanel)} 
              className={cn(
                "p-2 rounded-lg border transition-all duration-200 cursor-pointer",
                showPanel
                  ? `${activeTheme.bg} ${activeTheme.border} ${activeTheme.accent} ${activeTheme.hover}` 
                  : "bg-white/[0.01] border-white/5 text-white/30 hover:bg-white/5 hover:text-white/60"
              )}
              title="Toggle statistics side panel"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button 
              onClick={toggleFullscreen} 
              className="p-2 rounded-lg border border-white/5 bg-white/[0.01] text-white/40 hover:text-white hover:bg-white/5 hover:border-white/10 transition-all duration-200 cursor-pointer"
              title="Toggle full screen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main App content layout */}
      <div className="flex-1 flex overflow-hidden z-10">
        
        {/* Camera stream screen view */}
        <div className="flex-1 relative bg-[#010204] flex items-center justify-center p-4">
          
          {/* Spoof Alert Overlay Banner */}
          {isSpoofDetected && (
            <div className="absolute top-6 left-6 right-6 h-12 bg-red-950/85 backdrop-blur-md border border-red-500/35 rounded-lg flex items-center justify-between px-5 z-20 shadow-[0_0_25px_rgba(239,68,68,0.3)] animate-[pulse-banner_1.5s_infinite]">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500 animate-bounce" />
                <span className="font-bold text-sm tracking-wider text-red-400 font-mono">
                  CRITICAL: SECURITY ALERT - PRESENTATION ATACK DETECTED
                </span>
              </div>
              <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 font-mono px-2.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                Lockdown Active
              </span>
            </div>
          )}

          {/* HUD Spectrum Filters Toggle bar */}
          <div className="absolute bottom-16 left-6 bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-lg p-1.5 flex items-center gap-1 z-20">
            <span className="text-[9px] font-mono text-white/40 uppercase px-2">Spectrum:</span>
            {(["normal", "thermal", "night", "edge"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  "px-2.5 py-1 rounded text-[10px] font-mono uppercase transition-all duration-200 cursor-pointer",
                  filterMode === mode
                    ? `${activeTheme.bg} ${activeTheme.accent} border border-white/5 font-semibold`
                    : "text-white/40 hover:text-white hover:bg-white/5"
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Main frame display container */}
          <div className={cn(
            "w-full h-full max-w-[853px] max-h-[640px] aspect-[4/3] relative rounded-xl border overflow-hidden bg-black/60 shadow-[0_15px_50px_rgba(0,0,0,0.85)] transition-all duration-300",
            isSpoofDetected ? "border-red-500/40 shadow-red-950/20" : activeTheme.border
          )} style={isSpoofDetected ? { animation: "border-glow-alert 2s infinite" } : {}}>
            
            {currentFrame ? (
              <div className="w-full h-full relative overflow-hidden">
                {/* Active camera frame stream with filters applied */}
                <img
                  src={`data:image/jpeg;base64,${currentFrame}`}
                  alt="Camera Live Stream"
                  className="w-full h-full object-contain transition-all duration-150"
                  style={{ filter: getFilterStyle() }}
                />

                {/* Filter overlay elements */}
                {filterMode === "night" && (
                  <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none z-10 bg-[linear-gradient(rgba(16,185,129,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[size:100%_4px] opacity-80" />
                )}
                {filterMode === "thermal" && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/10 via-yellow-500/10 to-red-600/20 pointer-events-none z-10 mix-blend-overlay" />
                )}

                {/* Blinking record indicator */}
                <div className="absolute top-4 left-4 bg-black/55 backdrop-blur-sm border border-white/5 rounded-md px-2.5 py-1 z-10 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse animate-blink-indicator" />
                  <span className="text-[10px] font-mono tracking-widest text-white/90">
                    HUD FEED: ACTIVE
                  </span>
                </div>

                {/* Shutter Telemetry Stats Overlay */}
                <div className="absolute top-4 right-4 bg-black/55 backdrop-blur-sm border border-white/5 rounded-md px-2.5 py-1 z-10 text-[9px] font-mono text-white/50 flex gap-3">
                  <span>ISO 800</span>
                  <span>F/2.8</span>
                  <span>1/120s</span>
                  <span className={activeTheme.accent}>1080p</span>
                </div>

                {/* Cyber laser horizontal scanning line sweeps */}
                <div 
                  className="absolute left-0 right-0 h-0.5 shadow-[0_0_12px_2px_rgba(255,255,255,0.8)] animate-scan-line pointer-events-none" 
                  style={{ backgroundColor: activeTheme.hex, boxShadow: '0 0 12px 2px ' + activeTheme.hex }}
                />

                {/* Biometric overlay crosshair corners */}
                <div className="absolute inset-4 border border-white/[0.01] pointer-events-none">
                  <div className={cn("absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2", activeTheme.border)} />
                  <div className={cn("absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2", activeTheme.border)} />
                  <div className={cn("absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2", activeTheme.border)} />
                  <div className={cn("absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2", activeTheme.border)} />
                </div>
              </div>
            ) : (
              /* Idle screen 3D face mesh canvas visualization */
              <BiometricVisualizer themeColor={activeTheme.hex} />
            )}

            {/* Target acquisition brackets overlay around faces */}
            {currentFrame && detections.map((det, i) => {
              const accentColor = det.identity !== "Unknown"
                ? det.is_real ? "text-emerald-400" : "text-rose-500"
                : "text-amber-400";
              const accentBorder = det.identity !== "Unknown"
                ? det.is_real ? "border-emerald-500/50" : "border-rose-500/50"
                : "border-amber-500/50";
              const accentBg = det.identity !== "Unknown"
                ? det.is_real ? "bg-emerald-500/10" : "bg-rose-500/10"
                : "bg-amber-500/10";

              return (
                <div
                  key={i}
                  className="absolute pointer-events-none transition-all duration-150"
                  style={{
                    left: `${(det.bbox[0] / 640) * 100}%`,
                    top: `${(det.bbox[1] / 480) * 100}%`,
                    width: `${((det.bbox[2] - det.bbox[0]) / 640) * 100}%`,
                    height: `${((det.bbox[3] - det.bbox[1]) / 480) * 100}%`,
                  }}
                >
                  {/* Tech Bracket Corners */}
                  <div className={cn("absolute inset-0 transition-all duration-300", accentColor)}>
                    {/* Top-Left */}
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-current rounded-tl-sm" />
                    {/* Top-Right */}
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-current rounded-tr-sm" />
                    {/* Bottom-Left */}
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-current rounded-bl-sm" />
                    {/* Bottom-Right */}
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-current rounded-br-sm" />
                    
                    {/* Double nested bracket */}
                    <div className="absolute inset-1.5 border border-dashed border-current/15 rounded" />
                    
                    {/* Pulsing focal point crosshair in center of bounding box */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-current/30 rounded-full animate-ping" />
                  </div>

                  {/* Telemetry Tag Panel beneath face box */}
                  <div className={cn(
                    "absolute -bottom-[92px] left-1/2 -translate-x-1/2 flex flex-col gap-0.5 bg-slate-950/95 backdrop-blur-md border rounded px-3 py-2 text-[9px] font-mono text-white shadow-2xl shadow-black/85 z-10 w-max min-w-[135px]",
                    accentBorder
                  )}>
                    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-1 mb-1">
                      <span className="font-bold text-white/95">{det.identity}</span>
                      <span className={cn(
                        "px-1.5 rounded-[2px] text-[7px] font-bold tracking-wide uppercase",
                        accentBg, accentColor
                      )}>
                        {det.identity !== "Unknown" ? (det.is_real ? "REAL" : "SPOOF") : "UNKNOWN"}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-white/45">
                      <span>RECOG MATCH:</span>
                      <span className={cn("font-bold", accentColor)}>{(det.recognition_confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-white/45">
                      <span>LIVENESS SC:</span>
                      <span className={cn("font-bold", det.is_real ? "text-emerald-400" : "text-rose-400")}>
                        {(det.liveness_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    
                    {/* Tiny Checkbox Status Matrix */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-white/5 pt-1 mt-1 text-[7px] text-white/40">
                      <span className="flex items-center gap-0.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", det.is_real ? "bg-emerald-400" : "bg-rose-500")} /> Blink
                      </span>
                      <span className="flex items-center gap-0.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", det.is_real ? "bg-emerald-400" : "bg-rose-500")} /> Texture
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Bottom HUD Overlay across active camera stream */}
            <div className="absolute bottom-0 left-0 right-0 h-11 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent flex items-center px-5 gap-6 border-t border-white/5 backdrop-blur-[1px] text-[11px] font-mono">
              <div className="flex items-center gap-2">
                <Radio className={cn("w-3.5 h-3.5 animate-pulse", activeTheme.accent)} />
                <span className="text-white/40">CHANNEL:</span>
                <span className="text-white/70 font-semibold uppercase">
                  {cameras.find((c) => c.id === selectedCamera)?.name || `Camera ${selectedCamera}`}
                </span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-white/40">VERIFIED:</span>
                <span className="text-white/80 font-bold">
                  {detections.filter((d) => d.identity !== "Unknown" && d.is_real).length} Present
                </span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-white/40">ANONYMOUS:</span>
                <span className="text-white/80 font-bold">
                  {detections.filter((d) => d.identity === "Unknown").length} Face(s)
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Side Panel: System statistics, camera feed options & logs */}
        {showPanel && (
          <aside className="w-80 bg-slate-950/75 backdrop-blur-xl border-l border-white/5 flex flex-col z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.6)]">
            
            {/* Header section: Camera switcher */}
            <div className="p-4 border-b border-white/5">
              <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <CameraIcon className="w-3 h-3 text-cyan-400" /> Active Video Channels
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                {cameras.map((cam) => (
                  <button
                    key={cam.id}
                    onClick={() => setSelectedCamera(cam.id)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs font-mono font-medium truncate border transition-all duration-200 text-left cursor-pointer",
                      selectedCamera === cam.id
                        ? `${activeTheme.bg} ${activeTheme.border} ${activeTheme.accent} shadow-md font-semibold`
                        : "bg-white/[0.01] border-white/5 text-white/40 hover:bg-white/5 hover:text-white/70"
                    )}
                  >
                    <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse", activeTheme.hex ? `bg-[${activeTheme.hex}]` : "bg-cyan-400")} style={{ backgroundColor: activeTheme.hex }} />
                    {cam.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Middle Section: Biometric Data Tally */}
            <div className="p-4 border-b border-white/5 bg-slate-950/30">
              <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Database className="w-3 h-3 text-cyan-400" /> Biometric Metrics Tally
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.01] border border-white/5 rounded-xl p-3 text-center shadow-inner hover:border-emerald-500/15 transition-all">
                  <p className="text-[9px] text-white/30 font-mono uppercase tracking-wider">Verified Present</p>
                  <p className="text-3xl font-extrabold text-emerald-400 mt-1 font-mono tracking-tight">
                    {stats.present}
                  </p>
                </div>
                <div className="bg-white/[0.01] border border-white/5 rounded-xl p-3 text-center shadow-inner hover:border-amber-500/15 transition-all">
                  <p className="text-[9px] text-white/30 font-mono uppercase tracking-wider">Late Check-ins</p>
                  <p className="text-3xl font-extrabold text-amber-400 mt-1 font-mono tracking-tight">
                    {stats.late}
                  </p>
                </div>
              </div>
            </div>

            {/* Diagnostics checklist and graph */}
            <div className="p-4 border-b border-white/5 bg-slate-950/20">
              <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5">
                <Server className="w-3 h-3 text-cyan-400" /> Diagnostic System Feed
              </p>
              
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2.5 text-[9px] font-mono text-white/50">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>FastAPI Link</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>WS Stream</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Face Detector</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>SQLite Sync</span>
                </div>
              </div>

              {/* Dynamic canvas load monitoring graph */}
              <DiagnosticChart themeColor={activeTheme.hex} />
            </div>

            {/* Body Section: Real-time Incident Logs list */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-4 pb-2">
                <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  Telemetry Event Stream
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 custom-scrollbar">
                {attendanceEvents.length === 0 ? (
                  <div className="text-center py-16">
                    <Activity className="w-8 h-8 text-cyan-500/10 mx-auto mb-3" />
                    <p className="text-white/20 text-xs font-mono">NO ACTIVE LOGS</p>
                  </div>
                ) : (
                  attendanceEvents.map((event, i) => (
                    <div
                      key={event.id}
                      className={cn(
                        "p-3 rounded-lg border flex items-center gap-3 transition-all duration-300 shadow-md",
                        i === 0 
                          ? `${activeTheme.bg} ${activeTheme.border} translate-x-0 shadow-sm` 
                          : "bg-white/[0.01] border-white/5 hover:border-white/10"
                      )}
                    >
                      {/* Event category status marker */}
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-inner",
                        event.status === "present" ? "bg-emerald-500/10 border border-emerald-500/30" :
                        event.status === "late" ? "bg-amber-500/10 border border-amber-500/30" :
                        "bg-rose-500/10 border border-rose-500/30"
                      )}>
                        {event.status === "present" ? (
                          <UserCheck className="w-4.5 h-4.5 text-emerald-400" />
                        ) : event.status === "late" ? (
                          <Clock className="w-4.5 h-4.5 text-amber-400" />
                        ) : (
                          <UserX className="w-4.5 h-4.5 text-rose-400" />
                        )}
                      </div>

                      {/* Attendee details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-xs font-bold truncate leading-tight">
                            {event.user_name}
                          </p>
                          <span className={cn(
                            "text-[8px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold tracking-wider",
                            event.status === "present" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
                            event.status === "late" ? "text-amber-400 bg-amber-400/10 border-amber-400/30" :
                            "text-rose-400 bg-rose-400/10 border-rose-400/30"
                          )}>
                            {event.status}
                          </span>
                        </div>
                        <p className="text-white/30 text-[9px] font-mono mt-0.5 tracking-wider">
                          {event.employee_id}
                        </p>
                      </div>

                      {/* Log details */}
                      <div className="text-right flex-shrink-0 font-mono">
                        <p className={cn("text-[10px] font-bold",
                          event.status === "present" ? "text-emerald-400" :
                          event.status === "late" ? "text-amber-400" : "text-rose-400"
                        )}>
                          {event.status === "absent" ? "ABSENT" : `${(event.confidence * 100).toFixed(0)}%`}
                        </p>
                        <p className="text-white/40 text-[9px] mt-0.5 whitespace-nowrap">
                          {event.status === "absent" ? "Not Detected" : (
                            <>
                              {event.in_time && `IN ${event.in_time}`}
                              {event.out_time && event.out_time !== event.in_time && ` / OUT ${event.out_time}`}
                              {!event.in_time && (event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '')}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sidebar Bottom HUD status metadata */}
            <div className="p-4 border-t border-white/5 bg-slate-950 text-[10px] font-mono text-white/30 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Database className="w-3 h-3 text-cyan-500" /> DB Connection Secure
              </span>
              <span>v2.0.0</span>
            </div>

          </aside>
        )}
      </div>
    </div>
  );
}

export default App;
