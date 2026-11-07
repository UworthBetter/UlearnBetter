import json
import unittest
from pathlib import Path
from referencing import Registry, Resource
from jsonschema import Draft202012Validator, FormatChecker
ROOT = Path(__file__).resolve().parents[1]
class RecordFixtures(unittest.TestCase):
 def test_all_fixtures(self):
  schemas = {p.name: json.loads(p.read_text(encoding='utf-8')) for p in (ROOT/'schemas/record').glob('*.json')}
  registry = Registry().with_resources((name, Resource.from_contents(v)) for name,v in schemas.items())
  for path in (ROOT/'samples/record').rglob('*.json'):
   with self.subTest(path=path.name):
    value=json.loads(path.read_text(encoding='utf-8')); self.assertIs(value['sample'],True)
    kind = 'organize-request' if path.name=='request.json' else 'organize-response' if path.name=='folder.expected.json' else path.stem.split('-')[0]
    if kind=='topic':
     Draft202012Validator(json.loads((ROOT/'schemas/learning/learn.schema.json').read_text(encoding='utf-8'))).validate(value['learn']);continue
    Draft202012Validator(schemas[kind+'.schema.json'],registry=registry,format_checker=FormatChecker()).validate(value)
 def test_invalid_event_and_override(self):
  for name,patch in [('event',{'durationSec':1801}),('override',{'value':{'hidden':True}})]:
   schema=json.loads((ROOT/f'schemas/record/{name}.schema.json').read_text(encoding='utf-8'))
   value=json.loads((ROOT/f'samples/record/demo/{name}.json').read_text(encoding='utf-8'));value.update(patch)
   self.assertFalse(Draft202012Validator(schema).is_valid(value))
