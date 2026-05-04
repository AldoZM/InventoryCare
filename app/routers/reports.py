from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/stock")
def report_stock(conn=Depends(get_db), _=Depends(get_current_user)):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT p.sku, p.name, p.unit, p.category,
                   COALESCE(SUM(i.quantity), 0) AS total
            FROM products p
            LEFT JOIN inventory i ON i.product_id = p.id
            GROUP BY p.id, p.sku, p.name, p.unit, p.category
            ORDER BY p.name
        """)
        rows = cur.fetchall()
    return [
        {"sku": r[0], "name": r[1], "unit": r[2], "category": r[3], "total_stock": r[4]}
        for r in rows
    ]


@router.get("/low-stock")
def report_low_stock(conn=Depends(get_db), _=Depends(get_current_user)):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT p.sku, p.name, p.unit, p.min_stock,
                   COALESCE(SUM(i.quantity), 0) AS total
            FROM products p
            LEFT JOIN inventory i ON i.product_id = p.id
            GROUP BY p.id, p.sku, p.name, p.unit, p.min_stock
            HAVING COALESCE(SUM(i.quantity), 0) < p.min_stock
            ORDER BY p.name
        """)
        rows = cur.fetchall()
    return [
        {"sku": r[0], "name": r[1], "unit": r[2], "min_stock": r[3], "total_stock": r[4]}
        for r in rows
    ]


@router.get("/movements")
def report_movements(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    sql = """
        SELECT m.type, COUNT(*), SUM(m.quantity),
               DATE_TRUNC('day', m.created_at) AS day
        FROM movements m
        WHERE 1=1
    """
    params = []
    if from_date:
        sql += " AND m.created_at >= %s"; params.append(from_date)
    if to_date:
        sql += " AND m.created_at <= %s"; params.append(to_date)
    sql += " GROUP BY m.type, day ORDER BY day DESC, m.type"

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    return [
        {"type": r[0], "count": r[1], "total_quantity": r[2], "day": r[3]}
        for r in rows
    ]
