"""Build a compact QA sheet from the PNG-only coffee preview render."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('out/coffee')
frames = [0, 75, 150, 285, 299, 300, 375, 420, 480, 585, 599, 600, 675, 720, 780, 840, 885, 899]
paths = [(root / f'MotionLab-{frame}.png', f'MotionLab / {frame}') for frame in frames]
paths += [(root / f'Shot-{shot}-{frame}.png', f'{shot} / {frame}')
          for shot in ['bean', 'extraction', 'espresso'] for frame in [0, 30, 75, 120, 180, 240, 285, 299]]
sheet = Image.new('RGB', (1500, ((len(paths) + 4) // 5) * 561), '#eee2cd')
draw = ImageDraw.Draw(sheet)
for i, (path, label) in enumerate(paths):
    image = Image.open(path)
    image.thumbnail((300, 533))
    x, y = i % 5 * 300, i // 5 * 561
    sheet.paste(image, (x, y + 25))
    draw.text((x + 8, y + 6), label, fill='#17130f')
sheet.save(root / 'contact-sheet.jpg', quality=90)
