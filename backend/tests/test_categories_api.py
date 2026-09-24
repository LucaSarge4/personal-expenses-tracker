from datetime import date

from sqlmodel import Session

from app.db import engine
from app.models import Transaction


def test_list_categories_excludes_archived_by_default(client) -> None:
    response = client.get("/api/categories")
    assert response.status_code == 200
    categories = response.json()
    assert len(categories) > 0
    assert all(not c["archived"] for c in categories)


def test_create_update_archive_category(client) -> None:
    create = client.post(
        "/api/categories",
        json={"name": "Test Cat", "kind": "expense", "color": "#123456"},
    )
    assert create.status_code == 200
    category = create.json()

    update = client.patch(f"/api/categories/{category['id']}", json={"llm_hint": "hint"})
    assert update.status_code == 200
    assert update.json()["llm_hint"] == "hint"

    archive = client.post(f"/api/categories/{category['id']}/archive")
    assert archive.status_code == 200
    assert archive.json()["archived"] is True


def test_reorder_categories(client) -> None:
    categories = client.get("/api/categories").json()
    ids = [c["id"] for c in categories]
    reversed_ids = list(reversed(ids))
    response = client.put("/api/categories/order", json={"ids": reversed_ids})
    assert response.status_code == 200

    reordered = client.get("/api/categories").json()
    assert [c["id"] for c in reordered] == reversed_ids


def test_delete_category_blocked_when_in_use(client) -> None:
    account = client.post("/api/accounts", json={"name": "Delete Cat Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "In Use", "kind": "expense", "color": "#000000"}
    ).json()

    with Session(engine) as session:
        session.add(
            Transaction(
                account_id=account["id"],
                date=date(2026, 1, 1),
                description_raw="test",
                amount_cents=-100,
                category_id=category["id"],
                dedupe_hash="delete-category-test",
            )
        )
        session.commit()

    response = client.delete(f"/api/categories/{category['id']}")
    assert response.status_code == 409


def test_merge_category_reassigns_transactions(client) -> None:
    source = client.post(
        "/api/categories", json={"name": "Merge Source", "kind": "expense", "color": "#111111"}
    ).json()
    target = client.post(
        "/api/categories", json={"name": "Merge Target", "kind": "expense", "color": "#222222"}
    ).json()

    response = client.post(
        f"/api/categories/{source['id']}/merge", json={"target_id": target["id"]}
    )
    assert response.status_code == 200
    assert response.json()["id"] == target["id"]

    get_deleted = client.get("/api/categories?include_archived=true").json()
    assert source["id"] not in [c["id"] for c in get_deleted]
