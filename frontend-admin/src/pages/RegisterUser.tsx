import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, ChevronLeft, ChevronRight, Loader2, AlertCircle, Cpu, Radio, ShieldCheck, VideoOff, RefreshCw } from "lucide-react";
import { userApi } from "@/api/client";
import { useStore } from "@/store/useStore";

type Step = "details" | "capture" | "review";

const SAMPLE_TYPES = [
  { key: "front", label: "Frontal Matrix", instruction: "Align face directly to the screen guide" },
  { key: "left", label: "Left Profile Scan", instruction: "Turn your head 45 degrees to the left" },
  { key: "right", label: "Right Profile Scan", instruction: "Turn your head 45 degrees to the right" },
  { key: "expression", label: "Biometric Expression", instruction: "Provide a natural expression/smile" },
];

export default function RegisterUser() {
  const navigate = useNavigate();
  const { addNotification } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<Step>("details");
  const [saving, setSaving] = useState(false);

  // User details
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("employee");

  // Face capture
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState<Record<string, string>>({});
  const [captureStatus, setCaptureStatus] = useState<"idle" | "countdown" | "capturing" | "done">("idle");
  const [countdown, setCountdown] = useState(3);

  // Camera state
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const currentSample = SAMPLE_TYPES[currentSampleIndex];
  const allCaptured = SAMPLE_TYPES.every((s) => capturedImages[s.key]);

  // ── Camera helpers ──────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraError(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    // Stop any existing stream first
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Explicitly call play() — autoPlay alone is unreliable in some browsers
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("video.play() warning:", playErr);
        }
      }
    } catch (e: any) {
      const msg =
        e.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access in your browser settings."
          : e.name === "NotFoundError"
          ? "No camera device found. Please connect a webcam."
          : "Failed to access camera. Please check your device.";
      setCameraError(msg);
      addNotification({ type: "error", message: msg });
    }
  }, [addNotification]);

  // ── Lifecycle: start/stop camera based on step ──────────────────────
  useEffect(() => {
    if (step === "capture") {
      startCamera();
    } else {
      stopCamera();
    }
    // Cleanup on unmount or step change
    return () => {
      if (step === "capture") {
        stopCamera();
      }
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video ready callback ────────────────────────────────────────────
  const handleVideoCanPlay = useCallback(() => {
    setCameraReady(true);
  }, []);

  // ── Step navigation ─────────────────────────────────────────────────
  const proceedToCapture = () => {
    if (!fullName.trim() || !employeeId.trim()) {
      addNotification({ type: "error", message: "Full name and Employee ID are required" });
      return;
    }
    setStep("capture");
    // camera is started by useEffect
  };

  // ── Capture logic ───────────────────────────────────────────────────
  const startCountdown = () => {
    if (capturedImages[currentSample.key]) return;
    if (!cameraReady) {
      addNotification({ type: "error", message: "Camera is not ready yet. Please wait." });
      return;
    }
    setCaptureStatus("countdown");
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        captureImage();
      }
    }, 1000);
  };

  const captureImage = () => {
    setCaptureStatus("capturing");
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth;
    const h = video.videoHeight;

    // Guard: if dimensions are 0, stream isn't ready
    if (w === 0 || h === 0) {
      setCaptureStatus("idle");
      addNotification({ type: "error", message: "Camera stream not ready. Please wait a moment and try again." });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    setCapturedImages((prev) => ({ ...prev, [currentSample.key]: dataUrl }));
    setCaptureStatus("done");

    setTimeout(() => {
      if (currentSampleIndex < SAMPLE_TYPES.length - 1) {
        setCurrentSampleIndex((i) => i + 1);
        setCaptureStatus("idle");
      }
    }, 800);
  };

  // ── Submit ──────────────────────────────────────────────────────────
  const submitRegistration = async () => {
    setSaving(true);
    try {
      // 1. Create user
      const userRes = await userApi.create({
        full_name: fullName,
        employee_id: employeeId,
        department: department || undefined,
        email: email || undefined,
        phone: phone || undefined,
        role,
      });

      const userId = userRes.data.id;

      // 2. Upload face samples
      for (const sample of SAMPLE_TYPES) {
        const imageData = capturedImages[sample.key];
        if (imageData) {
          await userApi.captureFace(userId, imageData, sample.key);
        }
      }

      stopCamera();
      addNotification({ type: "success", message: `Subject ${fullName} enrolled successfully in the index.` });
      navigate("/users");
    } catch (e: any) {
      addNotification({ type: "error", message: e.response?.data?.detail || "Failed to register user" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <style>{`
        @keyframes sweep {
          0%, 100% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 0.2; }
        }
        .animate-sweep-grid {
          animation: sweep 3.5s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => { stopCamera(); navigate(-1); }} className="p-2 rounded-lg bg-white/[0.01] border border-white/5 text-white/40 hover:text-white hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">Subject Enrollment Matrix</h1>
          <p className="text-cyan-400/50 text-xs font-mono tracking-widest mt-0.5">ENROLL NEW FACIAL SIGNATURE INDEX</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4 bg-slate-950/40 border border-white/5 p-4 rounded-xl backdrop-blur-md">
        {(["details", "capture", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono transition-all duration-300 border ${
              step === s
                ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                : step === "review" || (step === "capture" && s === "details")
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-white/[0.01] border-white/5 text-white/30"
            }`}>
              {i + 1}
            </div>
            <span className={`text-xs font-mono uppercase tracking-wider ${step === s ? "text-white font-bold" : "text-white/30"}`}>{s}</span>
            {i < 2 && <ChevronRight className="w-4 h-4 text-white/20" />}
          </div>
        ))}
      </div>

      {step === "details" && (
        <div className="bg-[#0b0f19]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-[0_15px_50px_rgba(0,0,0,0.7)] space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-mono uppercase text-white/50 mb-1.5 tracking-wider">Full Legal Name *</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/10 transition-all font-mono" placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-white/50 mb-1.5 tracking-wider">Subject Index ID (Emp ID) *</label>
              <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/10 transition-all font-mono" placeholder="EMP001" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-white/50 mb-1.5 tracking-wider">Assigned Department</label>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/10 transition-all font-mono" placeholder="Operations / Engineering" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-white/50 mb-1.5 tracking-wider">Secure Comms (Email)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/10 transition-all font-mono" placeholder="john@domain.com" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-white/50 mb-1.5 tracking-wider">Direct Tel (Phone)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/10 transition-all font-mono" placeholder="+1 234 567 890" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-white/50 mb-1.5 tracking-wider">Security Class (Role)</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/10 transition-all font-mono">
                <option value="employee">Standard Employee</option>
                <option value="student">Academic Student</option>
                <option value="visitor">Visitor Credentials</option>
              </select>
            </div>
          </div>

          <button onClick={proceedToCapture} className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-xs uppercase tracking-widest py-3 px-6 rounded-lg transition-all flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-cyan-950/20 border border-white/5">
            <Camera className="w-4 h-4" />
            Proceed to Biometric Capture
          </button>
        </div>
      )}

      {step === "capture" && (
        <div className="space-y-4">
          <div className="bg-[#0b0f19]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-[0_15px_50px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
              <div>
                <h3 className="text-white text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-4.5 h-4.5 text-cyan-400 animate-pulse" />
                  {currentSample.label}
                </h3>
                <p className="text-cyan-400/50 text-[10px] font-mono tracking-widest uppercase mt-0.5">{currentSample.instruction}</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Camera ready indicator */}
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${cameraReady ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : cameraError ? "text-red-400 border-red-500/30 bg-red-500/10" : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10 animate-pulse"}`}>
                  {cameraReady ? "CAM LIVE" : cameraError ? "CAM ERROR" : "INITIALIZING..."}
                </span>
                <span className="text-cyan-400 font-mono text-xs bg-cyan-500/10 px-2 py-0.5 border border-cyan-500/20 rounded">STAGE {currentSampleIndex + 1}/{SAMPLE_TYPES.length}</span>
              </div>
            </div>

            {/* Webcam / Error area */}
            <div className="relative aspect-video bg-slate-950/40 rounded-xl overflow-hidden border border-white/5 flex items-center justify-center">

              {/* Camera error state */}
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-slate-950/80 px-6">
                  <VideoOff className="w-12 h-12 text-red-400/60" />
                  <p className="text-red-400/80 text-xs font-mono text-center tracking-wide">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-white/70 hover:text-white px-4 py-2 rounded-lg transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Camera
                  </button>
                </div>
              ) : null}

              {/* Initializing overlay */}
              {!cameraReady && !cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-slate-950/70">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                  <p className="text-cyan-400/60 text-[10px] font-mono tracking-widest uppercase">Initializing Camera Feed...</p>
                </div>
              ) : null}

              {/* Video element — always mounted so ref is valid */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onCanPlay={handleVideoCanPlay}
                onLoadedMetadata={handleVideoCanPlay}
                className="w-full h-full object-cover"
                style={{ display: cameraError ? "none" : "block" }}
              />

              {/* Glowing countdown overlay */}
              {captureStatus === "countdown" && (
                <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-10 backdrop-blur-sm">
                  <div className="w-20 h-20 rounded-full border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                    <span className="text-4xl font-mono font-extrabold text-cyan-400 animate-pulse">{countdown}</span>
                  </div>
                </div>
              )}

              {/* Verification scan check */}
              {captureStatus === "done" && (
                <div className="absolute inset-0 bg-emerald-950/45 flex items-center justify-center z-10 backdrop-blur-sm animate-pulse">
                  <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-full p-4 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                    <Check className="w-10 h-10 text-emerald-400 animate-bounce" />
                  </div>
                </div>
              )}

              {/* Holographic face guideline brackets */}
              {captureStatus === "idle" && cameraReady && (
                <>
                  {/* Grid scanner animation line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-cyan-400/60 shadow-[0_0_10px_#06b6d4] animate-sweep-grid pointer-events-none" />

                  {/* Outer corner target brackets */}
                  <div className="absolute inset-8 border border-white/[0.02] pointer-events-none">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-500/40" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-500/40" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-500/40" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-500/40" />
                  </div>

                  {/* Circular biometric crosshair alignment guide */}
                  <div className="absolute w-52 h-52 border border-dashed border-cyan-500/25 rounded-full flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border border-cyan-500/10 rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 border-t border-l border-cyan-500/30" />
                    </div>
                  </div>

                  <div className="absolute bottom-4 left-4 bg-slate-950/80 backdrop-blur-sm border border-white/5 rounded-md px-2 py-0.5 text-[8px] font-mono text-cyan-400/60 tracking-wider">
                    TARGETING_GRID: READY
                  </div>
                </>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={startCountdown}
                disabled={captureStatus !== "idle" || !!capturedImages[currentSample.key] || !cameraReady || !!cameraError}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-mono text-xs uppercase tracking-widest py-2.5 px-8 rounded-lg transition-all flex items-center gap-2 cursor-pointer border border-white/5"
              >
                <Camera className="w-4 h-4" />
                {!cameraReady && !cameraError ? "Waiting for Camera..." : "Trigger Scan"}
              </button>
            </div>

            {/* Matrix angle capture slots list */}
            <div className="flex gap-4 mt-6 justify-center">
              {SAMPLE_TYPES.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => { setCurrentSampleIndex(i); setCaptureStatus("idle"); }}
                  className={`w-20 h-20 rounded-xl border overflow-hidden transition-all duration-300 relative group cursor-pointer ${
                    i === currentSampleIndex
                      ? "border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)] bg-cyan-500/5"
                      : capturedImages[s.key]
                      ? "border-emerald-500/40"
                      : "border-white/5 bg-slate-950/40"
                  }`}
                >
                  {capturedImages[s.key] ? (
                    <>
                      <img src={capturedImages[s.key]} alt={s.label} className="w-full h-full object-cover grayscale brightness-95" />
                      <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
                        <Check className="w-5 h-5 text-emerald-400" />
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                      <Cpu className="w-4 h-4 text-white/30" />
                      <span className="text-[8px] font-mono uppercase text-white/40">{s.key.substring(0, 5)}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center px-2">
            <button onClick={() => { setStep("details"); }} className="text-white/40 hover:text-white text-xs font-mono uppercase tracking-widest transition-colors cursor-pointer">
              Back to Details
            </button>
            {allCaptured && (
              <button onClick={() => setStep("review")} className="bg-slate-900 border border-white/5 hover:border-white/10 hover:bg-slate-800 text-white font-mono text-xs uppercase tracking-widest py-2 px-6 rounded-lg transition-all cursor-pointer">
                Proceed to Review
              </button>
            )}
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="bg-[#0b0f19]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-[0_15px_50px_rgba(0,0,0,0.7)] space-y-6">
          <h3 className="text-white font-mono text-sm font-bold uppercase tracking-wider border-b border-white/5 pb-2">Enrolled Index Dossier</h3>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono text-white/70">
            <div><span className="text-white/30 uppercase">FullName:</span> <span className="text-white font-bold">{fullName}</span></div>
            <div><span className="text-white/30 uppercase">SubjectID:</span> <span className="text-white font-bold">{employeeId}</span></div>
            <div><span className="text-white/30 uppercase">Dept:</span> <span className="text-white">{department || "-"}</span></div>
            <div><span className="text-white/30 uppercase">Email:</span> <span className="text-white">{email || "-"}</span></div>
          </div>

          <div>
            <p className="text-cyan-400/50 text-[10px] font-mono uppercase tracking-widest mb-3">FACIAL SIGNATURE TARGET PLATES ({Object.keys(capturedImages).length}/{SAMPLE_TYPES.length})</p>
            <div className="grid grid-cols-4 gap-4">
              {SAMPLE_TYPES.map((s) => (
                <div key={s.key} className="text-center space-y-1.5">
                  <div className="relative aspect-square rounded-xl overflow-hidden border border-white/5 bg-slate-950/40">
                    {capturedImages[s.key] ? (
                      <img src={capturedImages[s.key]} alt={s.label} className="w-full h-full object-cover grayscale contrast-125" />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-white/20" />
                      </div>
                    )}
                  </div>
                  <p className="text-white/40 text-[9px] font-mono uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 border-t border-white/5 pt-4">
            <button
              onClick={() => setStep("capture")}
              className="text-white/40 hover:text-white text-xs font-mono uppercase tracking-widest py-2 px-4 transition-colors cursor-pointer"
            >
              Recapture Plates
            </button>
            <button
              onClick={submitRegistration}
              disabled={saving}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-white font-mono text-xs uppercase tracking-widest py-3 px-8 rounded-lg transition-all flex items-center gap-2 cursor-pointer border border-white/5 shadow-lg shadow-emerald-950/20"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <ShieldCheck className="w-4 h-4" />}
              {saving ? "Hashing Index Matrix..." : "Hash to Database"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
