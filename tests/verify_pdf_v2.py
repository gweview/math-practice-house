"""Verify actual browser-produced V2 PDF pages; pypdf required."""
from pathlib import Path
import json
import re
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
DIRECTORY=ROOT/'artifacts/v2'
report=json.loads((DIRECTORY/'production-matrix.json').read_text())
assert len(report['cases'])==45, f"incomplete print matrix: {len(report['cases'])}/45"
assert report.get('complete') is True
assert not report['pageErrors'] and not report['failedRequests'] and not report['mobileOverflow']
total=0
for case in report['cases']:
    reader=PdfReader(DIRECTORY/f"{case['stem']}.pdf")
    assert len(reader.pages)==case['pages'], f"{case['stem']}: browser added or lost pages {len(reader.pages)} != {case['pages']}"
    assert case['students']>0 and case['questionCount']==case['actual']
    assert len(set(case['questionIds']))==case['actual']
    assert (case['answers']>0)==case['includeAnswers']
    student_text=[];teacher_text=[];student_ordinals=[];teacher_ordinals=[]
    normalize=lambda s: re.sub(r'\s+','',s)
    for i,page in enumerate(reader.pages):
        width,height=float(page.mediabox.width),float(page.mediabox.height)
        assert 594<width<597 and 841<height<844,(case['stem'],i,width,height)
        text=page.extract_text()
        assert len(text.strip())>50, f"{case['stem']} page{i+1}: empty/attribution-only page"
        ordinals=[int(x) for x in re.findall(r'第\s*(\d+)\s*题',text)]
        assert ordinals, f"{case['stem']} page{i+1}: header/footer-only page with no question"
        if i<case['students']:
            assert '教师答案' not in text and '参考答案' not in text, f"teacher heading leaked: {case['stem']}"
            student_text.append(text);student_ordinals.extend(ordinals)
        else:
            teacher_text.append(text);teacher_ordinals.extend(ordinals)
        total+=1
    assert sorted(student_ordinals)==list(range(1,case['actual']+1)),f"{case['stem']}: PDF question number lost or duplicated"
    assert sorted(teacher_ordinals)==(list(range(1,case['actual']+1)) if case['includeAnswers'] else [])
    student_normalized=normalize(''.join(student_text));teacher_normalized=normalize(''.join(teacher_text))
    for q in case['questions']:
        assert normalize(q['prompt']) in student_normalized, f"{case['stem']}: PDF lost actual student prompt {q['id']}"
        if case['includeAnswers']:
            assert normalize(q['explanation']) in teacher_normalized,f"{case['stem']}: PDF lost teacher explanation {q['id']}"
    print(f"PDF verified {case['stem']}: {case['students']} student + {case['answers']} answer pages")
summary={'configurations':len(report['cases']),'pdfPages':total,'assertions':'A4, explicit-container/page count equality, nonempty pages, student/teacher isolation, unique complete question identities'}
(DIRECTORY/'pdf-verification.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False))
