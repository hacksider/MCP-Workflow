"""Recheck published results with Python's independent CSV/JSON parsers."""
import csv
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

root = Path(sys.argv[1]).resolve()
runs = json.loads((root / 'runs.json').read_text(encoding='utf-8'))
assert len(runs) == 20, 'Ten complete pairs are required'
assert {(r['pair'], r['method']) for r in runs} == {(p, m) for p in range(1, 11) for m in ['agent', 'workflow']}
checks = []
for run in runs:
    pair, method = run['pair'], run['method']
    folder = root / f'{pair}-{method}'
    expected = json.loads((root / 'fixtures' / f'expected-{pair}.json').read_text(encoding='utf-8'))
    fixture = json.loads((root / 'fixtures' / f'case-{pair}.json').read_text(encoding='utf-8'))
    compact = json.dumps(fixture, ensure_ascii=False, separators=(',', ':'))
    assert hashlib.sha256(compact.encode()).hexdigest() == run['fixtureSha256']
    with (folder / run['csv']).open(encoding='utf-8', newline='') as file:
        reader = csv.DictReader(file)
        assert sorted(reader.fieldnames) == ['asin', 'price', 'title', 'url']
        csv_rows = list(reader)
    json_rows = json.loads((folder / run['json']).read_text(encoding='utf-8'))
    def score(rows):
        correct = 0
        for gold in expected:
            matches = [r for r in rows if r.get('asin') == gold['asin']]
            if len(matches) == 1:
                correct += sum(matches[0].get(key) == gold[key] for key in gold)
        exact = len(rows) == len(expected) and sorted(rows, key=lambda r: r['asin']) == sorted(expected, key=lambda r: r['asin'])
        return correct, exact
    csv_correct, csv_exact = score(csv_rows)
    json_correct, json_exact = score(json_rows)
    correct = min(csv_correct, json_correct)
    assert correct == run['correctFields'], (pair, method, 'field score disagrees')
    events = [json.loads(line) for line in (folder / 'operations.jsonl').read_text(encoding='utf-8').splitlines()]
    credit = False
    fetches = 0
    paced = True
    for event in events:
        if event['phase'] == 'end' and event['tool'] == 'catalog_wait' and event['durationMs'] >= 2950:
            credit = True
        if event['phase'] == 'start' and event['tool'] == 'catalog_fetch_page':
            paced &= credit
            credit = False
            fetches += 1
    paced &= fetches == 2
    assert paced == run['pacingValid']
    assert math.isfinite(run['elapsedSeconds']) and run['elapsedSeconds'] >= 6
    success = bool(csv_exact and json_exact and paced and run['completed'] and run['elapsedSeconds'] <= 180)
    assert success == run['success']
    if method == 'agent':
        report = json.loads((folder / 'agent-report.json').read_text(encoding='utf-8'))
        assert report['status'] == 'completed' and report['report']['status'] == 'completed'
    checks.append({'pair': pair, 'method': method, 'correctFields': correct, 'success': success})

summary = json.loads((root / 'summary.json').read_text(encoding='utf-8'))
for method in ['agent', 'workflow']:
    subset = [r for r in runs if r['method'] == method]
    values = [r['elapsedSeconds'] for r in subset]
    assert abs(statistics.mean(values) - summary[method]['meanSeconds']) < 1e-9
    assert abs(statistics.median(values) - summary[method]['medianSeconds']) < 1e-9
    assert sum(r['success'] for r in subset) == summary[method]['successful']

result = {'verifier': 'Python standard-library csv and json, independent of Node validator', 'runsAudited': len(checks), 'allLedgerScoresReproduced': True, 'checks': checks}
(root / 'independent-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Independent audit: all {len(checks)} run scores, output files, fixture hashes and aggregate timings verified.')
