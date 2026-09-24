def test_get_settings_has_defaults(client) -> None:
    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_model"] == "gemma4:26b-a4b-it-qat"


def test_put_settings_partial_update(client) -> None:
    response = client.put("/api/settings", json={"llm_model": "qwen3:14b"})
    assert response.status_code == 200
    assert response.json()["llm_model"] == "qwen3:14b"

    unchanged = client.get("/api/settings").json()
    assert unchanged["llm_base_url"] == "http://localhost:11434/v1"
