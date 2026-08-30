#!/bin/bash
# NEXUS.ai Local Development Quick Start
# Platforms: macOS, Linux, Windows (WSL2)

set -e

echo "🚀 NEXUS.ai Local Development Setup"
echo "===================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Python
echo -e "\n${YELLOW}Checking Python version...${NC}"
if ! command -v python3.11 &> /dev/null; then
    echo -e "${RED}✗ Python 3.11+ not found${NC}"
    echo "Install from: https://www.python.org/downloads/"
    exit 1
fi
PYTHON_VERSION=$(python3.11 --version)
echo -e "${GREEN}✓ $PYTHON_VERSION${NC}"

# Check Node
echo -e "\n${YELLOW}Checking Node version...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node $NODE_VERSION${NC}"

# Create virtual environment
echo -e "\n${YELLOW}Setting up Python virtual environment...${NC}"
if [ ! -d "venv" ]; then
    python3.11 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

# Activate venv
source venv/bin/activate 2>/dev/null || . venv/Scripts/activate 2>/dev/null || {
    echo -e "${RED}✗ Failed to activate virtual environment${NC}"
    exit 1
}
echo -e "${GREEN}✓ Virtual environment activated${NC}"

# Install Python dependencies
echo -e "\n${YELLOW}Installing Python dependencies...${NC}"
pip install --quiet --upgrade pip setuptools wheel
pip install --quiet -r requirements.txt
pip install --quiet -e ".[dev]"
echo -e "${GREEN}✓ Python dependencies installed${NC}"

# Install frontend dependencies
echo -e "\n${YELLOW}Installing Node dependencies...${NC}"
cd apps/web
npm install --silent
cd ../..
echo -e "${GREEN}✓ Node dependencies installed${NC}"

# Initialize database
echo -e "\n${YELLOW}Initializing DuckDB database...${NC}"
python3 << 'EOF'
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
EOF

echo -e "${GREEN}✓ Database initialized${NC}"

# Create .env file if it doesn't exist
echo -e "\n${YELLOW}Checking .env configuration...${NC}"
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
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
EOF
    echo -e "${GREEN}✓ .env file created${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Verify installation
echo -e "\n${YELLOW}Verifying installation...${NC}"

# Check DuckDB
python3 -c "
from packages.analytics.engine import get_conn
conn = get_conn()
count = conn.execute('SELECT COUNT(*) FROM fact_sales_daily').fetchone()[0]
conn.close()
print(f'  - DuckDB has {count} sales records ✓')
" || {
    echo -e "${RED}  ✗ Database verification failed${NC}"
    exit 1
}

# Verify contracts
python3 -c "
from packages.contracts import load_contracts
contracts = load_contracts()
print(f'  - {len(contracts)} KPI contracts loaded ✓')
" || {
    echo -e "${RED}  ✗ Contract loading failed${NC}"
    exit 1
}

echo -e "\n${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo -e "\n${GREEN}Terminal 1 - Start Backend:${NC}"
echo "  uvicorn apps.api.main:app --reload --port 8000"

echo -e "\n${GREEN}Terminal 2 - Start Frontend:${NC}"
echo "  cd apps/web && npm run dev"

echo -e "\n${GREEN}Terminal 3 - Run Tests:${NC}"
echo "  pytest tests/unit/test_mvp.py -v"

echo -e "\n${GREEN}Access:${NC}"
echo "  Frontend:  http://localhost:3000"
echo "  API:       http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"

echo -e "\n${YELLOW}Documentation:${NC}"
echo "  Deployment Guide: DEPLOYMENT.md"
echo "  Implementation:   IMPLEMENTATION_CHECKLIST.md"
echo "  Architecture:     docs/ARCHITECTURE.md"
echo ""
