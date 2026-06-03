import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Eye, EyeOff, Loader2, Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { authApi } from "@/api/client";
import { useStore } from "@/store/useStore";

export default function Login() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "failed">("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const navigate = useNavigate();
  const { setToken, setAdmin } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setScanStatus("scanning");
    setScanProgress(10);

    // Simulate cyber-scan step 1
    setTimeout(() => setScanProgress(45), 400);
    setTimeout(() => setScanProgress(85), 800);

    try {
      const res = await authApi.login(username, password);
      
      setTimeout(() => {
        setScanProgress(100);
        if (res.data.success) {
          setScanStatus("success");
          setTimeout(() => {
            setToken(res.data.token.access_token);
            setAdmin(res.data.user);
            navigate("/");
          }, 600);
        } else {
          setScanStatus("failed");
          setError(res.data.message || "Authorization failed");
          setLoading(false);
        }
      }, 1100);

    } catch (err: any) {
      setTimeout(() => {
        setScanStatus("failed");
        setError(err.response?.data?.detail || "Invalid security credentials");
        setLoading(false);
      }, 1100);
    }
  };

  // Reset scan status if input changes
  useEffect(() => {
    if (scanStatus === "failed") {
      setScanStatus("idle");
      setScanProgress(0);
    }
  }, [username, password]);

  return (
    <div className="min-h-screen bg-[#020408] flex items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      {styleTag}

      {/* Cyber grid overlays */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#06b6d403_1px,transparent_1px),linear-gradient(to_bottom,#06b6d403_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none z-0" />
      
      {/* Background glowing blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-500/5 blur-[120px] pointer-events-none z-0" />

      <div className="w-full max-w-md z-10 relative">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-black border border-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <ShieldAlert className="w-7 h-7 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-black tracking-wider text-white uppercase">Smart Attendance AI</h1>
          <p className="text-cyan-400/55 text-xs font-mono tracking-widest mt-1">ADMINISTRATIVE INTERFACE</p>
        </div>

        {/* Glassmorphic Login Casing */}
        <div className="backdrop-blur-xl bg-slate-950/40 border border-white/5 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
          
          {/* Scanning status banner */}
          {scanStatus !== "idle" && (
            <div className={`absolute top-0 left-0 right-0 h-1 bg-transparent z-20`}>
              <div 
                className={`h-full transition-all duration-300 ${
                  scanStatus === "scanning" ? "bg-cyan-500 shadow-[0_0_8px_#06b6d4]" :
                  scanStatus === "success" ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" :
                  "bg-rose-500 shadow-[0_0_8px_#f43f5e]"
                }`}
                style={{ width: `${scanProgress}%` }}
              />
            </div>
          )}

          {/* Biometric Interactive Scanner Widget */}
          <div className="flex flex-col items-center mb-6">
            <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center relative transition-all duration-300 bg-slate-900/30 ${
              scanStatus === "scanning" ? "border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.25)] animate-pulse" :
              scanStatus === "success" ? "border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.25)]" :
              scanStatus === "failed" ? "border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.25)]" :
              "border-white/10"
            }`}>
              
              {/* Spinning circular guide ring */}
              <div className={`absolute inset-1 rounded-full border border-dashed border-cyan-500/20 ${scanStatus === "scanning" ? "animate-spin-slow" : ""}`} />

              {/* Central icons */}
              {scanStatus === "success" ? (
                <ShieldCheck className="w-8 h-8 text-emerald-400 animate-bounce" />
              ) : (
                <Fingerprint className={`w-9 h-9 transition-colors duration-300 ${
                  scanStatus === "scanning" ? "text-cyan-400" :
                  scanStatus === "failed" ? "text-rose-400" :
                  "text-white/30"
                }`} />
              )}

              {/* Scanning visual laser bar overlay */}
              {scanStatus === "scanning" && (
                <div className="absolute left-2 right-2 h-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-scanner-laser" />
              )}
            </div>

            <p className="text-[10px] font-mono tracking-widest text-center uppercase">
              {scanStatus === "idle" && <span className="text-white/30">Insert Credentials to Authorize</span>}
              {scanStatus === "scanning" && <span className="text-cyan-400 animate-pulse">Running Biometric Hash Check... {scanProgress}%</span>}
              {scanStatus === "success" && <span className="text-emerald-400 font-bold">Access Granted: Handshake Ok</span>}
              {scanStatus === "failed" && <span className="text-rose-400 font-bold">Credentials Match Failed</span>}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-white/50 mb-1.5 tracking-wider">Operator ID</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
                placeholder="OPERATOR_CODE"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-mono uppercase text-white/50 tracking-wider">Access Cipher</label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
                  placeholder="CIPHER_KEY"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-2.5 text-xs font-mono text-rose-400 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-xs uppercase tracking-widest py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md hover:shadow-cyan-950/20 border border-white/5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Authenticating...
                </>
              ) : (
                "Initiate Connection"
              )}
            </button>
          </form>

          {/* Bottom decorative coordinates / labels */}
          <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] font-mono text-white/20">
            <span>SECURE_LINK: SSL_AES_256</span>
            <span>SYSTEM_NODE: 127.0.0.1</span>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
            Default credentials: <span className="text-cyan-500/60 font-bold">admin</span> / <span className="text-cyan-500/60 font-bold">admin123</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// Inline CSS animations for scanner laser and spin
const styleTag = (
  <style>{`
    @keyframes scanner-laser {
      0%, 100% { top: 12%; opacity: 0.2; }
      55% { top: 88%; opacity: 1; }
    }
    @keyframes spin-slow {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .animate-scanner-laser {
      animation: scanner-laser 1.8s ease-in-out infinite;
    }
    .animate-spin-slow {
      animation: spin-slow 8s linear infinite;
    }
  `}</style>
);
