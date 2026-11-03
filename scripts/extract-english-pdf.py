"""Local evidence only: render the supplied PDF and extract its existing text layer.
Requires PyMuPDF; never uploads, approves or publishes content.
"""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.tools' / 'pdf'))
import pymupdf

pdf = root / 'Docs/materiales/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf'
out = root / 'content/ingles-2018/evidence'
out.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open(pdf)
pages = []
for index, page in enumerate(doc):
    pages.append({'page': index + 1, 'text': page.get_text(sort=True)})
    if index + 1 in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10):
        page.get_pixmap(matrix=pymupdf.Matrix(2, 2)).save(out / f'page-{index+1:02}.png')
manifest = {'pdf': str(pdf.relative_to(root)).replace('\\', '/'),
            'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
            'pages': len(doc), 'extractor': 'PyMuPDF', 'version': pymupdf.VersionBind,
            'method': 'text layer + rendered pages only; no OCR, transcription or approval performed by this script',
            'text': pages}
(out / 'automatic-text.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in manifest.items() if k != 'text'}))
