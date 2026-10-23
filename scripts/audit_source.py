"""Independent audit of source verify expressions: no eval/exec."""
import ast
import json
import operator
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
       ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod}


def calculate(node):
    if isinstance(node, ast.Expression):
        return calculate(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        return OPS[type(node.op)](calculate(node.left), calculate(node.right))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -calculate(node.operand)
    if isinstance(node, ast.Tuple) and len(node.elts) == 2:
        return tuple(calculate(item) for item in node.elts)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'Fraction' and len(node.args) in (1, 2) and not node.keywords:
        return Fraction(*(calculate(arg) for arg in node.args))
    raise ValueError(f'Unsupported verifier expression: {ast.dump(node)}')


def equivalent(actual, expected):
    if isinstance(actual, tuple):
        parts = str(expected).replace('，', ',').split(',')
        return len(parts) == len(actual) and all(equivalent(a, b) for a, b in zip(actual, parts))
    try:
        return abs(Fraction(str(actual)) - Fraction(str(expected))) < Fraction(1, 1000000)
    except (ValueError, ZeroDivisionError):
        return str(actual).strip() == str(expected).strip()


def main():
    questions = json.loads((ROOT / 'data/questions.json').read_text())
    passed, issues = 0, []
    for question in questions:
        try:
            expected = question['answer']
            if question['type'] == 'choice':
                expected = next(c['text'] for c in question['choices'] if c['key'] == expected)
            actual = calculate(ast.parse(question['verify'], mode='eval'))
            if equivalent(actual, expected):
                passed += 1
            else:
                issues.append({'id': question['id'], 'kind': 'mismatch', 'verified': str(actual), 'answer': expected})
        except Exception as error:
            issues.append({'id': question['id'], 'kind': 'unsupported', 'reason': str(error)})
    report = {'checked': len(questions), 'consistent': passed, 'issues': issues,
              'scope': '仅检查来源verify表达式与参考答案一致性，不证明题干语义或教材归属正确。'}
    (ROOT / 'docs/source-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return bool(issues)


if __name__ == '__main__':
    raise SystemExit(main())
