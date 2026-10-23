"""Run after tests/production.browser.mjs (optional pypdf dependency)."""
from pathlib import Path
from pypdf import PdfReader
root=Path(__file__).resolve().parents[1]
for name in ['grade1-fill','grade2-patterns','grade3-equivalence']:
    reader=PdfReader(root/'artifacts'/f'{name}.pdf')
    assert len(reader.pages)==2, f'{name}: expected student + answer pages, got {len(reader.pages)} (orphan footer?)'
    student=reader.pages[0].extract_text()
    answers=reader.pages[1].extract_text()
    assert '姓名' in student and '6.' in student
    assert '参考答案' not in student and '参考答案' in answers
    for p in reader.pages:
        assert 594<float(p.mediabox.width)<597 and 841<float(p.mediabox.height)<844
    print(f'{name}: 2 A4 pages, all 6 questions on student page, separate answers verified')
