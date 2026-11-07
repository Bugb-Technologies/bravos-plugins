// @comment -- "Keeps a per-machine (device) licence current: the account portal issues each `bravos account activate` a short-lived token for (account, person, machine) carrying non-critical `uid`/`did` claims, and the device code from that pairing becomes this machine's refresh secret, kept in $BRAVOS_HOME/device.json (0600). refreshIfDue() trades the secret for a fresh token at the portal origin recorded at activation, once less than half the token's term is left (or it has expired, or the file is missing), verifies the new token with the same offline verifier before writing it, and fails OPEN on a network error, a timeout or a 5xx — the held token keeps working for whatever term it has. A refusal that means the machine is no longer licensed (401 invalid_device; 403 device_revoked, licence_unassigned, account_unavailable) removes the token and the device file, so the machine is back on Free and says why. A token supplied through BRAVOS_LICENCE / BRAVOS_LICENSE (CI) is never refreshed. Dependency-free (node:fs and the global fetch) so the session hook and the CLI share this one implementation."
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCOUNT_LICENCES, ACCOUNT_UPGRADE, LICENCE_ENV, LICENCE_ENV_ALT, LICENCE_FILES, bravosHome, verify } from './licence.mjs';

export const DEVICE_FILE = 'device.json';
export const REFRESH_PATH = '/api/v1/cli/licence/refresh';
export const DEVICES_PATH = '/api/v1/cli/devices';
export const REVOKE_PATH = '/api/v1/cli/devices/revoke';
export const REFRESH_TIMEOUT_MS = 5000;
/** After a refresh that could not reach the portal, an unforced refresh waits this long before trying again. */
export const RETRY_AFTER_FAILURE_SECONDS = 15 * 60;
/** The portal's device code is 32 random bytes, base64url (43 characters); anything else never goes in a header. */
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
const ORIGIN_RE = /^https?:\/\/[^/\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The refusals that mean this machine is no longer licensed; anything else is a reason to keep the token. */
export const REVOKED_ERRORS = ['invalid_device', 'device_revoked', 'licence_unassigned', 'account_unavailable'];

export const isDeviceSecret = (s) => typeof s === 'string' && SECRET_RE.test(s);
export const isDeviceId = (s) => typeof s === 'string' && UUID_RE.test(s);

/** The licence file activate and refresh write: $BRAVOS_HOME/licence.jwt. */
export const licencePath = (env = process.env) => {
  const home = bravosHome(env);
  return home ? join(home, LICENCE_FILES[0]) : null;
};
export const devicePath = (env = process.env) => {
  const home = bravosHome(env);
  return home ? join(home, DEVICE_FILE) : null;
};

// @comment -- "Reads $BRAVOS_HOME/device.json and accepts it only when every field has the shape the portal issues (an http(s) origin, a 43-character base64url secret, a uuid device id or none), so a hand-edited or truncated file can never put arbitrary text into a request header or send the secret to a different kind of URL."
export function readDevice(env = process.env) {
  const file = devicePath(env);
  if (!file) return null;
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.origin !== 'string' || !ORIGIN_RE.test(raw.origin)) return null;
  if (!isDeviceSecret(raw.device_secret)) return null;
  const deviceId = isDeviceId(raw.device_id) ? raw.device_id : null;
  const failedAt = typeof raw.refresh_failed_at === 'number' && Number.isFinite(raw.refresh_failed_at) ? raw.refresh_failed_at : null;
  return { origin: raw.origin, device_id: deviceId, device_secret: raw.device_secret, refresh_failed_at: failedAt };
}

/** Writes a file 0600 in a 0700 folder, through a temporary sibling and a rename so a reader never sees half of it. */
function writePrivate(file, text) {
  mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, { mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    /* best effort on platforms without modes */
  }
  renameSync(tmp, file);
}

// @comment -- "Writes device.json (0600, folder 0700): the portal origin, the device id and the refresh secret. Refuses a record that would not read back, so a bad value is caught at activation rather than at the first refresh."
export function writeDevice(env, record) {
  const file = devicePath(env);
  if (!file) throw new Error('no home directory: set BRAVOS_HOME');
  if (!ORIGIN_RE.test(record.origin ?? '') || !isDeviceSecret(record.device_secret)) throw new Error('refusing to write a device record the portal did not issue');
  const out = { origin: record.origin, device_id: isDeviceId(record.device_id) ? record.device_id : null, device_secret: record.device_secret };
  if (typeof record.refresh_failed_at === 'number') out.refresh_failed_at = record.refresh_failed_at;
  writePrivate(file, JSON.stringify(out, null, 2) + '\n');
  return file;
}

/** Writes the licence token to $BRAVOS_HOME/licence.jwt, 0600. */
export function writeLicence(env, token) {
  const file = licencePath(env);
  if (!file) throw new Error('no home directory: set BRAVOS_HOME');
  writePrivate(file, token.trim() + '\n');
  return file;
}

// @comment -- "Removes this machine's licence and device record (licence.jwt and device.json under $BRAVOS_HOME), the local half of a logout or a revocation. Only those two files: a licence kept elsewhere, or in the environment, is the person's own and is left alone."
export function forgetDevice(env = process.env) {
  const removed = [];
  for (const file of [licencePath(env), devicePath(env)]) {
    if (!file) continue;
    try {
      rmSync(file);
      removed.push(file);
    } catch {
      /* already gone */
    }
  }
  return removed;
}

/** The claims of a token, unverified — read only after verify() has accepted it, for `did`, `iat` and `exp`. */
export function claimsOf(token) {
  try {
    const parsed = JSON.parse(Buffer.from(String(token).split('.')[1] ?? '', 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a verified device token should be replaced: past half its term, expired, in grace, or unreadable. */
export function refreshDue(v, now) {
  if (v.state !== 'valid') return true;
  if (typeof v.expiresAt !== 'number' || typeof v.issuedAt !== 'number') return true;
  const term = v.expiresAt - v.issuedAt;
  if (!(term > 0)) return true;
  return v.expiresAt - now < term / 2;
}

const readToken = (file) => {
  try {
    return readFileSync(file, 'utf8').trim() || null;
  } catch {
    return null;
  }
};

/** What to tell the person when the portal says this machine is no longer licensed. */
export function revokedNote(error) {
  if (error === 'licence_unassigned') return `You no longer hold a licence on your team's account, so this machine is back on Free. Ask an owner or admin for a licence (${ACCOUNT_LICENCES}), then run bravos account activate.`;
  if (error === 'device_revoked') return 'This machine was removed from your account in the account portal, so it is back on Free. To use the Team features here again, run bravos account activate.';
  if (error === 'account_unavailable') return "Your team's account is not available, so this machine is back on Free. Ask your account owner, or contact Bugb support.";
  return 'The account portal no longer recognises this machine, so it is back on Free. Run bravos account activate to sign it in again.';
}

const sameOriginLink = (link, origin, fallback) => (typeof link === 'string' && link.startsWith(origin + '/') ? link : fallback);

// @comment -- "The refresh itself: POST <origin>/api/v1/cli/licence/refresh with the device secret as a bearer, to the origin stored at activation and nowhere else, under a timeout. Outcomes: skipped (no device file, an environment token, BRAVOS_NO_FETCH or BRAVOS_REFRESH=off, or not a device token), fresh (not due), refreshed (a new token verified and written), kept (fail-open: no answer, a 5xx, a 429, or an answer that did not verify — the held token stays), lapsed (402: the plan ended; the token runs out on its own), revoked (the licence and device file are removed). Never throws."
export async function refreshIfDue(env = process.env, opts = {}) {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const f = opts.fetch ?? globalThis.fetch;
  const force = !!opts.force;
  try {
    if ((env[LICENCE_ENV] || '').trim() || (env[LICENCE_ENV_ALT] || '').trim()) return { outcome: 'skipped', reason: 'environment' };
    if (env.BRAVOS_NO_FETCH || env.BRAVOS_REFRESH === 'off') return { outcome: 'skipped', reason: 'disabled' };
    const device = readDevice(env);
    if (!device) return { outcome: 'skipped', reason: 'no-device' };
    const file = licencePath(env);
    const token = file ? readToken(file) : null;
    if (token) {
      const v = verify(token);
      const claims = v.state === 'invalid' ? null : claimsOf(token);
      // A licence that is not a device token (an import, a trial) is not this refresh's to replace.
      if (claims && typeof claims.did !== 'string') return { outcome: 'skipped', reason: 'not-a-device-token' };
      if (!force && v.state !== 'invalid' && !refreshDue(v, now)) return { outcome: 'fresh' };
    }
    if (!force && device.refresh_failed_at !== null && now - device.refresh_failed_at < RETRY_AFTER_FAILURE_SECONDS) return { outcome: 'kept', reason: 'backing-off' };

    const keep = (reason) => {
      try {
        writeDevice(env, { ...device, refresh_failed_at: now });
      } catch {
        /* the backoff marker is a courtesy */
      }
      return { outcome: 'kept', reason };
    };
    let r;
    try {
      r = await f(`${device.origin}${REFRESH_PATH}`, {
        method: 'POST',
        headers: { 'User-Agent': opts.userAgent ?? 'bravos-cli', Accept: 'application/json', Authorization: `Bearer ${device.device_secret}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? REFRESH_TIMEOUT_MS),
      });
    } catch {
      return keep('unreachable');
    }
    let body = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    const error = body && typeof body.error === 'string' ? body.error : null;
    if (r.status === 200) {
      const fresh = body && typeof body.license === 'string' ? body.license.trim() : '';
      const nv = fresh ? verify(fresh) : null;
      if (!nv || nv.state === 'invalid') return keep('unverified');
      writeLicence(env, fresh);
      const did = claimsOf(fresh)?.did;
      writeDevice(env, { origin: device.origin, device_id: isDeviceId(did) ? did : device.device_id, device_secret: device.device_secret });
      return { outcome: 'refreshed', expiresAt: nv.expiresAt };
    }
    if (r.status === 401 || (r.status === 403 && REVOKED_ERRORS.includes(error))) {
      const why = r.status === 401 ? 'invalid_device' : error;
      forgetDevice(env);
      return { outcome: 'revoked', reason: why, note: revokedNote(why) };
    }
    if (r.status === 402) {
      const upgrade = sameOriginLink(body?.upgrade, device.origin, ACCOUNT_UPGRADE);
      return { outcome: 'lapsed', reason: 'licence_required', note: `Your team's plan has ended, so this machine's licence will not be renewed. Choose a plan at ${upgrade}.` };
    }
    return keep(`http-${r.status}`);
  } catch (e) {
    return { outcome: 'kept', reason: e && e.message ? e.message : 'error' };
  }
}
