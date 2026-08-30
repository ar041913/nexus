# ⚡ NEXUS.ai Deployment Quick Reference

**Status:** Production-ready for Phase 1 MVP

---

## 🚀 Fastest Start: 3 Options

### Option 1: Local Development (macOS/Linux)
```bash
# 1. Run setup script (automates everything)
bash setup-local.sh

# 2. Terminal 1 - Start backend
source venv/bin/activate && uvicorn apps.api.main:app --reload

# 3. Terminal 2 - Start frontend
cd apps/web && npm run dev

# Access: http://localhost:3000
```

### Option 2: Local Development (Windows)
```powershell
# 1. Run setup script
.\setup-local.ps1

# 2. PowerShell Terminal 1 - Start backend
.\venv\Scripts\Activate.ps1
uvicorn apps.api.main:app --reload

# 3. PowerShell Terminal 2 - Start frontend
cd apps\web
npm run dev

# Access: http://localhost:3000
```

### Option 3: Docker (All Platforms)
```bash
# 1. One command to start everything
docker-compose up -d

# 2. Wait 30 seconds
sleep 30

# 3. Check status
docker-compose ps

# Access: http://localhost:3000
# Stop: docker-compose down
```

---

## ☁️ Deploy to Cloud (Render - Free Tier)

**Total Time: ~10 minutes**

### Step 1: Push to GitHub
```bash
git init && git add . && git commit -m "NEXUS.ai MVP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/nexus-ai.git
git push -u origin main
```

### Step 2: Create Render Account
- Go to https://render.com
- Sign up with GitHub
- Click "New +" → "Web Service"
- Select your repository

### Step 3: Configure Backend
```
Name: nexus-api
Runtime: Python 3
Region: (your region)
Plan: Free
Build: pip install -r requirements.txt
Start: uvicorn apps.api.main:app --host 0.0.0.0 --port $PORT
Health: /health
```

### Step 4: Configure Frontend
```
Name: nexus-web
Runtime: Node
Region: (same as backend)
Plan: Free
Root Dir: apps/web
Build: npm install && npm run build
Start: npm start
```

**Result:** Both services live in ~3 minutes
- Frontend: `https://nexus-web.onrender.com`
- API: `https://nexus-api.onrender.com`

---

## 📋 Pre-Deployment Checklist

- [ ] Python 3.11+ installed
- [ ] Node.js 20+ installed
- [ ] Git configured
- [ ] `.env` file created (or use docker-compose)
- [ ] Tests passing: `pytest tests/ -v`
- [ ] API responds: `curl http://localhost:8000/health`
- [ ] Frontend loads: `curl http://localhost:3000`
- [ ] Database initialized: `fact_sales_daily` has rows

---

## 🔌 Environment Variables

### Minimal `.env` (Development)
```bash
ALLOWED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Complete `.env` (Production)
```bash
# Backend
ALLOWED_ORIGINS=https://nexus-web.onrender.com,https://nexus-api.onrender.com
LLM_API_KEY=sk-...
LOG_LEVEL=INFO

# Frontend
NEXT_PUBLIC_API_URL=https://nexus-api.onrender.com
NODE_ENV=production

# Database (optional)
DATABASE_URL=postgresql://user:pass@host:5432/nexus
```

---

## 📊 Deployment Comparison

| Aspect | Local | Docker | Render |
|--------|-------|--------|--------|
| Setup Time | 5 min | 2 min | 10 min |
| Cost | Free | Free | Free |
| Persistence | Local disk | Volume | Database |
| Scalability | Single machine | Container | Auto-scale |
| For Production | ❌ No | ✅ Yes | ✅ Yes |

---

## 🏥 Health Checks After Deployment

```bash
# Check API health
curl https://nexus-api.onrender.com/health

# Check frontend loads
curl https://nexus-web.onrender.com

# Check telemetry
curl https://nexus-api.onrender.com/api/telemetry/summary | jq .llm

# Test KPI endpoint
curl "https://nexus-api.onrender.com/api/kpis?scenario=revenue_decline&persona=cfo" | jq .
```

---

## 🔧 Common Issues

### Python Module Not Found
```bash
source venv/bin/activate  # Activate virtual environment
pip install --force-reinstall -r requirements.txt
```

### Port Already in Use
```bash
# Kill process (macOS/Linux)
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Windows: Stop Docker Desktop or change ports
docker-compose down
```

### Database Locked
```bash
# Delete and recreate
rm data/nexus.duckdb
python -c "from packages.analytics.engine import get_conn, load_data; conn = get_conn(); load_data(conn); conn.close()"
```

### Frontend Can't Connect to API
```bash
# Check NEXT_PUBLIC_API_URL in .env
cat .env | grep NEXT_PUBLIC_API_URL

# Should match backend URL
# Local: http://localhost:8000
# Remote: https://nexus-api.onrender.com
```

---

## 📚 Documentation Links

| Document | Purpose |
|----------|---------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Complete deployment guide (all options) |
| [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) | What's implemented & status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design & data flow |
| [README.md](README.md) | Project overview |

---

## ✨ API & Frontend URLs After Deployment

### Local Development
```
Frontend:    http://localhost:3000
API:         http://localhost:8000
API Docs:    http://localhost:8000/docs
Health:      http://localhost:8000/health
```

### Docker
```
Frontend:    http://localhost:3000
API:         http://localhost:8000
API Docs:    http://localhost:8000/docs
Database:    localhost:5432 (postgres)
```

### Render Cloud (Example)
```
Frontend:    https://nexus-web.onrender.com
API:         https://nexus-api.onrender.com
API Docs:    https://nexus-api.onrender.com/docs
Health:      https://nexus-api.onrender.com/health
```

---

## 🎯 Next Steps

1. **Choose deployment method** (local, docker, or cloud)
2. **Follow the 3-step Quick Start** above
3. **Verify with health checks**
4. **Read DEPLOYMENT.md** for detailed options
5. **Access API docs** at `/docs` endpoint

---

## 📞 Support

- **Errors?** Check Troubleshooting section above
- **Details?** See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Architecture?** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **What's Built?** See [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)

---

**Ready to deploy? Pick your method above and start in 5 minutes! 🚀**
