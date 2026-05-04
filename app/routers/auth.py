from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.database import get_db
from app.auth import verify_password, create_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(req: LoginRequest, conn=Depends(get_db)):
    cur = conn.cursor()
    cur.execute(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?",
        (req.username,),
    )
    user = cur.fetchone()

    if not user or not verify_password(req.password, user[2]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return {
        "access_token": create_token(user[0], user[1], user[3]),
        "token_type": "bearer",
        "role": user[3],
    }


@router.post("/logout")
def logout():
    return {"detail": "logged out"}
