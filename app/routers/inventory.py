from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("")
def get_inventory(
    product_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    sql = """
        SELECT p.id, p.sku, p.name, p.unit, p.min_stock,
               l.id, l.code, l.name,
               COALESCE(i.quantity, 0)
        FROM products p
        CROSS JOIN locations l
        LEFT JOIN inventory i ON i.product_id=p.id AND i.location_id=l.id
        WHERE 1=1
    """
    params = []
    if product_id:
        sql += " AND p.id = %s"
        params.append(product_id)
    if location_id:
        sql += " AND l.id = %s"
        params.append(location_id)
    sql += " ORDER BY p.name, l.code"

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    return [
        {
            "product": {"id": r[0], "sku": r[1], "name": r[2], "unit": r[3], "min_stock": r[4]},
            "location": {"id": r[5], "code": r[6], "name": r[7]},
            "quantity": r[8],
            "low_stock": r[8] < r[4],
        }
        for r in rows
    ]
