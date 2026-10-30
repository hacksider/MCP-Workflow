// Shared, offline-testable release rules. No model or publishing side effects here.
export function isCodePath(path) {
  return /^(src\/|src-tauri\/|scripts\/(release\/|build-helper\.mjs$|claude-runner\.mjs$)|\.github\/workflows\/|package(?:-lock)?\.json$|(?:vite|tsconfig).*\.(?:ts|json)$)/.test(path)
    && !/^src-tauri\/(?:target\/|src\/bin\/workflow-benchmark-backend\.rs$)/.test(path);
}

export function shouldRelease(paths, firstRelease = false) {
  return firstRelease || paths.some(isCodePath);
}

export function releaseTag(version, sha) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid release identity');
  return `v${version}-${sha.slice(0, 12)}`;
}

export function fallbackSummary(commits, repository) {
  const groups = { Features: [], Fixes: [], Maintenance: [] };
  for (const { sha, subject } of commits) {
    const group = /^(feat|feature)(\(|:| )/i.test(subject) ? 'Features' : /^(fix|bugfix)(\(|:| )/i.test(subject) ? 'Fixes' : 'Maintenance';
    const safe = subject.replace(/[\r\n<>]/g, ' ').replace(/([\\`*_[\]])/g, '\\$1');
    groups[group].push(`- ${safe} ([${sha.slice(0, 7)}](https://github.com/${repository}/commit/${sha}))`);
  }
  return Object.entries(groups).filter(([, rows]) => rows.length).map(([title, rows]) => `### ${title}\n\n${rows.join('\n')}`).join('\n\n') || 'Initial application release.';
}

export function validateAssets(files) {
  const required = [/\.exe$/i, /\.AppImage$/i, /\.deb$/i, /\.dmg$/i];
  if (required.some(pattern => !files.some(file => pattern.test(file.name) && file.size > 0))) throw new Error('Missing or empty Windows, Linux or macOS installer');
  if (new Set(files.map(file => file.name)).size !== files.length) throw new Error('Duplicate asset names');
}

export async function summarize(commits, repository, generate) {
  try {
    const text = (await generate()).trim();
    if (text.length < 40 || text.length > 12000 || /(?:authentication failed|not authenticated|quota exceeded|no release notes)/i.test(text)) throw new Error('Unusable Copilot summary');
    return { text, source: 'GitHub Copilot' };
  } catch {
    return { text: fallbackSummary(commits, repository), source: 'Free local changelog fallback (Copilot unavailable)' };
  }
}
