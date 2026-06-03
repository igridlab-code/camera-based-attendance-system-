import { create } from "zustand";

interface AttendanceEvent {
  id: string;
  user_name: string;
  employee_id: string;
  confidence: number;
  liveness_score: number;
  status: string;
  timestamp: string;
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

interface LiveState {
  wsConnected: boolean;
  currentFrame: string | null;
  detections: Detection[];
  attendanceEvents: AttendanceEvent[];
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
}

export const useLiveStore = create<LiveState>((set) => ({
  wsConnected: false,
  currentFrame: null,
  detections: [],
  attendanceEvents: [],
  systemStatus: { active_cameras: 0, fps: 0, cpu_usage: 0 },
  selectedCamera: 1,
  isSpoofDetected: false,

  setWsConnected: (v) => set({ wsConnected: v }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setDetections: (d) => set({ detections: d }),
  addAttendanceEvent: (e) =>
    set((s) => ({
      attendanceEvents: [e, ...s.attendanceEvents].slice(0, 50),
    })),
  setSystemStatus: (status) => set({ systemStatus: status }),
  setSelectedCamera: (id) => set({ selectedCamera: id }),
  setIsSpoofDetected: (v) => set({ isSpoofDetected: v }),
  setAttendanceEvents: (events) => set({ attendanceEvents: events }),
}));

