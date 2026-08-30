# NEXUS.ai — Deployment Guide

**Version:** 0.1.0  
**Last Updated:** August 30, 2026

This guide covers all deployment options for NEXUS.ai: local development, Docker Compose, and cloud (Render).

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Docker Compose Deployment](#docker-compose-deployment)
4. [Cloud Deployment (Render)](#cloud-deployment-render)
5. [Environment Configuration](#environment-configuration)
6. [Database Setup](#database-setup)
7. [Running & Testing](#running--testing)
8. [Health Checks & Monitoring](#health-checks--monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **OS:** Linux, macOS, or Windows (with WSL2)
- **Git:** Latest version
- **Python:** 3.11+ (for local dev)
- **Node.js:** 20.11+ (for frontend)
- **Docker & Docker Compose:** Latest (for container deployment)
- **RAM:** Minimum 4GB (8GB recommended)
- **Disk Space:** 2GB

### Required Tools

```bash
# macOS (using Homebrew)
brew install python node docker git

# Ubuntu/Debian
sudo apt update && sudo apt install -y python3.11 nodejs docker.io docker-compose git

# Windows
# - Install WSL2: https://docs.microsoft.com/en-us/windows/wsl/install
# - Install Docker Desktop for Windows
# - Install Git for Windows
# - Install Node.js from nodejs.org
# - Install Python 3.11+ from python.org
```

---

## 🚀 Local Development Setup

### Step 1: Clone & Navigate to Project

```bash
git clone <repository-url> nexus-ai
cd nexus-ai
```

### Step 2: Create Python Virtual Environment

```bash
# macOS / Linux
python3.11 -m venv venv
source venv/bin/activate

# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# If you get execution policy error:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Step 3: Install Python Dependencies

```bash
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install -e ".[dev]"  # Install dev dependencies (pytest, etc.)
```

### Step 4: Setup Frontend

```bash
cd apps/web
npm install
cd ../..
```

### Step 5: Initialize Data

```bash
# This creates the DuckDB database and loads seed data
python -c "from packages.analytics.engine import get_conn, load_data; conn = get_conn(); load_data(conn); print('✓ Database initialized'); conn.close()"
```

### Step 6: Create `.env` File

Create `.env` in the project root:

```bash
# ────────────────────────────────────────────────────────────
# NEXUS.ai Development Environment
# ────────────────────────────────────────────────────────────

# Backend API
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
LLM_API_KEY=          # Optional: Set for LLM features

# Database (optional for local dev, uses DuckDB by default)
POSTGRES_USER=nexus
POSTGRES_PASSWORD=nexus_dev_password
POSTGRES_DB=nexus
POSTGRES_PORT=5432

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NODE_ENV=development
```

### Step 7: Start Backend API

```bash
# Terminal 1: Backend
cd nexus-ai-master
source venv/bin/activate  # or .\venv\Scripts\Activate.ps1 on Windows
uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

### Step 8: Start Frontend (New Terminal)

```bash
# Terminal 2: Frontend
cd nexus-ai-master/apps/web
npm run dev
```

Expected output:
```
  ▲ Next.js 15.1.0
  - Local:        http://localhost:3000
```

### Step 9: Access Application

- **Frontend:** http://localhost:3000
- **API Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

### Step 10: Run Tests

```bash
# Terminal 3: Tests
cd nexus-ai-master
pytest tests/unit/test_health.py -v
pytest tests/unit/test_mvp.py -v
```

---

## 🐳 Docker Compose Deployment

### Quick Start (Complete Stack)

```bash
# Navigate to project root
cd nexus-ai-master

# Start all services (backend, frontend, PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Reset data (warning: deletes PostgreSQL data)
docker-compose down -v
```

### What Gets Deployed

| Service | Port | Image | Purpose |
|---------|------|-------|---------|
| **nexus-api** | 8000 | python:3.11-slim | FastAPI backend |
| **nexus-web** | 3000 | node:20-alpine | Next.js frontend |
| **postgres** | 5432 | postgres:16-alpine | State persistence (optional) |

### Custom Configuration

Create `.env` file for Docker:

```bash
# Backend
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
LLM_API_KEY=sk-...

# Database
POSTGRES_USER=nexus
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_DB=nexus
POSTGRES_PORT=5432

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### View Service Status

```bash
# List running containers
docker-compose ps

# View backend logs
docker-compose logs nexus-api

# View frontend logs
docker-compose logs nexus-web

# View database logs
docker-compose logs postgres

# Follow real-time logs
docker-compose logs -f
```

### Manual Docker Build (Alternative)

If you need to rebuild images:

```bash
# Backend
docker build -t nexus-api:latest -f Dockerfile.api .

# Frontend
docker build -t nexus-web:latest -f Dockerfile.web apps/web/

# Database (using standard postgres image)
docker run -d --name nexus-postgres \
  -e POSTGRES_USER=nexus \
  -e POSTGRES_PASSWORD=nexus_dev_password \
  -p 5432:5432 \
  postgres:16-alpine
```

---

## ☁️ Cloud Deployment (Render)

### Prerequisites

- Render account: https://render.com (free tier available)
- GitHub repository (push code to GitHub first)

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: NEXUS.ai MVP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/nexus-ai.git
git push -u origin main
```

### Step 2: Create Render Account & Connect GitHub

1. Go to https://render.com
2. Sign up / Log in
3. Click **"New +"** → **"Web Service"**
4. Select your GitHub repository
5. Click **"Connect"**

### Step 3: Configure Backend Service (API)

**Name:** `nexus-api`  
**Runtime:** Python 3  
**Region:** Choose closest to users  
**Plan:** Free (for testing)

**Environment Variables:**
```
ALLOWED_ORIGINS=https://nexus-web.onrender.com,https://nexus-api.onrender.com
LLM_API_KEY=sk-...
PYTHON_VERSION=3.11
```

**Build Command:**
```bash
pip install -r requirements.txt
```

**Start Command:**
```bash
uvicorn apps.api.main:app --host 0.0.0.0 --port $PORT
```

**Auto-Deploy:** Enable from GitHub (`main` branch)  
**Health Check:** `/health`

### Step 4: Configure Frontend Service (Web)

**Name:** `nexus-web`  
**Runtime:** Node  
**Region:** Same as API  
**Plan:** Free (for testing)  
**Root Directory:** `apps/web`

**Environment Variables:**
```
NODE_VERSION=20.11.0
NEXT_PUBLIC_API_URL=https://nexus-api.onrender.com
```

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start
```

### Step 5: Deploy Database (PostgreSQL on Render)

1. Go to **Databases** → **New Database**
2. Name: `nexus-postgres`
3. Database: `nexus`
4. Region: Same as services
5. Copy connection string
6. Add to API environment variables:

```
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

### Step 6: Wait for Deployment

- Both services show **"Live"** (takes ~3 minutes)
- Frontend URL: `https://nexus-web.onrender.com`
- API URL: `https://nexus-api.onrender.com`

### Step 7: Initialize Database

Run seed data on Render:

```bash
# SSH into backend (via Render dashboard)
curl -X GET https://nexus-api.onrender.com/health

# Trigger data initialization via API
curl -X POST https://nexus-api.onrender.com/api/init
```

### Auto-Deploy on Commit

Render automatically deploys when you push to `main`:

```bash
git add .
git commit -m "Fix: Updated KPI contracts"
git push origin main  # Render redeploys automatically
```

### Monitor Deployments

- Render Dashboard: https://dashboard.render.com
- View logs for each service
- Real-time deployment status
- Rollback if needed

---

## ⚙️ Environment Configuration

### Backend Environment Variables

```bash
# API & CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000  # Comma-separated
PORT=8000                                                      # Default port

# LLM Configuration (Optional)
LLM_API_KEY=sk-...                                            # OpenAI API key
LLM_MODEL=gpt-4o-mini                                         # Default model
LLM_FALLBACK=true                                             # Use template if LLM fails

# Database (Optional - uses DuckDB locally by default)
DATABASE_URL=postgresql://user:pass@localhost:5432/nexus     # PostgreSQL connection
POSTGRES_USER=nexus
POSTGRES_PASSWORD=password
POSTGRES_DB=nexus
POSTGRES_PORT=5432

# Logging
LOG_LEVEL=INFO                                                 # DEBUG, INFO, WARNING, ERROR

# Data Paths
DATA_DIR=./data/seeds                                         # Seed data directory
DB_PATH=./data/nexus.duckdb                                   # DuckDB file location
```

### Frontend Environment Variables

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000                     # Backend API URL
NEXT_PUBLIC_API_TIMEOUT=30000                                 # Request timeout (ms)

# Environment
NODE_ENV=production                                            # development or production
NEXT_PUBLIC_APP_NAME=NEXUS.ai                                 # App display name

# Analytics (Optional)
NEXT_PUBLIC_GA_ID=                                             # Google Analytics ID
```

### Load from `.env` File

```bash
# .env
ALLOWED_ORIGINS=http://localhost:3000
LLM_API_KEY=sk-test123
NEXT_PUBLIC_API_URL=http://localhost:8000

# Backend reads from .env automatically
# Frontend uses NEXT_PUBLIC_* variables
```

---

## 🗄️ Database Setup

### Option 1: DuckDB (Local Development - Default)

**No setup needed.** DuckDB creates `data/nexus.duckdb` automatically.

```bash
# Initialize data
python -c "from packages.analytics.engine import get_conn, load_data; conn = get_conn(); load_data(conn); conn.close()"

# Verify
python -c "from packages.analytics.engine import get_conn, SCENARIOS; conn = get_conn(); print(conn.execute('SELECT COUNT(*) FROM fact_sales_daily').fetchone()[0]); conn.close()"
```

### Option 2: PostgreSQL (Production)

#### Local PostgreSQL Setup

```bash
# macOS
brew install postgresql
brew services start postgresql
createdb nexus

# Ubuntu
sudo apt install postgresql
sudo service postgresql start
sudo -u postgres createdb nexus

# Windows (using Docker)
docker run -d --name nexus-postgres \
  -e POSTGRES_DB=nexus \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:16-alpine
```

#### Connect Backend to PostgreSQL

Update `.env`:
```bash
DATABASE_URL=postgresql://nexus:password@localhost:5432/nexus
```

#### Load Schema

```bash
# Backend will create tables on first run
python -c "from packages.analytics.ingest.foundation import build_foundation; from packages.analytics.engine import get_conn; conn = get_conn(); build_foundation(conn); conn.close()"
```

### Backup & Restore

```bash
# Backup DuckDB
cp data/nexus.duckdb data/nexus.duckdb.backup

# Backup PostgreSQL
pg_dump -U nexus nexus > nexus_backup.sql

# Restore PostgreSQL
psql -U nexus nexus < nexus_backup.sql
```

---

## ▶️ Running & Testing

### Start Full Stack (Docker Compose)

```bash
docker-compose up -d
# Wait 30 seconds for services to start
sleep 30
docker-compose ps
```

### Start Full Stack (Local Dev)

**Terminal 1: Backend**
```bash
cd nexus-ai-master
source venv/bin/activate
uvicorn apps.api.main:app --reload --port 8000
```

**Terminal 2: Frontend**
```bash
cd nexus-ai-master/apps/web
npm run dev
```

### Run Tests

```bash
cd nexus-ai-master

# Unit tests
pytest tests/unit/test_health.py -v

# End-to-end tests
pytest tests/unit/test_mvp.py -v

# All tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=packages --cov=apps
```

### Verify Installation

```bash
# Check Python version
python --version  # Should be 3.11+

# Check Node version
node --version    # Should be 20+

# Check dependencies
pip list | grep -E "fastapi|duckdb|pandas"

# Check database connection
python -c "from packages.analytics.engine import get_conn; conn = get_conn(); print('✓ DB connected'); conn.close()"

# Check API
curl http://localhost:8000/health

# Check frontend
curl http://localhost:3000
```

---

## 🏥 Health Checks & Monitoring

### API Health Endpoint

```bash
# Local
curl http://localhost:8000/health

# Response
{
  "status": "healthy",
  "timestamp": "2026-08-30T12:00:00Z"
}
```

### Database Health

```bash
# Check data load
curl http://localhost:8000/api/kpis?scenario=revenue_decline&persona=cfo

# Check telemetry
curl http://localhost:8000/api/telemetry/summary | jq .llm
```

### Frontend Health

```bash
# Check compilation
curl http://localhost:3000

# Response: HTML page with NEXUS.ai dashboard
```

### Docker Container Health

```bash
# Status of all services
docker-compose ps

# View container logs
docker-compose logs --tail=50 nexus-api

# Check specific service
docker-compose exec nexus-api curl http://localhost:8000/health

# Resource usage
docker stats
```

### Performance Monitoring

```bash
# Telemetry summary
curl http://localhost:8000/api/telemetry/summary | jq .latency_ms

# Sample response
{
  "p50": 45.23,
  "p95": 120.56,
  "max": 245.89
}
```

---

## 🔧 Troubleshooting

### Problem: Port Already in Use

```bash
# Find process using port 8000
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill process (example for macOS)
kill -9 <PID>

# Or use different port
uvicorn apps.api.main:app --port 8001
```

### Problem: Python Module Not Found

```bash
# Make sure virtual environment is activated
source venv/bin/activate  # macOS/Linux
.\venv\Scripts\Activate.ps1  # Windows

# Reinstall dependencies
pip install --force-reinstall -r requirements.txt
```

### Problem: Node Modules Error

```bash
# Clean and reinstall
cd apps/web
rm -rf node_modules package-lock.json
npm install
```

### Problem: DuckDB Database Locked

```bash
# Kill all Python processes
pkill -f python

# Or delete and recreate
rm data/nexus.duckdb
python -c "from packages.analytics.engine import get_conn, load_data; conn = get_conn(); load_data(conn); conn.close()"
```

### Problem: API Returns 500 Error

```bash
# Check backend logs
docker-compose logs nexus-api

# Or terminal output for uvicorn

# Check database connection
python -c "from packages.analytics.engine import get_conn; print(get_conn())"

# Verify .env file exists
ls -la .env
```

### Problem: Frontend Can't Connect to API

```bash
# Check NEXT_PUBLIC_API_URL in .env
cat .env | grep NEXT_PUBLIC_API_URL

# Check CORS settings
curl -H "Origin: http://localhost:3000" http://localhost:8000/health

# Check browser console for errors (F12)
```

### Problem: Docker Compose Won't Start

```bash
# Check Docker is running
docker --version
docker ps

# Rebuild images
docker-compose build --no-cache

# Check for port conflicts
docker ps -a  # Look for stopped containers using needed ports

# Remove conflicting containers
docker rm nexus-api nexus-web nexus-postgres
docker-compose up -d
```

### Problem: Out of Memory

```bash
# Increase Docker memory limit (Docker Desktop settings)
# Or limit container memory in docker-compose.yml:

services:
  nexus-api:
    # ... other config ...
    deploy:
      resources:
        limits:
          memory: 2G
```

### Problem: Slow Performance

```bash
# Check resource usage
docker stats

# Check telemetry
curl http://localhost:8000/api/telemetry/summary | jq .latency_ms

# Optimize:
# 1. Use PostgreSQL instead of DuckDB for large datasets
# 2. Scale to multiple API instances (load balancer needed)
# 3. Cache KPI results in Redis (future enhancement)
```

### Enable Debug Logging

```bash
# Backend
LOG_LEVEL=DEBUG uvicorn apps.api.main:app --reload

# Frontend
NEXT_DEBUG=true npm run dev

# Docker
docker-compose up -d
docker-compose logs -f --tail=100
```

---

## 📊 Quick Reference

### Start Local Dev
```bash
# Terminal 1
source venv/bin/activate && uvicorn apps.api.main:app --reload

# Terminal 2
cd apps/web && npm run dev
```

### Start Docker
```bash
docker-compose up -d && docker-compose ps
```

### Deploy to Render
```bash
git push origin main  # Auto-deploys
```

### Run Tests
```bash
pytest tests/ -v
```

### Check Health
```bash
curl http://localhost:8000/health
curl http://localhost:3000
```

### View Logs
```bash
docker-compose logs -f nexus-api
```

---

## 📞 Support

### Common URLs

| Environment | Frontend | API | Docs |
|-------------|----------|-----|------|
| Local Dev | http://localhost:3000 | http://localhost:8000 | http://localhost:8000/docs |
| Docker | http://localhost:3000 | http://localhost:8000 | http://localhost:8000/docs |
| Render (Example) | https://nexus-web.onrender.com | https://nexus-api.onrender.com | https://nexus-api.onrender.com/docs |

### Documentation

- **Architecture:** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Implementation Checklist:** See [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)
- **API Reference:** Access `/docs` endpoint at runtime (Swagger UI)
- **Code:** See [packages/](packages/) and [apps/](apps/)

---

## ✅ Deployment Checklist

Before going live:

- [ ] Environment variables configured (`.env` or cloud provider)
- [ ] Database initialized and tested
- [ ] Health checks passing
- [ ] Tests passing locally
- [ ] API docs accessible at `/docs`
- [ ] Frontend loads without errors
- [ ] CORS settings correct
- [ ] LLM API key configured (if using LLM features)
- [ ] Database backups configured
- [ ] Monitoring/logging enabled
- [ ] Security review completed

---

**Last Updated:** August 30, 2026  
**Status:** Production-ready for Phase 1 MVP