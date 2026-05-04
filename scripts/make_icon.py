from PIL import Image, ImageDraw
from pathlib import Path

Path("assets").mkdir(exist_ok=True)

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([2, 2, 62, 62], radius=12, fill=(29, 78, 216))
d.rectangle([16, 28, 48, 36], fill=(255, 255, 255))
d.rectangle([28, 16, 36, 48], fill=(255, 255, 255))

img.save("assets/icon.ico", format="ICO", sizes=[(64, 64), (32, 32), (16, 16)])
print("Created assets/icon.ico")
