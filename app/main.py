import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.migrations import run_migrations, is_first_run, setup_first_run
from app.routers import auth as auth_router
from app.routers import users, products, locations, inventory, movements, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    run_migrations()
    if is_first_run():
        setup_first_run()
        print("[boot] First run — admin user created (admin / admin123)")
    yield


app = FastAPI(title="InventoryCare API", version="1.0.0", lifespan=lifespan)

app.include_router(auth_router.router)
app.include_router(users.router)
app.include_router(products.router)
app.include_router(locations.router)
app.include_router(inventory.router)
app.include_router(movements.router)
app.include_router(reports.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Resolve www/ relative to the exe when frozen, else relative to project root
if getattr(sys, "frozen", False):
    _www = Path(sys.executable).parent / "www"
else:
    _www = Path(__file__).parent.parent / "www"

if _www.is_dir():
    app.mount("/", StaticFiles(directory=str(_www), html=True), name="static")
