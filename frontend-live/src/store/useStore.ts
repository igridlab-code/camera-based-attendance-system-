import { create } from "zustand";

interface AttendanceEvent {
  id: string;
  user_name: string;
  employee_id: string;
  confidence: number;
  liveness_score: number;
  status: string;
  timestamp: string;
  in_time?: string;
  out_time?: string;
  window_id?: number;
  camera_name: string;
}

interface Detection {
  bbox: [number, number, number, number];
  identity: string;
  confidence: number;
  liveness_score: number;
  is_real: boolean;
  recognition_confidence: number;
}

interface WindowInfo {
  window_id: number;
  interval_min: number;
  next_processing: string;
  countdown_seconds: number;
}

interface LiveState {
  wsConnected: boolean;
  currentFrame: string | null;
  detections: Detection[];
  attendanceEvents: AttendanceEvent[];
  windowInfo: WindowInfo | null;
  systemStatus: {
    active_cameras: number;
    fps: number;
    cpu_usage: number;
  };
  selectedCamera: number;
  isSpoofDetected: boolean;
  
  setWsConnected: (v: boolean) => void;
  setCurrentFrame: (frame: string | null) => void;
  setDetections: (d: Detection[]) => void;
  addAttendanceEvent: (e: AttendanceEvent) => void;
  setSystemStatus: (s: any) => void;
  setSelectedCamera: (id: number) => void;
  setIsSpoofDetected: (v: boolean) => void;
  setAttendanceEvents: (events: AttendanceEvent[]) => void;
  setWindowInfo: (w: WindowInfo | null) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  wsConnected: false,
  currentFrame: null,
  detections: [],
  attendanceEvents: [],
  windowInfo: null,
  systemStatus: { active_cameras: 0, fps: 0, cpu_usage: 0 },
  selectedCamera: 1,
  isSpoofDetected: false,

  setWsConnected: (v) => set({ wsConnected: v }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setDetections: (d) => set({ detections: d }),
  addAttendanceEvent: (e) =>
    set((s) => {
      const filtered = s.attendanceEvents.filter(
        (ev) =>
          ev.employee_id !== e.employee_id &&
          ev.user_name !== e.user_name &&
          ev.id !== e.id
      );
      return { attendanceEvents: [e, ...filtered].slice(0, 50) };
    }),
  setSystemStatus: (status) => set({ systemStatus: status }),
  setSelectedCamera: (id) => set({ selectedCamera: id }),
  setIsSpoofDetected: (v) => set({ isSpoofDetected: v }),
  setAttendanceEvents: (events) => set({ attendanceEvents: events }),
  setWindowInfo: (w) => set({ windowInfo: w }),
}));

