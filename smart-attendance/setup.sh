#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
ADMIN_DIR="$PROJECT_ROOT/frontend-admin"
LIVE_DIR="$PROJECT_ROOT/frontend-live"

if [ -d "$SCRIPT_DIR/frontend-admin" ]; then
    ADMIN_DIR="$SCRIPT_DIR/frontend-admin"
fi

if [ -d "$SCRIPT_DIR/frontend-live" ]; then
    LIVE_DIR="$SCRIPT_DIR/frontend-live"
fi

echo "============================================================"
echo "  Smart Attendance AI - Installation Script"
echo "============================================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[*]${NC} $1"; }
print_success() { echo -e "${GREEN}[+]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[-]${NC} $1"; }

# Check Python
print_status "Checking Python version..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    print_success "Python $PYTHON_VERSION found"
else
    print_error "Python 3 is required but not installed"
    exit 1
fi

# Check Node.js
print_status "Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js $NODE_VERSION found"
else
    print_error "Node.js is required for frontend builds"
    print_status "Install Node.js from https://nodejs.org/"
    exit 1
fi

# Create directories
print_status "Creating directories..."
mkdir -p "$BACKEND_DIR/data" "$BACKEND_DIR/models" "$BACKEND_DIR/snapshots"
print_success "Directories created"

# Backend setup
print_status "Setting up Python backend..."
cd "$BACKEND_DIR"

if [ ! -d "venv" ]; then
    print_status "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

print_status "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

print_success "Backend dependencies installed"

# Frontend setup - Admin
print_status "Setting up Admin Frontend..."
cd "$ADMIN_DIR"

if [ ! -d "node_modules" ]; then
    print_status "Installing npm dependencies for admin frontend..."
    npm install
fi

print_status "Building admin frontend..."
npm run build
print_success "Admin frontend built"

# Frontend setup - Live
print_status "Setting up Live Frontend..."
cd "$LIVE_DIR"

if [ ! -d "node_modules" ]; then
    print_status "Installing npm dependencies for live frontend..."
    npm install
fi

print_status "Building live frontend..."
npm run build
print_success "Live frontend built"
cd "$SCRIPT_DIR"

echo ""
echo "============================================================"
echo -e "${GREEN}  Installation Complete!${NC}"
echo "============================================================"
echo ""
echo "Default admin credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "To start the system:"
echo ""
echo "  Option 1 - Direct Python:"
echo "    cd backend"
echo "    source venv/bin/activate"
echo "    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
echo ""
echo "  Option 2 - Docker Compose:"
echo "    docker-compose up -d"
echo ""
echo "  Access points:"
echo "    Admin Dashboard:  http://localhost:8000 (or port 80 with nginx)"
echo "    Live Monitoring:  http://localhost:81 (with nginx)"
echo "    API Docs:         http://localhost:8000/docs"
echo ""
echo "============================================================"
