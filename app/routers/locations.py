from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/locations", tags=["locations"])


class LocationCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


def _row(r):
    return {"id": r[0], "code": r[1], "name": r[2], "description": r[3]}


@router.get("")
def list_locations(conn=Depends(get_db), _=Depends(get_current_user)):
    cur = conn.cursor()
    cur.execute("SELECT id,code,name,description FROM locations ORDER BY code")
    return [_row(r) for r in cur.fetchall()]


@router.post("", status_code=201)
def create_location(body: LocationCreate, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO locations (code,name,description) VALUES (?,?,?) "
            "RETURNING id,code,name,description",
            (body.code, body.name, body.description),
        )
        return _row(cur.fetchone())
    except Exception:
        raise HTTPException(409, "Location code already exists")


@router.put("/{location_id}")
def update_location(location_id: int, body: LocationUpdate, conn=Depends(get_db), _=Depends(require_admin)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=?" for k in fields)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE locations SET {set_clause} WHERE id=? RETURNING id,code,name,description",
        (*fields.values(), location_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Location not found")
    return _row(row)


@router.delete("/{location_id}", status_code=204)
def delete_location(location_id: int, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    cur.execute("DELETE FROM locations WHERE id=? RETURNING id", (location_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Location not found")
