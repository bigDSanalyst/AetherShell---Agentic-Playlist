// Resolves user input to a raw.githubusercontent.com URL, refusing anything else.
// The server only ever fetches https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>,
// so a crafted URL cannot point the fetch (or a GitHub token) at another host.

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._\/-]{1,200}$/;
const PATH_SEG_RE = /^[A-Za-z0-9._@+-]{1,255}$/;

export interface GitHubFileRef {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  rawUrl: string;
}

function validate(owner: string, repo: string, ref: string, path: string): GitHubFileRef {
  if (!OWNER_RE.test(owner)) throw new Error('Invalid GitHub owner');
  if (!REPO_RE.test(repo) || repo === '.' || repo === '..') throw new Error('Invalid GitHub repository name');
  if (!REF_RE.test(ref) || ref.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error('Invalid branch or ref');
  }
  const segs = path.split('/');
  if (segs.length === 0 || segs.some((s) => s === '.' || s === '..' || !PATH_SEG_RE.test(s))) {
    throw new Error('Invalid file path');
  }
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  return {
    owner,
    repo,
    ref,
    path,
    rawUrl: `https://raw.githubusercontent.com/${enc(owner)}/${enc(repo)}/${enc(ref)}/${enc(path)}`,
  };
}

export function resolveGitHubFile(repoUrl: string, defaults: { branch?: string; filePath?: string } = {}): GitHubFileRef {
  let url: URL;
  try {
    url = new URL(repoUrl.trim());
  } catch {
    throw new Error('Not a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('Only https GitHub URLs are allowed');
  if (url.username || url.password || url.port) throw new Error('URL must not contain credentials or a port');

  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const branch = (defaults.branch || 'main').trim();
  const filePath = (defaults.filePath || 'guard.ts').trim().replace(/^\/+/, '');

  if (url.hostname === 'raw.githubusercontent.com') {
    // /owner/repo/ref/path... (ref assumed to be a single segment here)
    if (parts.length < 4) throw new Error('raw.githubusercontent.com URL must include owner/repo/ref/path');
    const [owner, repo, ref, ...rest] = parts;
    return validate(owner, repo, ref, rest.join('/'));
  }

  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
    if (parts.length < 2) throw new Error('GitHub URL must include owner and repository');
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    if (parts[2] === 'blob' || parts[2] === 'raw') {
      if (parts.length < 5) throw new Error('GitHub file URL must include a ref and path');
      return validate(owner, repo, parts[3], parts.slice(4).join('/'));
    }
    if (parts.length > 2) throw new Error('Unsupported GitHub URL; use a repository or /blob/ file URL');
    return validate(owner, repo, branch, filePath);
  }

  throw new Error('Only github.com and raw.githubusercontent.com URLs are allowed');
}
