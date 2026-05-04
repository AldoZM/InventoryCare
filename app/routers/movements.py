from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/movements", tags=["movements"])


class MovementIn(BaseModel):
    product_id: int
    location_id: int
    quantity: int
    reference: Optional[str] = None
    notes: Optional[str] = None


class MovementOut(BaseModel):
    product_id: int
    location_id: int
    quantity: int
    reference: Optional[str] = None
    notes: Optional[str] = None


class MovementTransfer(BaseModel):
    product_id: int
    from_location_id: int
    to_location_id: int
    quantity: int
    reference: Optional[str] = None
    notes: Optional[str] = None


def _upsert_inventory(cur, product_id, location_id, delta):
    cur.execute(
        """
        INSERT INTO inventory (product_id, location_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET quantity = inventory.quantity + excluded.quantity
        """,
        (product_id, location_id, delta),
    )


def _check_stock(cur, product_id, location_id, quantity):
    cur.execute(
        "SELECT COALESCE(quantity,0) FROM inventory WHERE product_id=? AND location_id=?",
        (product_id, location_id),
    )
    row = cur.fetchone()
    stock = row[0] if row else 0
    if stock < quantity:
        raise HTTPException(400, f"Insufficient stock: available {stock}, requested {quantity}")


@router.post("/in", status_code=201)
def movement_in(body: MovementIn, conn=Depends(get_db), user=Depends(get_current_user)):
    cur = conn.cursor()
    _upsert_inventory(cur, body.product_id, body.location_id, body.quantity)
    cur.execute(
        "INSERT INTO movements (product_id,location_id,type,quantity,reference,notes,user_id) "
        "VALUES (?,?,'IN',?,?,?,?) RETURNING id,created_at",
        (body.product_id, body.location_id, body.quantity, body.reference, body.notes, user["sub"]),
    )
    row = cur.fetchone()
    return {"id": row[0], "type": "IN", "created_at": row[1]}


@router.post("/out", status_code=201)
def movement_out(body: MovementOut, conn=Depends(get_db), user=Depends(get_current_user)):
    cur = conn.cursor()
    _check_stock(cur, body.product_id, body.location_id, body.quantity)
    _upsert_inventory(cur, body.product_id, body.location_id, -body.quantity)
    cur.execute(
        "INSERT INTO movements (product_id,location_id,type,quantity,reference,notes,user_id) "
        "VALUES (?,?,'OUT',?,?,?,?) RETURNING id,created_at",
        (body.product_id, body.location_id, body.quantity, body.reference, body.notes, user["sub"]),
    )
    row = cur.fetchone()
    return {"id": row[0], "type": "OUT", "created_at": row[1]}


@router.post("/transfer", status_code=201)
def movement_transfer(body: MovementTransfer, conn=Depends(get_db), user=Depends(get_current_user)):
    if body.from_location_id == body.to_location_id:
        raise HTTPException(400, "Source and destination must be different")
    cur = conn.cursor()
    _check_stock(cur, body.product_id, body.from_location_id, body.quantity)
    _upsert_inventory(cur, body.product_id, body.from_location_id, -body.quantity)
    _upsert_inventory(cur, body.product_id, body.to_location_id, body.quantity)
    cur.execute(
        "INSERT INTO movements (product_id,location_id,type,quantity,reference,notes,user_id) "
        "VALUES (?,?,'TRANSFER',?,?,?,?) RETURNING id,created_at",
        (body.product_id, body.from_location_id, body.quantity, body.reference, body.notes, user["sub"]),
    )
    row = cur.fetchone()
    return {"id": row[0], "type": "TRANSFER", "created_at": row[1]}


@router.get("")
def list_movements(
    product_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    sql = """
        SELECT m.id, p.sku, p.name, l.code, m.type, m.quantity,
               m.reference, m.notes, u.username, m.created_at
        FROM movements m
        JOIN products p ON p.id = m.product_id
        JOIN locations l ON l.id = m.location_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE 1=1
    """
    params = []
    if product_id:
        sql += " AND m.product_id=?"; params.append(product_id)
    if location_id:
        sql += " AND m.location_id=?"; params.append(location_id)
    if user_id:
        sql += " AND m.user_id=?"; params.append(user_id)
    if from_date:
        sql += " AND m.created_at >= ?"; params.append(from_date)
    if to_date:
        sql += " AND m.created_at <= ?"; params.append(to_date)
    sql += " ORDER BY m.created_at DESC LIMIT 500"

    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()

    return [
        {
            "id": r[0], "product_sku": r[1], "product_name": r[2],
            "location_code": r[3], "type": r[4], "quantity": r[5],
            "reference": r[6], "notes": r[7], "user": r[8], "created_at": r[9],
        }
        for r in rows
    ]
