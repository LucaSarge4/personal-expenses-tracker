def test_create_list_delete_rule(client) -> None:
    category = client.post(
        "/api/categories", json={"name": "Rules API Cat", "kind": "expense", "color": "#a1b2c3"}
    ).json()

    create = client.post(
        "/api/rules", json={"match_text": "esselunga", "category_id": category["id"]}
    )
    assert create.status_code == 200
    rule = create.json()

    listed = client.get("/api/rules").json()
    assert any(r["id"] == rule["id"] for r in listed)

    delete = client.delete(f"/api/rules/{rule['id']}")
    assert delete.status_code == 200

    delete_again = client.delete(f"/api/rules/{rule['id']}")
    assert delete_again.status_code == 404
