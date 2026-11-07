// @comment -- "The licence: where it is found, whether it verifies, and what it unlocks. A port of the Python bravos CLI's licence.py onto the same claim contract (bugb-license+jwt, v1), so the three verifiers (this CLI, the portal, bugb-server) agree on every token: an Ed25519 JWS whose kid picks an embedded public key, strict RFC 8259 claims, product bugb, crit enforced, exp with a grace window of min(14 days, term/4), the tier ladder free < team < business < enterprise. Verification is offline and never throws: every input, however hostile, is an answer with a reason. Dependency-free (node:crypto only) because the session hooks read it on every start."
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

export const PRODUCT = 'bugb';
export const ALGORITHM = 'EdDSA';
export const SCHEMA_VERSIONS = [1];
export const REQUIRED_CRITICAL = ['product', 'schema_version'];
/** The claims this build enforces; a token whose crit names anything else is refused, never read. */
export const ENFORCED_CLAIMS = ['exp', 'nbf', 'product', 'schema_version', 'seats', 'sub', 'trial'];
const REQUIRED_CLAIMS = ['sub', 'exp', 'tier', 'seats', 'product'];
export const TIERS = ['free', 'team', 'business', 'enterprise'];
const PAID_TIERS = ['team', 'business', 'enterprise'];
export const GRACE_CAP_SECONDS = 14 * 86400;
export const GRACE_FRACTION = 4;
const MAX_TOKEN_BYTES = 8192;
const MAX_NESTING_DEPTH = 8;
const MAX_NUMBER_LITERAL = 32;
const SAFE_INTEGER = 2 ** 53 - 1;
const SIGNATURE_BYTES = 64;

export const LICENCE_ENV = 'BRAVOS_LICENCE';
export const LICENCE_ENV_ALT = 'BRAVOS_LICENSE';
export const LICENCE_FILES = ['licence.jwt', 'license.jwt', 'bravos-license.jwt'];
export const ACCOUNT_ORIGIN = 'https://account.bugb.io';
export const ACCOUNT_UPGRADE = `${ACCOUNT_ORIGIN}/pricing`;
export const ACCOUNT_LICENCES = `${ACCOUNT_ORIGIN}/dashboard/license`;

// @comment -- "The keys this build trusts, fixed in the source: the production licence key the portal signs under, and nothing else. A development key is recognised by name so a refusal can say what it saw, and is never trusted: its private half sits in developer checkouts. No environment variable, flag or file can add a key — a trust anchor chosen at run time is worth what whoever supplied it is worth, and that would be the party being gated."
export const PROD_KID = 'bugb-license-2026a';
export const DEV_KID = 'bravos-dev-2026-Q2-01';
export const TRUSTED_KEYS = Object.freeze({
  [PROD_KID]: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAH2eaJpX3UCVKdoOMHZf1o8NUUKM5rOaUwoIy8WHQ38M=\n-----END PUBLIC KEY-----\n',
});
let trusted = TRUSTED_KEYS;
/** The key set verification uses by default: the trusted set, or what the test suite set in-process. */
export const trustedKeys = () => trusted;
// @comment -- "In-process only, for the test suite: there is no environment variable, flag or file behind this, so nothing outside the process can widen trust."
export const _setTrustedKeysForTests = (keys) => {
  trusted = keys ? Object.freeze({ ...keys }) : TRUSTED_KEYS;
};

/** What this product gates on a Team (or higher) licence; everything else is free. */
export const PAID_FEATURES = ['pre-pr', 'ci', 'schedule', 'workspace', 'campaign', 'sast', 'codegraph'];
export const PAID_FEATURE_LABELS = {
  'pre-pr': 'the pre-PR gate',
  ci: 'CI and nightly workflows',
  schedule: 'scheduled upkeep',
  workspace: 'multi-repository workspaces',
  campaign: 'campaigns',
  sast: 'SAST',
  codegraph: 'the code graph',
};

// ---------------------------------------------------------------------------------------------
// Strict JSON: RFC 8259 and nothing more, so every verifier reads one value from one document.
// ---------------------------------------------------------------------------------------------

class Malformed extends Error {}
const malformed = (what, why) => new Malformed(`the ${what} ${why}`);

// @comment -- "A strict JSON parser for the two token segments: a repeated member name is refused (JSON.parse keeps the last and says nothing, which lets {\"product\":\"other\",\"product\":\"bugb\"} verify into a full entitlement), bare NaN/Infinity are not numbers, nesting is bounded, a number literal is bounded in length and magnitude, and a lone surrogate is not text. It produces values only; a bug in it can refuse a good document, never accept a bad one that JSON.parse would refuse."
function parseStrict(text, what) {
  let i = 0;
  const peek = () => text[i];
  const ws = () => {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };
  const fail = (why) => {
    throw malformed(what, `is not RFC 8259 JSON: ${why} at offset ${i}`);
  };
  const value = (depth) => {
    ws();
    const c = peek();
    if (c === undefined) fail('unexpected end');
    if (c === '{') return object(depth + 1);
    if (c === '[') return array(depth + 1);
    if (c === '"') return string();
    if (c === 't' && text.startsWith('true', i)) return (i += 4), true;
    if (c === 'f' && text.startsWith('false', i)) return (i += 5), false;
    if (c === 'n' && text.startsWith('null', i)) return (i += 4), null;
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    return fail(`unexpected character ${JSON.stringify(c)}`);
  };
  const object = (depth) => {
    if (depth > MAX_NESTING_DEPTH) throw malformed(what, `nests deeper than ${MAX_NESTING_DEPTH}`);
    i++;
    const out = {};
    const seen = new Set();
    ws();
    if (peek() === '}') return i++, out;
    for (;;) {
      ws();
      if (peek() !== '"') fail('expected a member name');
      const name = string();
      if (seen.has(name)) throw malformed(what, `is not RFC 8259 JSON: duplicate member ${JSON.stringify(name)}`);
      seen.add(name);
      ws();
      if (peek() !== ':') fail('expected :');
      i++;
      out[name] = value(depth);
      ws();
      if (peek() === ',') {
        i++;
        continue;
      }
      if (peek() === '}') return i++, out;
      fail('expected , or }');
    }
  };
  const array = (depth) => {
    if (depth > MAX_NESTING_DEPTH) throw malformed(what, `nests deeper than ${MAX_NESTING_DEPTH}`);
    i++;
    const out = [];
    ws();
    if (peek() === ']') return i++, out;
    for (;;) {
      out.push(value(depth));
      ws();
      if (peek() === ',') {
        i++;
        continue;
      }
      if (peek() === ']') return i++, out;
      fail('expected , or ]');
    }
  };
  const string = () => {
    i++;
    let out = '';
    for (;;) {
      const c = text[i];
      if (c === undefined) fail('unterminated string');
      if (c === '"') {
        i++;
        break;
      }
      if (c === '\\') {
        const e = text[i + 1];
        i += 2;
        if (e === '"' || e === '\\' || e === '/') out += e;
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else if (e === 'u') {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad \\u escape');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else fail('bad escape');
        continue;
      }
      // eslint-disable-next-line no-control-regex
      if (c < ' ') fail('control character in string');
      out += c;
      i++;
    }
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)) throw malformed(what, 'carries a string that is not well-formed UTF-8: lone surrogate');
    return out;
  };
  const number = () => {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail('bad number');
    if (m[0].length > MAX_NUMBER_LITERAL) throw malformed(what, `carries a number literal longer than ${MAX_NUMBER_LITERAL} characters`);
    i += m[0].length;
    const n = Number(m[0]);
    if (!(n >= -SAFE_INTEGER && n <= SAFE_INTEGER)) throw malformed(what, `carries a number outside ±${SAFE_INTEGER}, the range every implementation of this contract reads the same value from`);
    return n;
  };
  const v = value(0);
  ws();
  if (i !== text.length) fail('trailing characters');
  return v;
}

function b64url(segment, what) {
  if (!segment) throw malformed(`${what} segment`, 'is empty');
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw malformed(`${what} segment`, 'is not unpadded base64url');
  if (segment.length % 4 === 1) throw malformed(`${what} segment`, 'has an impossible length');
  return Buffer.from(segment, 'base64url');
}

function jsonObject(bytes, what) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw malformed(what, 'is not valid UTF-8');
  }
  const parsed = parseStrict(text, what);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw malformed(what, 'is not a JSON object');
  return parsed;
}

// ---------------------------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------------------------

class Invalid extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}
const bad = (reason, message) => new Invalid(reason, message);

const text = (name, v) => {
  if (typeof v !== 'string' || !v) throw bad('invalid_claims', `the licence's '${name}' claim must be a non-empty string`);
  return v;
};
const integer = (name, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('invalid_claims', `the licence's '${name}' claim must be an integer`);
  if (!Number.isInteger(v)) throw bad('invalid_claims', `the licence's '${name}' claim must be a whole number`);
  return v;
};
const count = (name, v) => {
  const n = integer(name, v);
  if (n < 0) throw bad('invalid_claims', `the licence's '${name}' claim must not be negative`);
  return n;
};
const moment = (name, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('invalid_claims', `the licence's '${name}' claim must be seconds since the epoch`);
  return v;
};
const features = (v) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad('invalid_claims', "the licence's 'features' claim must be a list");
  for (const f of v) if (typeof f !== 'string') throw bad('invalid_claims', "the licence's 'features' claim must contain only strings");
  return [...new Set(v)].sort();
};

export function graceWindowSeconds(exp, termStart, cap = GRACE_CAP_SECONDS) {
  if (!(cap >= 0)) throw new Error('cap must not be negative');
  if (termStart === null || termStart === undefined) return cap;
  const window = Math.floor(Math.floor(exp - termStart) / GRACE_FRACTION);
  if (window < 0) return 0;
  return Math.min(cap, window);
}

export const licenceState = (exp, now, grace) => (now < exp ? 'valid' : now < exp + grace ? 'grace' : 'expired');

function checkCritical(claims) {
  const crit = claims.crit;
  if (crit === undefined || crit === null) throw bad('invalid_claims', 'the licence is signed but does not say what a licence must say: missing required claim(s) crit');
  if (!Array.isArray(crit)) throw bad('invalid_claims', "the licence's 'crit' must be a list of claim names");
  if (crit.length === 0) throw bad('invalid_claims', "the licence's 'crit' must not be empty");
  for (const n of crit) if (typeof n !== 'string' || !n) throw bad('invalid_claims', "the licence's 'crit' must contain only non-empty strings");
  const declared = new Set(crit);
  if (declared.size !== crit.length) throw bad('invalid_claims', "the licence's 'crit' must not repeat a claim name");
  if (declared.has('crit')) throw bad('invalid_claims', "the licence's 'crit' must not name itself");
  const undeclared = REQUIRED_CRITICAL.filter((n) => !declared.has(n));
  if (undeclared.length) throw bad('invalid_claims', `the licence's 'crit' must declare ${undeclared.join(', ')} critical; a licence that does not is not a v1 licence whatever its schema_version says`);
  const unenforced = [...declared].filter((n) => !ENFORCED_CLAIMS.includes(n)).sort();
  if (unenforced.length) throw bad('unsupported_claim', `the licence requires this build to enforce something it does not implement, so accepting it would grant more than the licence says: ${unenforced.join(', ')}. Upgrade bravos`);
  const absent = [...declared].filter((n) => claims[n] === undefined || claims[n] === null).sort();
  if (absent.length) throw bad('invalid_claims', `the licence is signed but does not say what a licence must say: critical claim(s) declared but absent: ${absent.join(', ')}`);
}

function trialOf(claims, issuedAt, exp) {
  if (!('trial' in claims)) return null;
  const raw = claims.trial;
  const keys = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw).sort() : null;
  if (!keys || keys.join(',') !== 'ends_at,started_at' || !claims.crit.includes('trial')) throw bad('invalid_claims', 'The trial licence is incomplete. Download it again.');
  const start = integer('trial.started_at', raw.started_at);
  const end = integer('trial.ends_at', raw.ends_at);
  if (start < 0 || end < 0 || issuedAt === null || !(start <= issuedAt && issuedAt < end) || end !== exp) throw bad('invalid_claims', 'The trial licence dates are invalid.');
  return { startedAt: start, endsAt: end };
}

function entitle(claims, now, graceCap, product = PRODUCT, schemaVersions = SCHEMA_VERSIONS) {
  const sv = claims.schema_version;
  if (sv === undefined || sv === null) throw bad('invalid_claims', 'the licence is signed but does not say what a licence must say: missing required claim(s) schema_version');
  const version = integer('schema_version', sv);
  if (!schemaVersions.includes(version)) throw bad('unsupported_schema', `the licence is a newer kind of licence than this build reads, so this build would be guessing at what it grants (schema version ${version}; this build implements ${schemaVersions.join(', ')}). Upgrade bravos`);
  checkCritical(claims);
  const missing = REQUIRED_CLAIMS.filter((n) => claims[n] === undefined || claims[n] === null);
  if (missing.length) throw bad('invalid_claims', `the licence is signed but does not say what a licence must say: missing required claim(s) ${missing.join(', ')}`);
  const tenant = text('sub', claims.sub);
  const scopedTo = text('product', claims.product);
  const tier = text('tier', claims.tier);
  const seats = count('seats', claims.seats);
  const exp = moment('exp', claims.exp);
  const feats = features(claims.features);
  const repoLimit = claims.repo_limit === undefined || claims.repo_limit === null ? null : count('repo_limit', claims.repo_limit);
  const iat = claims.iat === undefined || claims.iat === null ? null : moment('iat', claims.iat);
  const nbf = claims.nbf === undefined || claims.nbf === null ? null : moment('nbf', claims.nbf);
  const jti = claims.jti === undefined || claims.jti === null ? null : text('jti', claims.jti);
  const iss = claims.iss === undefined || claims.iss === null ? null : text('iss', claims.iss);
  const trial = trialOf(claims, iat, exp);
  if (trial) {
    // A trial is one person on the Team bundle for its term; the Python CLI additionally pinned features to ["sast"], which this product does not.
    if (tier !== 'team' || seats !== 1) throw bad('invalid_claims', 'This trial licence has invalid permissions.');
    if (now < trial.startedAt) throw bad('not_yet_valid', 'Your trial has not started yet.');
  }
  if (scopedTo !== product) throw bad('product_mismatch', `the licence is for a different product than this build ('${scopedTo}', not '${product}')`);
  if (nbf !== null && now < nbf) throw bad('not_yet_valid', `the licence term has not started yet — it starts at ${new Date(nbf * 1000).toISOString()}; check this machine's clock if it should have`);
  const grace = trial ? 0 : graceWindowSeconds(exp, nbf !== null ? nbf : iat, graceCap);
  return {
    state: licenceState(exp, now, grace),
    reason: null,
    message: null,
    tenant,
    product: scopedTo,
    schemaVersion: version,
    tier,
    seats,
    features: feats,
    repoLimit,
    expiresAt: exp,
    graceUntil: exp + grace,
    issuedAt: iat,
    notBefore: nbf,
    licenceId: jti,
    issuer: iss,
    trial,
  };
}

// @comment -- "Verifies one token at one instant against one key set and answers a status, never throwing: state valid|grace|expired for a licence this build accepts, or invalid with a reason code (malformed, unsupported_alg, unknown_key, bad_signature, invalid_claims, not_yet_valid, unsupported_schema, unsupported_claim, product_mismatch). `keys` maps kid to a PEM public key and defaults to the trusted set; tests pass their own."
export function verifyAt(token, now, keys = trustedKeys(), graceCap = GRACE_CAP_SECONDS, opts = {}) {
  // The product and schema versions this verifier enforces; the contract's conformance vectors run one verifier per product.
  const product = opts.product ?? PRODUCT;
  const schemaVersions = opts.schemaVersions ?? SCHEMA_VERSIONS;
  try {
    if (typeof token !== 'string') throw malformed('token', `is a string, got ${typeof token}`);
    if (Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) throw malformed('token', `is at most ${MAX_TOKEN_BYTES} bytes, got ${Buffer.byteLength(token, 'utf8')}`);
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7f]/.test(token)) throw malformed('token', 'is a single ASCII word; this one carries a non-ASCII byte');
    const parts = token.split('.');
    if (parts.length !== 3) throw malformed('token', `is 3 dot-separated segments, got ${parts.length}`);
    const [h, c, s] = parts;
    const header = jsonObject(b64url(h, 'header'), 'header');
    if (header.alg !== ALGORITHM) throw bad('unsupported_alg', `the licence names a signing algorithm this build does not verify (${JSON.stringify(header.alg)}, not '${ALGORITHM}'), so its signature proves nothing`);
    const kid = header.kid;
    // A keyring selects by kid (what a shipped build holds, so a rotated key reads as unknown_key, not forged).
    // A single key, written as the '*' entry, is tried whatever the kid says — the contract's single-key verifier (§8.2), used by the shared vectors.
    const pem = keys['*'] ?? (typeof kid === 'string' ? keys[kid] : undefined);
    if (!pem) {
      const detail = Object.keys(keys).length === 0 ? 'no verification keys are configured' : typeof kid !== 'string' ? 'the licence header names no kid, so there is no key to check it with' : kid === DEV_KID ? `${kid} is the development key, which a released bravos does not trust` : `no verification key for kid '${kid}'`;
      throw bad('unknown_key', `the licence was signed with a key this build does not trust (${detail}). A rotated key is restored by upgrading bravos, not by editing anything here`);
    }
    const sig = b64url(s, 'signature');
    if (sig.length !== SIGNATURE_BYTES) throw bad('bad_signature', `an Ed25519 signature is ${SIGNATURE_BYTES} bytes, got ${sig.length}, so the licence signature does not verify`);
    let ok = false;
    try {
      ok = cryptoVerify(null, Buffer.from(`${h}.${c}`, 'ascii'), createPublicKey({ key: pem, format: 'pem' }), sig);
    } catch {
      ok = false;
    }
    if (!ok) throw bad('bad_signature', 'the licence signature does not verify — it has been altered, or it was not issued by Bugb');
    const claims = jsonObject(b64url(c, 'claims'), 'claims');
    return { ...entitle(claims, now, graceCap, product, schemaVersions), kid };
  } catch (e) {
    if (e instanceof Malformed) return invalid('malformed', e.message);
    if (e instanceof Invalid) return invalid(e.reason, e.message);
    return invalid('malformed', `the token could not be read: ${e && e.message ? e.message : String(e)}`);
  }
}

const invalid = (reason, message) => ({ state: 'invalid', reason, message, tenant: null, product: null, schemaVersion: null, tier: null, seats: null, features: [], repoLimit: null, expiresAt: null, graceUntil: null, issuedAt: null, notBefore: null, licenceId: null, issuer: null, trial: null, kid: null });

export const verify = (token, keys) => verifyAt(token, Math.floor(Date.now() / 1000), keys);

// ---------------------------------------------------------------------------------------------
// Where the licence is
// ---------------------------------------------------------------------------------------------

const readText = (file) => {
  try {
    const t = readFileSync(file, 'utf8').trim();
    return t || null;
  } catch {
    return null;
  }
};

export const bravosHome = (env = process.env) => env.BRAVOS_HOME || (env.HOME ? join(env.HOME, '.bravos') : null);

// @comment -- "Finds the licence: $BRAVOS_LICENCE or $BRAVOS_LICENSE first (a path when it contains a separator or starts with ~, else the token itself), then licence.jwt, license.jwt or bravos-license.jwt under $BRAVOS_HOME, ~/.bravos and the pre-rename ~/.bugb. The environment wins because it is the narrower statement. Returns {token, source, reason}: reason 'unreadable' when the variable names a file that cannot be read, 'absent' when nothing is found."
export function find(env = process.env) {
  for (const name of [LICENCE_ENV, LICENCE_ENV_ALT]) {
    const raw = (env[name] || '').trim();
    if (!raw) continue;
    if (raw.includes(sep) || raw.includes('/') || raw.startsWith('~')) {
      const file = raw.startsWith('~') && env.HOME ? join(env.HOME, raw.slice(1)) : raw;
      const t = readText(file);
      if (t === null) return { token: null, source: `$${name} -> ${file}`, reason: 'unreadable' };
      return { token: t, source: `$${name} -> ${file}`, reason: null };
    }
    return { token: raw, source: `$${name}`, reason: null };
  }
  const homes = [env.BRAVOS_HOME, env.HOME && join(env.HOME, '.bravos'), env.HOME && join(env.HOME, '.bugb')].filter(Boolean);
  for (const home of homes) {
    for (const f of LICENCE_FILES) {
      const t = readText(join(home, f));
      if (t !== null) return { token: t, source: join(home, f), reason: null };
    }
  }
  return { token: null, source: `$${LICENCE_ENV} and ${join(bravosHome(env) || '~/.bravos', LICENCE_FILES[0])}`, reason: 'absent' };
}

// @comment -- "The licence status this session runs under: find + verify at now, plus what is unlocked. `absent` and `unreadable` are states of their own, so a briefing can say 'no licence' rather than 'invalid'."
export function status(env = process.env, now = Math.floor(Date.now() / 1000), keys = trustedKeys()) {
  const found = find(env);
  if (!found.token) {
    return { ...invalid(found.reason, found.reason === 'unreadable' ? `${found.source} could not be read` : `no licence at ${found.source}`), state: found.reason, source: found.source, licensed: false, unlocked: [], locked: [...PAID_FEATURES] };
  }
  const v = verifyAt(found.token, now, keys);
  const licensed = isLicensed(v);
  return { ...v, source: found.source, licensed, unlocked: licensed ? [...PAID_FEATURES] : [], locked: licensed ? [] : [...PAID_FEATURES] };
}

// ---------------------------------------------------------------------------------------------
// What it unlocks
// ---------------------------------------------------------------------------------------------

export const tierRank = (tier) => TIERS.indexOf(tier);

/** Whether a verified status unlocks the paid bundle: a paid tier, and not expired (grace still runs, and says so). */
export const isLicensed = (v) => (v.state === 'valid' || v.state === 'grace') && PAID_TIERS.includes(v.tier);

// @comment -- "The one entitlement question every gate asks. v1 gates on the tier alone; the features claim is carried and shown, not enforced, until a per-feature add-on exists. An unknown feature name is free (a gate that misspells its own name must fail open into the free behaviour, not lock a paying customer out of something nobody sells)."
export const entitled = (v, feature) => !PAID_FEATURES.includes(feature) || isLicensed(v);

const days = (seconds) => Math.max(0, Math.ceil(seconds / 86400));
const date = (s) => new Date(s * 1000).toISOString().slice(0, 10);

// @comment -- "The one-line plan statement the briefing, doctor, next and watch all print, so a person always knows which tier they are on and what would change it."
export function planLine(v, now = Math.floor(Date.now() / 1000)) {
  const locked = PAID_FEATURES.map((f) => PAID_FEATURE_LABELS[f]).join(', ');
  const activate = `bravos account activate starts a 30-day Team trial, no card`;
  if (v.state === 'absent') return `Plan: Free (researcher) — ${locked} are on Team · ${activate}`;
  if (v.state === 'unreadable') return `Plan: Free (researcher) — the licence at ${v.source} could not be read · ${activate}`;
  if (v.state === 'invalid') return `Plan: Free (researcher) — the licence at ${v.source} is not accepted (${v.reason}): ${v.message} · ${ACCOUNT_LICENCES}`;
  const tierName = v.tier.charAt(0).toUpperCase() + v.tier.slice(1);
  if (v.state === 'expired') return `Plan: ${tierName}, expired ${date(v.expiresAt)} — ${locked} are locked until it is renewed · ${ACCOUNT_LICENCES}`;
  if (!PAID_TIERS.includes(v.tier)) return `Plan: Free (researcher, signed in) — ${locked} are on Team · ${ACCOUNT_UPGRADE}`;
  if (v.trial) return `Plan: Team (trial, ${days(v.trial.endsAt - now)} days left) — everything is unlocked until ${date(v.trial.endsAt)} · ${ACCOUNT_UPGRADE} to keep it`;
  if (v.state === 'grace') return `Plan: ${tierName} · ${v.seats} seat${v.seats === 1 ? '' : 's'} · expired ${date(v.expiresAt)}, in grace until ${date(v.graceUntil)} — renew at ${ACCOUNT_LICENCES}`;
  return `Plan: ${tierName} · ${v.seats} seat${v.seats === 1 ? '' : 's'} · renews ${date(v.expiresAt)}`;
}

// @comment -- "What a gate says when a paid feature is asked for without the licence for it: what the feature does, that it is on the Team plan, and the two ways to get it. Never silent, never a stack trace."
export function refusal(v, feature, what) {
  const label = PAID_FEATURE_LABELS[feature] ?? feature;
  const lead = what ? `${what} ` : `${label.charAt(0).toUpperCase() + label.slice(1)} `;
  const tail = v.state === 'expired' ? `your ${v.tier} licence expired ${date(v.expiresAt)}; renew at ${ACCOUNT_LICENCES}` : v.state === 'invalid' || v.state === 'unreadable' ? `the licence at ${v.source} is not accepted (${v.reason}); ${ACCOUNT_LICENCES}` : `it is on the Team plan: bravos account activate starts a 30-day trial (no card), or ${ACCOUNT_UPGRADE}`;
  return `${lead}needs a licence — ${tail}`;
}
