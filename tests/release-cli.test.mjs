import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

it('publishes only after all uploads are verified; failed uploads remain a draft', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-release-test-'));
  const script = resolve('scripts/release/run.mjs');
  try {
    await mkdir(join(root, 'release-context'));
    await mkdir(join(root, 'release-assets'));
    await writeFile(join(root, 'release-context/plan.json'), JSON.stringify({ tag: 'v0.17.0-aaaaaaaaaaaa', version: '0.17.0', head: 'a'.repeat(40) }));
    await writeFile(join(root, 'release-context/notes.md'), 'Verified release notes');
    for (const name of ['setup.exe', 'app.AppImage', 'app.deb', 'app.dmg']) await writeFile(join(root, 'release-assets', name), 'fixture installer');
    const mock = join(root, 'mock.mjs');
    await writeFile(mock, `
import { appendFileSync } from 'node:fs';
const assets = [];
globalThis.fetch = async (url, options) => {
  const method = options.method || 'GET';
  appendFileSync('requests.jsonl', JSON.stringify({ url, method, body: typeof options.body === 'string' ? JSON.parse(options.body) : null }) + '\\n');
  if (url.includes('/releases?')) return Response.json([]);
  if (method === 'POST' && url.includes('uploads.example')) {
    if (process.env.FAIL_UPLOAD === '1') return new Response('', { status: 503 });
    assets.push({ name: new URL(url).searchParams.get('name'), size: 100, state: 'uploaded' });
    return Response.json({ id: assets.length });
  }
  return Response.json({ id: 1, assets, upload_url: 'https://uploads.example/assets{?name,label}' });
};
`);
    const run = fail => execFileSync(process.execPath, ['--import', pathToFileURL(mock).href, script, 'publish'], { cwd: root, env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fake-token', FAIL_UPLOAD: fail ? '1' : '0' }, stdio: 'pipe' });
    run(false);
    let requests = (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    expect(requests.at(-1).body.draft).toBe(false);
    expect(requests.filter(request => request.url.includes('uploads.example'))).toHaveLength(5);
    expect(await readFile(join(root, 'release-assets/SHA256SUMS'), 'utf8')).toContain('app.dmg');
    await writeFile(join(root, 'requests.jsonl'), '');
    expect(() => run(true)).toThrow();
    requests = (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    expect(requests.some(request => request.body?.draft === false)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
