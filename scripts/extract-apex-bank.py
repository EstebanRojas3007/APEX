"""Local import evidence. Renders every source page; never uploads or publishes."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.tools/pdf'))
import pymupdf

pdf = root / 'Docs/Materiales/APEX_Banco_Ingles_105_Preguntas_Revision_v0_2.pdf'
out = root / 'content/apex-ingles-v0.2/evidence'
out.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open(pdf)
pages = [{'page': i + 1, 'text': p.get_text(sort=True), 'links': [link['uri'] for link in p.get_links() if 'uri' in link]}
         for i, p in enumerate(doc)]
manifest = {'pdf': pdf.relative_to(root).as_posix(),
            'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
            'pages': len(doc), 'extractor': 'PyMuPDF', 'version': pymupdf.VersionBind,
            'method': 'Original text layer and rendered pages; no OCR or approval',
            'text': pages}
(out / 'automatic-text.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for start in range(0, len(doc), 4):
    sheet = pymupdf.open()
    page = sheet.new_page(width=1190, height=1684)
    for offset in range(min(4, len(doc)-start)):
        x, y = (offset % 2)*595, (offset // 2)*842
        page.show_pdf_page(pymupdf.Rect(x, y, x+595, y+842), doc, start+offset)
    page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6)).save(out / f'review-{start+1:02}-{min(start+4,len(doc)):02}.png')
    sheet.close()
print(json.dumps({k: v for k, v in manifest.items() if k != 'text'}))
