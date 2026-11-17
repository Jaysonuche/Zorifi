from pathlib import Path
import json
import pdfplumber
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
root=Path(__file__).resolve().parent.parent
source=root/'output/pdf/Zorifi-Complete-Implementation-Record.pdf'
out=root/'tmp/pdfs/implementation-review';out.mkdir(parents=True,exist_ok=True)
reader=PdfReader(source);issues=[];short=[];pages=[];all_text=[]
with pdfplumber.open(source) as pdf:
    for index,page in enumerate(pdf.pages):
        text=page.extract_text() or '';all_text.append(text)
        if len(text)<160:short.append(index+1)
        outside=[c for c in page.chars if c['x0']<-.5 or c['x1']>page.width+.5 or c['top']<-.5 or c['bottom']>page.height+.5]
        if outside:issues.append({'page':index+1,'outOfPageCharacters':len(outside)})
        image=page.to_image(resolution=84).original.convert('RGB');image.save(out/f'page-{index+1:03}.png');pages.append(image)
for start in range(0,len(pages),12):
    sheet=Image.new('RGB',(1100,1610),'#dce0e8');draw=ImageDraw.Draw(sheet)
    for n,page in enumerate(pages[start:start+12]):
        thumb=ImageOps.contain(page,(350,370));x=15+(n%3)*365;y=25+(n//3)*395;sheet.paste(thumb,(x,y));draw.text((x,y-16),'Page '+str(start+n+1),fill='black')
    sheet.save(out/f'contact-{start+1:03}.png')
joined='\n'.join(all_text)
required=['Scope, findings','MIDI','professional tool registry','forty Ultimate','development chronology','current file ledger','test-file','historical report']
missing=[v for v in required if v.lower() not in joined.lower()]
receipt={'pages':len(reader.pages),'bytes':source.stat().st_size,'outOfPageIssues':issues,'shortPagesForReview':short,'missingSections':missing,'renderedEveryPage':True,'contactSheets':(len(pages)+11)//12}
(root/'artifacts/implementation-pdf-check.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
if issues or missing:raise SystemExit(1)
