"""Regression checks for repeated builds, source identities, and read-only input."""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / 'learning'))
import notes_compile


class IntegrationRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ulearn-regression-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.topic = self.root / 'topic'
        shutil.copytree(ROOT / 'samples' / 'learn' / 'demo-topic', self.topic)
        self.out = self.root / 'out'

    def run_compile(self, *extra):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = notes_compile.main([str(self.topic), '--out', str(self.out),
                                       '--extractor', 'annotated', '--now', '2026-11-07T00:00:00Z', *extra])
        return code

    def document(self):
        return json.loads((self.out / 'topic.learn.json').read_text(encoding='utf-8'))

    def test_repeated_compile_preserves_relationships(self):
        self.assertEqual(self.run_compile(), 0)
        initial = self.document()['relations']
        self.assertEqual(self.run_compile(), 0)
        self.assertEqual(self.document()['relations'], initial)

    def test_cache_path_cannot_overwrite_a_source_note(self):
        note = next(self.topic.rglob('*.md'))
        before = note.read_bytes()
        self.assertEqual(self.run_compile('--cache-file', str(note)), 1)
        self.assertEqual(note.read_bytes(), before)

    def test_source_remapping_invalidates_cached_evidence(self):
        self.assertEqual(self.run_compile(), 0)
        old = self.document()
        (self.topic / '00-new-source.md').write_text(
            '# New source\n[0:01](https://www.youtube.com/watch?v=other000001&t=1s)\n', encoding='utf-8')
        self.assertEqual(self.run_compile(), 0)
        new = self.document()
        old_sources = {s['id']: s['ref'] for s in old['sources']}
        new_sources = {s['id']: s['ref'] for s in new['sources']}

        def refs(doc, sources):
            result = []
            def walk(value):
                if isinstance(value, dict):
                    if 'src' in value:
                        result.append((sources[value['src']], value.get('t')))
                    for child in value.values():
                        walk(child)
                elif isinstance(value, list):
                    for child in value:
                        walk(child)
            walk(doc['concepts'])
            walk(doc['procedures'])
            return result
        self.assertTrue(refs(old, old_sources))
        self.assertEqual(refs(old, old_sources), refs(new, new_sources))

    def test_schema_failure_does_not_publish_output(self):
        schema = self.root / 'reject.schema.json'
        schema.write_text('{"not": {}}', encoding='utf-8')
        try:
            import jsonschema
        except ImportError:
            self.skipTest('optional jsonschema is not installed')
        self.assertEqual(self.run_compile('--schema-file', str(schema)), 1)
        self.assertFalse((self.out / 'topic.learn.json').exists())
