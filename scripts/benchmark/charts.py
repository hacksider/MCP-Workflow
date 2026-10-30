"""Render publication charts directly from the preserved measured run ledger."""
import json
from pathlib import Path
import statistics
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

session = Path(sys.argv[1]).resolve()
runs = json.loads((session / 'runs.json').read_text(encoding='utf-8'))
output = Path(__file__).resolve().parents[2] / 'docs' / 'charts'
output.mkdir(parents=True, exist_ok=True)
methods = ['agent', 'workflow']
colors = ['#83968B', '#245942']
labels = ['Prompt + MCP agent', 'Saved workflow engine']
groups = [[r for r in runs if r['method'] == method] for method in methods]
means = [statistics.mean(r['elapsedSeconds'] for r in rows) for rows in groups]
accuracies = [100 * sum(r['correctFields'] for r in rows) / sum(r['expectedFields'] for r in rows) for rows in groups]
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11, 'axes.labelcolor': '#24352F', 'text.color': '#24352F', 'axes.edgecolor': '#D0DAD4'})
fig, axes = plt.subplots(1, 2, figsize=(12, 5), gridspec_kw={'width_ratios': [1.2, 1]})
fig.patch.set_facecolor('white')
fig.suptitle('Repeat the task. Reuse the workflow.', x=.055, ha='left', fontsize=20, fontweight='bold', y=.98)
for ax in axes:
    ax.spines[['top', 'right']].set_visible(False)
    ax.set_axisbelow(True)
    ax.grid(axis='y', color='#E8EDE9', linewidth=.8)
    ax.tick_params(axis='both', length=0, pad=8)
    ax.set_xticks([0, 1], labels)
axes[0].bar([0, 1], means, color=colors, width=.55)
for i, rows in enumerate(groups):
    values = [r['elapsedSeconds'] for r in rows]
    jitter = [(j - (len(rows) - 1) / 2) * .026 for j in range(len(rows))]
    axes[0].scatter([i + j for j in jitter], values, s=22, color='#203F30', edgecolors='white', linewidths=.5, zorder=4)
    axes[0].text(i, max(values) + 2, f'{means[i]:.2f} s mean', ha='center', fontweight='bold')
axes[0].set_ylim(0, max(r['elapsedSeconds'] for r in runs) + 10)
axes[0].set_ylabel('End-to-end time (seconds)')
axes[0].set_title(f'{means[0] / means[1]:.2f}× faster on this scraper', loc='left', fontsize=14, fontweight='bold', pad=16)
axes[1].bar([0, 1], accuracies, color=colors, width=.55)
for i, value in enumerate(accuracies):
    correct = sum(r['correctFields'] for r in groups[i])
    expected = sum(r['expectedFields'] for r in groups[i])
    axes[1].text(i, value + 3, f'{value:.0f}%\n{correct}/{expected} fields', ha='center', fontweight='bold', linespacing=1.4)
axes[1].set_ylim(0, 120)
axes[1].set_yticks([0, 25, 50, 75, 100], ['0%', '25%', '50%', '75%', '100%'])
axes[1].set_title('Same observed output accuracy', loc='left', fontsize=14, fontweight='bold', pad=16)
fig.text(.055, .075, '10 runs per method. Dots show individual timings. Both methods succeeded in all 10 runs.', fontsize=10, color='#4F6659')
fig.text(.055, .035, 'Local frozen scraper cases; both include 6 s of waits. Agent: GPT-6.1 Sol, low reasoning. Headless workflow engine.', fontsize=9, color='#4F6659')
fig.subplots_adjust(left=.075, right=.97, top=.78, bottom=.22, wspace=.3)
fig.savefig(output / 'scraper-benchmark.png', dpi=160, facecolor='white')
print(output / 'scraper-benchmark.png')
