import ast
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('audit',Path(__file__).parents[1]/'scripts/audit_source.py')
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
class AuditTests(unittest.TestCase):
    def test_quotient_remainder_tuple(self):
        self.assertTrue(audit.equivalent(audit.calculate(ast.parse('(13//5,13%5)',mode='eval')),'2，3'))
    def test_fraction_decimal_literal(self):
        self.assertTrue(audit.equivalent(audit.calculate(ast.parse("Fraction('0.4')",mode='eval')),'0.4'))
    def test_reject_executable_calls(self):
        with self.assertRaises(ValueError): audit.calculate(ast.parse("__import__('os')",mode='eval'))
if __name__=='__main__': unittest.main()
