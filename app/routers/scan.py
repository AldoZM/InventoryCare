import re
import json
import sqlite3
import urllib.request
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from app.database import get_db
from app.auth import get_current_user
from app.routers.products import _row_to_dict

router = APIRouter(prefix="/api/scan", tags=["scan"])

try:
    import pytesseract
    from PIL import Image as _PILImage
    import io as _io
    _pytesseract_available = True
except ImportError:
    _pytesseract_available = False


def _fetch_openfoodfacts(barcode: str):
    url = (
        f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
        "?fields=product_name,categories_tags"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "InventaryCare/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        if data.get("status") != 1:
            return None
        p = data.get("product", {})
        cats = p.get("categories_tags", [])
        category = cats[0].replace("en:", "").replace("-", " ").title() if cats else None
        name = p.get("product_name") or None
        return {"name": name, "category": category, "price": None}
    except Exception:
        return None


def _fetch_upcitemdb(barcode: str):
    url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "InventaryCare/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        items = data.get("items", [])
        if not items:
            return None
        item = items[0]
        price = item.get("lowest_recorded_price")
        return {
            "name": item.get("title") or None,
            "category": item.get("category") or None,
            "price": float(price) if price is not None else None,
        }
    except Exception:
        return None


def _fetch_external(barcode: str):
    result = _fetch_openfoodfacts(barcode)
    if result and result.get("name"):
        price_data = _fetch_upcitemdb(barcode)
        if price_data:
            result["price"] = price_data.get("price")
        return result
    return _fetch_upcitemdb(barcode)


def _parse_ocr_text(text: str):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    name = lines[0] if lines else None

    price = None
    price_match = re.search(r'\$?\s*(\d{1,6}[.,]\d{2})', text)
    if price_match:
        price = float(price_match.group(1).replace(",", "."))

    CATEGORIES = [
        "alimento", "bebida", "limpieza", "higiene", "electrónico",
        "ropa", "herramienta", "lácteo", "cereal", "snack",
    ]
    category = None
    text_lower = text.lower()
    for cat in CATEGORIES:
        if cat in text_lower:
            category = cat.title()
            break

    return {"name": name, "category": category, "price": price, "raw_text": text}


@router.get("/sku/{barcode}")
def lookup_sku(barcode: str, conn=Depends(get_db), _=Depends(get_current_user)):
    cur = conn.cursor()
    cur.execute(
        "SELECT id,sku,name,description,category,unit,min_stock,price,created_at "
        "FROM products WHERE sku=?",
        (barcode,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "SKU not found")
    return _row_to_dict(row)


@router.get("/lookup/{barcode}")
def external_lookup(barcode: str, _=Depends(get_current_user)):
    result = _fetch_external(barcode)
    if not result:
        raise HTTPException(404, "Product not found in external databases")
    return result


@router.post("/ocr")
async def ocr_image(image: UploadFile = File(...), _=Depends(get_current_user)):
    if not _pytesseract_available:
        raise HTTPException(503, "pytesseract not installed")
    contents = await image.read()
    img = _PILImage.open(_io.BytesIO(contents))
    raw_text = pytesseract.image_to_string(img, lang="spa+eng")
    return _parse_ocr_text(raw_text)
