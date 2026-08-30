"""FastAPI health endpoint tests."""

from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "nexus-api"}


def test_health_content_type_is_json() -> None:
    response = client.get("/health")
    assert "application/json" in response.headers["content-type"]
