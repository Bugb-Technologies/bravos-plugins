// @comment -- "Pure slice picker for bravos-annotate: ranks the worklist (entry points first, tests/generated/CI last), decides which files this session or its subagents annotate, skips files teammates have in open PRs, and splits the pick into disjoint directory-coherent batches; dependency-free, copied verbatim into target repos."

const arr = (v) => (Array.isArray(v) ? v : []);
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

// Words in a path that mark code where attacker input arrives or trust is decided.
const ENTRY_WORDS = new Set([
  'handler', 'handlers', 'server', 'route', 'routes', 'router', 'controller', 'controllers', 'api', 'auth',
  'authn', 'authz', 'jwt', 'token', 'tokens', 'session', 'sessions', 'middleware', 'interceptor', 'interceptors',
  'gateway', 'ingress', 'rpc', 'grpc', 'webhook', 'webhooks', 'upload', 'admin', 'login', 'oauth', 'crypto',
  'secret', 'secrets', 'key', 'keys', 'jwks', 'cert', 'certs', 'tls', 'permission', 'permissions', 'rbac', 'acl',
  'endpoint', 'endpoints', 'frontend', 'proxy', 'graphql', 'resolver', 'resolvers', 'views',
]);
const ENTRY_PREFIXES = ['authoriz', 'authentic', 'authn', 'claim', 'identit', 'credential', 'password', 'saml', 'oidc'];

const tokens = (p) =>
  p
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * classify(path, generated) -> { tier, why }
 *   tier 1: entry points and trust code; tier 2: other source; tier 3: tests, generated, CI/tooling,
 *   vendored, docs/config. Tier 3 stays pickable; it only comes last.
 */
export function classify(path, generated = new Set()) {
  const p = `/${path}`;
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (generated.has(path) || /\.pb\.go$|_pb2(_grpc)?\.py$|\.pb\.(ts|js)$|[._]gen\.|\/generated\/|\.g\.dart$/.test(p))
    return { tier: 3, why: 'generated code' };
  if (/\/(vendor|third_party|node_modules)\//.test(p)) return { tier: 3, why: 'vendored code' };
  if (/(_test\.|\.test\.|\.spec\.|^test_|_spec\.)/.test(base) || /\/(tests?|__tests__|testdata|fixtures?)\//.test(p))
    return { tier: 3, why: 'test code' };
  if (/\/(\.github|\.circleci|ci|scripts|tools|build|hack)\//.test(p)) return { tier: 3, why: 'CI or tooling' };
  if (/\.(md|txt|rst|json|ya?ml|toml|ini|lock|csv|svg|png)$/i.test(base)) return { tier: 3, why: 'docs or config' };
  if (/\.config\.(c|m)?[jt]s$|^\.[a-z]+rc(\.[a-z]+)?$/i.test(base)) return { tier: 3, why: 'docs or config' };
  const t = tokens(path);
  const hit = t.find((w) => ENTRY_WORDS.has(w) || ENTRY_PREFIXES.some((x) => w.startsWith(x)));
  if (hit) return { tier: 1, why: `entry point or trust code (${hit})` };
  return { tier: 2, why: 'source' };
}

// The directory a batch groups by: the first two path segments of the file's directory.
const groupOf = (p) => dirOf(p).split('/').slice(0, 2).join('/');

/**
 * pickSlice({ worklist, annotated, excluded, changed, inFlight, ownedDirs, generated, prefer, n, batches })
 *   -> { diff, coverage, coverage_detail, batches, skipped, tiers }
 * diff: changed files minus excluded, in input order.
 * coverage: up to n × batches worklist files not changed and not in flight. Walk order: tier-3 files last;
 *   otherwise files in the directory of a changed file or under an owned dir first, then by tier
 *   (`prefer` files — e.g. code-graph entry points — before tier 1), each group in worklist rank order.
 * batches: coverage split into `batches` disjoint lists of up to n, consecutive in directory order so each
 *   batch is mostly one directory.
 * skipped: files passed over (in-flight or changed) by the same walk, only those met before coverage filled.
 * tiers: how many worklist files fell in each tier.
 */
export function pickSlice(input) {
  const n = input?.n;
  const k = Number.isInteger(input?.batches) && input.batches > 0 ? input.batches : 1;
  const budget = n === Infinity ? Infinity : n * k;
  const worklist = arr(input?.worklist);
  const excluded = new Set(arr(input?.excluded));
  const changed = arr(input?.changed);
  const inFlight = arr(input?.inFlight);
  const ownedDirs = arr(input?.ownedDirs);
  const generated = new Set(arr(input?.generated));
  const prefer = new Set(arr(input?.prefer));

  const diff = changed.filter((f) => !excluded.has(f));

  const changedSet = new Set(changed);
  const changedDirs = new Set(changed.map(dirOf));
  const flightPr = new Map();
  for (const pr of inFlight) {
    for (const f of arr(pr?.files)) if (!flightPr.has(f)) flightPr.set(f, pr.pr);
  }

  const info = new Map();
  const tiers = { 1: 0, 2: 0, 3: 0 };
  worklist.forEach((path, rank) => {
    const c = prefer.has(path) ? { tier: 1, why: 'entry point (code graph)' } : classify(path, generated);
    tiers[c.tier] += 1;
    const preferred = changedDirs.has(dirOf(path)) || ownedDirs.some((d) => path.startsWith(`${d}/`));
    info.set(path, { ...c, rank, preferred, graph: prefer.has(path) });
  });
  const key = (p) => {
    const i = info.get(p);
    return [i.tier === 3 ? 1 : 0, i.preferred ? 0 : 1, i.graph ? 0 : 1, i.tier, i.rank];
  };
  const cmp = (a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return ka[j] - kb[j];
    return 0;
  };
  const ordered = [...worklist].sort(cmp);

  const coverage = [];
  const skipped = [];
  for (const path of ordered) {
    if (coverage.length >= budget) break;
    if (flightPr.has(path)) skipped.push({ path, reason: `in-flight PR #${flightPr.get(path)}` });
    else if (changedSet.has(path)) skipped.push({ path, reason: 'in current change' });
    else coverage.push(path);
  }

  // Batches: keep the walk's priority across groups (a group's place is set by its best file), keep files of
  // one directory together, then cut consecutive runs.
  const groupRank = new Map();
  coverage.forEach((p, i) => {
    const g = groupOf(p);
    if (!groupRank.has(g)) groupRank.set(g, i);
  });
  const grouped = [...coverage].sort((a, b) => groupRank.get(groupOf(a)) - groupRank.get(groupOf(b)) || coverage.indexOf(a) - coverage.indexOf(b));
  const size = n === Infinity ? Math.ceil(grouped.length / k) || 1 : n;
  const batches = [];
  for (let i = 0; i < grouped.length && batches.length < k; i += size) batches.push(grouped.slice(i, i + size));

  const coverage_detail = coverage.map((path) => {
    const i = info.get(path);
    return { path, tier: i.tier, why: i.why };
  });
  return { diff, coverage, coverage_detail, batches, skipped, tiers };
}
