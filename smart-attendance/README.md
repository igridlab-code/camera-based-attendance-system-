# Smart Attendance AI System

A production-grade, AI-powered facial recognition attendance system with real-time liveness detection, anti-spoofing, and comprehensive admin analytics.

## System Architecture

```
                    +------------------+      +------------------+
  User Browser ---->|  Nginx (80/443)  |----->|  Admin Frontend   |
                    |    (Reverse      |      |  (React + Vite)  |
                    |     Proxy)       |      +------------------+
                    +--------+---------+
                             |
                    +--------v---------+      +------------------+
                    |  FastAPI Backend |----->|  Live Frontend    |
                    |    (Python)      |      |  (React + WS)    |
                    +--------+---------+      +------------------+
                             |
            +----------------+----------------+
            |                                 |
   +--------v---------+            +---------v--------+
   |  Face Recognition |            |  SQLite /        |
   |  (InsightFace)    |            |  PostgreSQL      |
   |  RetinaFace +     |            +------------------+
   |  ArcFace          |
   +--------+---------+
            |
   +--------v---------+
   |  Liveness Detect  |
   |  (Multi-modal)    |
   |  - Eye blink      |
   |  - Head pose      |
   |  - Texture        |
   |  - Motion         |
   +-------------------+
```

## Applications

### App 1: Admin Management (`frontend-admin/`)
- **URL**: http://localhost (port 80)
- Secure JWT authentication with role-based access
- User registration with multi-angle face capture
- Real-time dashboard with charts and statistics
- Camera management (USB, IP, CCTV support)
- Attendance logs with CSV/JSON export
- AI model training and index management
- Security center for unknown face detections
- System settings and configuration

### App 2: Live Attendance (`frontend-live/`)
- **URL**: http://localhost:81
- Full-screen real-time camera monitoring
- Live face detection with bounding boxes
- Real-time face recognition with confidence scores
- Multi-modal liveness detection indicators
- Attendance status overlay
- Side panel with recent attendance events
- WebSocket-based streaming (10-15 FPS)
- Camera selector for multi-camera setups

## Key Features

### AI-Powered Face Recognition
- **Detection**: RetinaFace (InsightFace) for accurate face detection
- **Recognition**: ArcFace 512-d embeddings for state-of-the-art accuracy
- **Multi-angle support**: Front, left, right, expression samples per user
- **Incremental updates**: Add users without retraining entire system
- **GPU acceleration**: CUDA support for real-time inference

### Anti-Spoofing / Liveness Detection
- Eye blink detection (EAR-based)
- Head pose estimation and movement tracking
- Texture analysis (Laplacian + LBP)
- Motion/temporal consistency analysis
- Detects: printed photos, screen replays, static images
- Challenge-response capable

### Low-Light Handling
- CLAHE (Contrast Limited Adaptive Histogram Equalization)
- Gamma correction
- Bilateral filtering for noise reduction
- Auto-exposure adjustment
- Quality assessment before processing

### Real-Time Performance
- Multi-threaded camera capture
- Frame skipping for inference (configurable)
- In-memory embedding index with cosine similarity
- WebSocket streaming at 10-15 FPS
- Sub-second recognition latency

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **AI/ML**: InsightFace (RetinaFace + ArcFace), OpenCV, NumPy
- **Database**: SQLite (default) / PostgreSQL (production)
- **Auth**: JWT with bcrypt password hashing
- **Real-time**: WebSocket native support
- **Container**: Docker + Docker Compose

### Frontend (Admin)
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui + Radix UI
- **Charts**: Recharts
- **State**: Zustand
- **Routing**: React Router

### Frontend (Live)
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State**: Zustand
- **Connection**: WebSocket API

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- (Optional) NVIDIA GPU with CUDA for acceleration
- (Optional) Docker & Docker Compose

### Option 1: Automated Setup

```bash
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

#### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend - Admin
```bash
cd ../frontend-admin
npm install
npm run build
```

#### Frontend - Live
```bash
cd ../frontend-live
npm install
npm run build
```

### Option 3: Docker Compose

```bash
docker-compose up -d
```

## Configuration

Environment variables (`.env` or `docker-compose.yml`):

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (auto) | JWT secret - change in production |
| `DATABASE_URL` | sqlite:// | Database connection string |
| `ENABLE_GPU` | true | Enable GPU acceleration |
| `FACE_RECOGNITION_THRESHOLD` | 0.45 | Recognition confidence threshold |
| `LIVENESS_THRESHOLD` | 0.6 | Liveness detection threshold |
| `ATTENDANCE_COOLDOWN_MINUTES` | 5 | Prevent duplicate attendance |
| `ATTENDANCE_START_TIME` | 09:00 | Work day start |
| `LATE_THRESHOLD_MINUTES` | 15 | Late arrival threshold |
| `MAX_CAMERAS` | 16 | Maximum camera streams |

## Default Credentials

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `admin` | `admin123` |

**Important**: Change the default password after first login.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login and get tokens
- `GET /api/auth/me` - Get current admin info

### Users
- `POST /api/users` - Register new user
- `GET /api/users` - List users with pagination
- `GET /api/users/{id}` - Get user details
- `PUT /api/users/{id}` - Update user
- `DELETE /api/users/{id}` - Delete user
- `POST /api/users/{id}/capture-face` - Capture face sample (base64)

### Cameras
- `POST /api/cameras` - Add camera
- `GET /api/cameras` - List cameras
- `POST /api/cameras/{id}/test` - Test camera connection
- `POST /api/cameras/{id}/start` - Start stream
- `POST /api/cameras/{id}/stop` - Stop stream

### Attendance
- `GET /api/attendance/records` - Get attendance records
- `GET /api/attendance/today/stats` - Today's statistics
- `GET /api/attendance/trends` - Attendance trends
- `GET /api/attendance/export/csv` - Export CSV

### Analytics
- `GET /api/analytics/dashboard` - Dashboard data
- `GET /api/analytics/system-health` - System health

### Training
- `POST /api/training/start` - Start model training
- `GET /api/training/status` - Training status
- `POST /api/training/rebuild-index` - Rebuild recognition index

### WebSocket
- `WS /ws/live-detection/{camera_id}` - Live detection stream
- `WS /ws/camera/{camera_id}` - Raw camera feed
- `WS /ws/attendance` - Attendance events

## Database Schema

### Tables
- **users** - Registered users (employees/students)
- **face_embeddings** - 512-d ArcFace embeddings per user
- **attendance_records** - Attendance log entries
- **cameras** - Camera configurations
- **admin_users** - Admin accounts with RBAC
- **audit_logs** - Security audit trail
- **unknown_detections** - Unknown face detection snapshots
- **system_config** - Dynamic configuration

## Performance Optimization

- **Frame skipping**: Process every Nth frame (configurable)
- **Embedding cache**: In-memory cosine similarity search
- **Threaded capture**: Non-blocking camera streaming
- **WebSocket batching**: Efficient frame encoding
- **Image enhancement**: Adaptive quality improvement

## Security Features

- JWT-based authentication with refresh tokens
- bcrypt password hashing
- Role-based access control (super_admin, admin, viewer)
- Account lockout after failed attempts
- Audit logging for all actions
- Rate limiting on auth endpoints
- Encrypted embedding storage

## Troubleshooting

### Camera not detected
- Check camera permissions: `ls /dev/video*`
- For IP cameras: verify RTSP URL format `rtsp://user:pass@ip:port/stream`
- Test with: `ffplay rtsp://...` or `vlc rtsp://...`

### Model download issues
- InsightFace models auto-download on first run
- Manual download: place in `backend/models/` directory
- Check write permissions for the models directory

### GPU not available
- Set `ENABLE_GPU=false` in environment
- CPU inference is fully supported
- For Docker: use `--gpus all` flag

### Low recognition accuracy
1. Capture better quality face samples (good lighting, frontal pose)
2. Increase `FACE_RECOGNITION_THRESHOLD`
3. Retrain the model after adding users
4. Check for sufficient face samples per user (recommended: 4+)

## License

MIT License - See LICENSE file for details.

## Support

For issues and feature requests, please open an issue in the project repository.
