"""Check that the committed offline font covers repository Chinese literals."""
from pathlib import Path
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[1]
font=TTFont(root/'src/assets/fonts/house-chinese.woff2')
cmap=font.getBestCmap()
assert cmap is not None, 'Offline font must contain a Unicode cmap'
required=set()
for folder in ['src','data']:
    for path in (root/folder).rglob('*'):
        if path.is_file() and path.suffix in {'.js','.json','.html','.css'}:
            required.update(ord(ch) for ch in path.read_text() if '\u3400'<=ch<='\u9fff')
missing=sorted(required-set(cmap))
assert not missing, 'Offline font misses Chinese literals: '+''.join(chr(c) for c in missing)
print(f'Offline font covers all {len(required)} required Chinese characters')
