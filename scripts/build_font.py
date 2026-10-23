"""Build a deterministic offline Chinese font subset from a supplied Noto OTF.

Developer-only: python -m pip install fonttools brotli
python scripts/build_font.py /path/to/NotoSansCJKsc-Regular.otf
The full source font is not committed; ordinary npm builds never need a network.
"""
from pathlib import Path
import argparse
import hashlib
import json
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('source',type=Path)
args=parser.parse_args()
text=''.join(chr(i) for i in range(32,127))+'０１２３４５６７８９＋－×÷＝□△○∴↶↗↻✓✳✦'
for folder in ['src','data','tests']:
    for path in sorted((ROOT/folder).rglob('*')):
        if path.is_file() and path.suffix in {'.js','.mjs','.json','.html','.css'}:
            text+=path.read_text()
font=TTFont(args.source)
options=subset.Options()
options.name_IDs=list(range(26))
options.name_legacy=True
options.name_languages=[0x409,0x804]
subsetter=subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
# Name the derived subset distinctly; retain source copyright/license name records.
for record in font['name'].names:
    if record.nameID in {1,4,6}:
        value={1:'House Chinese V2',4:'House Chinese V2 Regular',6:'HouseChineseV2-Regular'}[record.nameID]
        record.string=value.encode(record.getEncoding(),errors='replace')
font.flavor='woff2'
font.recalcTimestamp=False
setattr(font['head'],'modified',getattr(font['head'],'created'))
out=ROOT/'src/assets/fonts/house-chinese.woff2'
font.save(out,reorderTables=True)
provenance={
    'upstream':'https://github.com/notofonts/noto-cjk',
    'sourcePath':'Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    'sourceSha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),
    'derivedFamily':'House Chinese V2',
    'license':'SIL-OFL-1.1',
    'modifications':'Subset to repository literals, retain licensing metadata, rename derived family.',
    'fontToolsVersion':__import__('fontTools').__version__,
    'subsetSha256':hashlib.sha256(out.read_bytes()).hexdigest(),
    'unicodeCount':len(font.getBestCmap() or {}),
}
(out.parent/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'bytes':out.stat().st_size,**provenance},ensure_ascii=False,indent=2))
