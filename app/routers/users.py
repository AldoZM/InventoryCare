from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import require_admin, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "operator"


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None


@router.get("")
def list_users(conn=Depends(get_db), _=Depends(require_admin)):
    with conn.cursor() as cur:
        cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
        rows = cur.fetchall()
    return [{"id": r[0], "username": r[1], "role": r[2], "created_at": r[3]} for r in rows]


@router.post("", status_code=201)
def create_user(body: UserCreate, conn=Depends(get_db), _=Depends(require_admin)):
    if body.role not in ("admin", "operator"):
        raise HTTPException(400, "role must be admin or operator")
    with conn.cursor() as cur:
        try:
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s) RETURNING id",
                (body.username, hash_password(body.password), body.role),
            )
            user_id = cur.fetchone()[0]
        except Exception:
            raise HTTPException(409, "Username already exists")
    return {"id": user_id, "username": body.username, "role": body.role}


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, conn=Depends(get_db), _=Depends(require_admin)):
    with conn.cursor() as cur:
        if body.password:
            cur.execute("UPDATE users SET password_hash=%s WHERE id=%s", (hash_password(body.password), user_id))
        if body.role:
            if body.role not in ("admin", "operator"):
                raise HTTPException(400, "role must be admin or operator")
            cur.execute("UPDATE users SET role=%s WHERE id=%s", (body.role, user_id))
        cur.execute("SELECT id, username, role FROM users WHERE id=%s", (user_id,))
        user = cur.fetchone()
    if not user:
        raise HTTPException(404, "User not found")
    return {"id": user[0], "username": user[1], "role": user[2]}


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, conn=Depends(get_db), _=Depends(require_admin)):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM users WHERE id=%s RETURNING id", (user_id,))
        if not cur.fetchone():
            raise HTTPException(404, "User not found")
