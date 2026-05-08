from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str = "pcs"
    min_stock: int = 0
    price: Optional[float] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    min_stock: Optional[int] = None
    price: Optional[float] = None


def _row_to_dict(r):
    return {
        "id": r["id"], "sku": r["sku"], "name": r["name"],
        "description": r["description"], "category": r["category"],
        "unit": r["unit"], "min_stock": r["min_stock"],
        "price": r["price"], "created_at": r["created_at"],
    }


@router.get("")
def list_products(
    search: Optional[str] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    cur = conn.cursor()
    if search:
        cur.execute(
            "SELECT id,sku,name,description,category,unit,min_stock,price,created_at "
            "FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY name",
            (f"%{search}%", f"%{search}%"),
        )
    else:
        cur.execute(
            "SELECT id,sku,name,description,category,unit,min_stock,price,created_at "
            "FROM products ORDER BY name"
        )
    return [_row_to_dict(r) for r in cur.fetchall()]


@router.post("", status_code=201)
def create_product(body: ProductCreate, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO products (sku,name,description,category,unit,min_stock,price) "
            "VALUES (?,?,?,?,?,?,?) "
            "RETURNING id,sku,name,description,category,unit,min_stock,price,created_at",
            (body.sku, body.name, body.description, body.category,
             body.unit, body.min_stock, body.price),
        )
        return _row_to_dict(cur.fetchone())
    except Exception:
        raise HTTPException(409, "SKU already exists")


@router.put("/{product_id}")
def update_product(product_id: int, body: ProductUpdate, conn=Depends(get_db), _=Depends(require_admin)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=?" for k in fields)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE products SET {set_clause} WHERE id=? "
        "RETURNING id,sku,name,description,category,unit,min_stock,price,created_at",
        (*fields.values(), product_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Product not found")
    return _row_to_dict(row)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE id=? RETURNING id", (product_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Product not found")
