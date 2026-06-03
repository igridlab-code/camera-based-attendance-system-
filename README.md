# 📸 Camera-Based Attendance System

An AI-powered attendance management system that uses facial recognition technology to automatically detect, identify, and record attendance in real time through a camera feed.

## 🚀 Features

- 🎯 Real-time face detection
- 🧠 Face recognition using AI models
- 📋 Automatic attendance marking
- 📅 Attendance history tracking
- 👨‍🎓 Student registration with face enrollment
- 📊 Dashboard for attendance monitoring
- 🔍 Search and filter attendance records
- 📱 Responsive and user-friendly interface

---

## 🏗️ Project Structure

```
camera-based-attendance-system/
│
├── backend/
│   ├── app/
│   ├── models/
│   ├── database/
│   └── api/
│
├── frontend/
│   ├── src/
│   ├── components/
│   └── pages/
│
├── uploads/
├── attendance_records/
├── requirements.txt
├── package.json
└── README.md
```

---

## 🛠️ Technologies Used

### Frontend
- React.js
- Tailwind CSS
- Axios

### Backend
- FastAPI
- Python

### Database
- SQLite / PostgreSQL

### AI & Computer Vision
- OpenCV
- InsightFace
- ONNX Runtime
- NumPy

---

## ⚙️ Installation

### 1. Clone Repository

```bash
git clone https://github.com/igridlab-code/camera-based-attendance-system.git
cd camera-based-attendance-system
```

### 2. Create Virtual Environment

```bash
python -m venv venv
```

Activate Environment:

**Windows**
```bash
venv\Scripts\activate
```

**Linux/Mac**
```bash
source venv/bin/activate
```

### 3. Install Backend Dependencies

```bash
pip install -r requirements.txt
```

### 4. Install Frontend Dependencies

```bash
npm install
```

---

## ▶️ Run Backend

```bash
uvicorn app.main:app --reload
```

Backend URL:

```
http://localhost:8000
```

API Documentation:

```
http://localhost:8000/docs
```

---

## ▶️ Run Frontend

```bash
npm start
```

Frontend URL:

```
http://localhost:3000
```

---

## 📸 How It Works

1. Register students with facial images.
2. Store face embeddings in the database.
3. Start the camera attendance module.
4. Detect and recognize faces in real time.
5. Mark attendance automatically.
6. View attendance records through the dashboard.

---

## 📊 Attendance Workflow

```text
Camera Feed
      ↓
Face Detection
      ↓
Face Recognition
      ↓
Student Identification
      ↓
Attendance Marking
      ↓
Database Storage
```

---

## 🔒 Security Features

- Face embedding storage
- Duplicate attendance prevention
- API validation
- Secure database access

---

## 🎯 Future Enhancements

- QR code attendance backup
- Mobile application support
- Email attendance reports
- Multi-camera integration
- Cloud deployment
- Advanced analytics dashboard

---

## 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to your branch
5. Create a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

**IGridLab Team**

AI-Powered Camera Attendance Management System
