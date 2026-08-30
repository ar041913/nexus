# NEXUS.ai Local Development Quick Start (Windows PowerShell)
# Requires: Python 3.11+, Node.js 20+, Git

param(
    [switch]$Help
)

if ($Help) {
    Write-Host @"
NEXUS.ai Local Development Setup (Windows)

Usage: .\setup-local.ps1

Prerequisites:
  - Python 3.11+
  - Node.js 20+
  - Git

This script will:
  1. Check Python and Node.js versions
  2. Create Python virtual environment
  3. Install Python dependencies
  4. Install Node dependencies
  5. Initialize DuckDB database
  6. Create .env configuration

For more details, see DEPLOYMENT.md
"@
    exit 0
}

$ErrorActionPreference = "Stop"

Write-Host "🚀 NEXUS.ai Local Development Setup (Windows)`n" -ForegroundColor Cyan

# Check Python
Write-Host "Checking Python version..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Python not found"
    }
    Write-Host "✓ $pythonVersion`n" -ForegroundColor Green
} catch {
    Write-Host "✗ Python 3.11+ not found`n" -ForegroundColor Red
    Write-Host "Install from: https://www.python.org/downloads/`n"
    exit 1
}

# Check Node
Write-Host "Checking Node version..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Node not found"
    }
    Write-Host "✓ Node $nodeVersion`n" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found`n" -ForegroundColor Red
    Write-Host "Install from: https://nodejs.org/`n"
    exit 1
}

# Create virtual environment
Write-Host "Setting up Python virtual environment..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    python -m venv venv
    Write-Host "✓ Virtual environment created`n" -ForegroundColor Green
} else {
    Write-Host "✓ Virtual environment already exists`n" -ForegroundColor Green
}

# Activate venv
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"
Write-Host "✓ Virtual environment activated`n" -ForegroundColor Green

# Install Python dependencies
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
pip install --quiet --upgrade pip setuptools wheel
pip install --quiet -r requirements.txt
pip install --quiet -e ".[dev]"
Write-Host "✓ Python dependencies installed`n" -ForegroundColor Green

# Install frontend dependencies
Write-Host "Installing Node dependencies..." -ForegroundColor Yellow
Push-Location "apps/web"
npm install --silent
Pop-Location
Write-Host "✓ Node dependencies installed`n" -ForegroundColor Green

# Initialize database
Write-Host "Initializing DuckDB database..." -ForegroundColor Yellow
python @"
from packages.analytics.engine import get_conn, load_data
from packages.analytics.ingest.foundation import build_foundation

print("  - Creating database connection...", end="", flush=True)
conn = get_conn()
print(" ✓")

print("  - Loading seed data...", end="", flush=True)
load_data(conn)
print(" ✓")

print("  - Building foundation (lineage, freshness, quality)...", end="", flush=True)
build_foundation(conn)
print(" ✓")

conn.close()
print("  - Database ready ✓")
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Database initialization failed`n" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Database initialized`n" -ForegroundColor Green

# Create .env file
Write-Host "Checking .env configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    @"
# ────────────────────────────────────────────────────────────
# NEXUS.ai Development Environment
# ────────────────────────────────────────────────────────────

# Backend API
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
LLM_API_KEY=

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NODE_ENV=development

# Database (optional)
POSTGRES_USER=nexus
POSTGRES_PASSWORD=nexus_dev_password
POSTGRES_DB=nexus
POSTGRES_PORT=5432
"@ | Out-File -Encoding UTF8 ".env"
    Write-Host "✓ .env file created`n" -ForegroundColor Green
} else {
    Write-Host "✓ .env file already exists`n" -ForegroundColor Green
}

# Verify installation
Write-Host "Verifying installation..." -ForegroundColor Yellow

try {
    $dbTest = python -c "
from packages.analytics.engine import get_conn
conn = get_conn()
count = conn.execute('SELECT COUNT(*) FROM fact_sales_daily').fetchone()[0]
conn.close()
print(f'Database has {count} sales records')
" 2>&1

    Write-Host "  - DuckDB: $dbTest ✓" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Database verification failed" -ForegroundColor Red
    exit 1
}

try {
    $contractTest = python -c "
from packages.contracts import load_contracts
contracts = load_contracts()
print(f'{len(contracts)} KPI contracts loaded')
" 2>&1

    Write-Host "  - Contracts: $contractTest ✓`n" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Contract loading failed" -ForegroundColor Red
    exit 1
}

Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✓ Setup Complete!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════`n" -ForegroundColor Green

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "PowerShell Terminal 1 - Start Backend:" -ForegroundColor Green
Write-Host "  .\venv\Scripts\Activate.ps1"
Write-Host "  uvicorn apps.api.main:app --reload --port 8000"
Write-Host ""
Write-Host "PowerShell Terminal 2 - Start Frontend:" -ForegroundColor Green
Write-Host "  cd apps\web"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "PowerShell Terminal 3 - Run Tests:" -ForegroundColor Green
Write-Host "  .\venv\Scripts\Activate.ps1"
Write-Host "  pytest tests\unit\test_mvp.py -v"
Write-Host ""
Write-Host "Access:" -ForegroundColor Green
Write-Host "  Frontend:  http://localhost:3000"
Write-Host "  API:       http://localhost:8000"
Write-Host "  API Docs:  http://localhost:8000/docs"
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  Deployment Guide: DEPLOYMENT.md"
Write-Host "  Implementation:   IMPLEMENTATION_CHECKLIST.md"
Write-Host "  Architecture:     docs\ARCHITECTURE.md"
Write-Host ""
