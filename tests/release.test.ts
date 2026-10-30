import { describe, expect, it } from 'vitest';
// @ts-expect-error Release scripts intentionally use dependency-free Node ESM.
import { shouldRelease, releaseTag, fallbackSummary, summarize, validateAssets } from '../scripts/release/lib.mjs';

describe('weekly desktop releases', () => {
  it('skips documentation-only and unchanged revisions but includes native/frontend/build changes', () => {
    expect(shouldRelease([])).toBe(false);
    expect(shouldRelease(['README.md', 'docs/comparison.md', 'benchmarks/results/run.json'])).toBe(false);
    for (const path of ['src/native.ts', 'src-tauri/src/main.rs', 'package-lock.json', '.github/workflows/weekly-release.yml']) expect(shouldRelease([path])).toBe(true);
    expect(shouldRelease([], true)).toBe(true);
  });
  it('uses a reproducible revision-specific tag and rejects unsafe inputs', () => {
    expect(releaseTag('0.17.0', 'a'.repeat(40))).toBe('v0.17.0-aaaaaaaaaaaa');
    expect(() => releaseTag('bad\nversion', 'a'.repeat(40))).toThrow();
  });
  const commits = [{ sha: 'a'.repeat(40), subject: 'feat: branching flows' }, { sha: 'b'.repeat(40), subject: 'fix: retry timers' }, { sha: 'c'.repeat(40), subject: 'docs: update guide' }];
  it('produces a free, traceable grouped summary without inventing changes', () => {
    const text = fallbackSummary(commits, 'owner/repo');
    expect(text).toContain('### Features');
    expect(text).toContain('### Fixes');
    expect(text).toContain('### Maintenance');
    expect(text).toContain('/commit/' + 'a'.repeat(40));
  });
  it('falls back when Copilot is missing, denied, timed out or returns unusable output', async () => {
    for (const generate of [async () => { throw new Error('quota'); }, async () => '', async () => 'Authentication failed, please authenticate again before proceeding.']) {
      const result = await summarize(commits, 'owner/repo', generate);
      expect(result.source).toContain('Free local');
      expect(result.text).toContain('retry timers');
    }
    const result = await summarize(commits, 'owner/repo', async () => '### Features\n\n- Added branching workflows and fixed retry timers.');
    expect(result.source).toBe('GitHub Copilot');
  });
  it('requires nonempty binaries for every platform before publishing', () => {
    const files = ['setup.exe', 'app.AppImage', 'app.deb', 'app.dmg'].map(name => ({ name, size: 100 }));
    expect(() => validateAssets(files)).not.toThrow();
    expect(() => validateAssets(files.slice(0, 3))).toThrow();
    expect(() => validateAssets([...files, files[0]])).toThrow();
    expect(() => validateAssets(files.map(file => ({ ...file, size: 0 })))).toThrow();
  });
});
