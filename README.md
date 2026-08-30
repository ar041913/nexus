# NEXUS.ai 🚀

> **KPI Intelligence → Evidence → Decision → Action**

NEXUS.ai is an AI-powered KPI intelligence engine that detects material business movements, identifies drivers, explains them with traceable evidence, communicates uncertainty, and recommends persona-specific actions.

## 🌐 Live Demo

**Frontend:** https://nexus-web-hynh.onrender.com/

**Backend API:** https://nexus-api-kqha.onrender.com/

## ✨ Features

- 📊 KPI monitoring & anomaly detection
- 🔎 Driver analysis & contribution ranking
- 📚 Evidence & data lineage
- 🎯 Confidence scoring
- 🛑 Abstention for insufficient/contradictory evidence
- 👤 CFO vs Supply Chain recommendations
- ⚡ What-if simulation
- 📝 Analyst feedback & learning loop
- 🤖 LLM-powered narrative synthesis

## 🧠 LLM Boundary

The LLM is **not** the source of quantitative truth.

| Task | Method |
|---|---|
| KPI calculation | SQL / DuckDB |
| Detection | Rules + Statistics |
| Driver analysis | Statistics / ML |
| Confidence | Deterministic scoring |
| Simulation | Deterministic logic |
| Evidence | Structured retrieval |
| Narrative | LLM |

## 🔄 Pipeline

```text
SIGNAL → DETECT → EXPLAIN → GROUND → CONFIDENCE
       → NARRATE → DECIDE → SIMULATE → LEARN
