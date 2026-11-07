// @comment -- "Reads the bravos workspace snapshot (.bravos/workspace/workspace.json, written by bravos workspace) and its cached bravos export, for the briefing and watch: which application this repo belongs to, its sibling services, the cross-service edges into and out of it, and at the app folder a per-service summary. Read-only and dependency-free; a missing or foreign file reads as no workspace."
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const WORKSPACE_SCHEMA = 'bravos.workspace/v1';
export const EXPORT_SCHEMA = 'bravos.workspace-export/v1';
export const MAX_MEMBERS = 8;

const read = (file, schema) => {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return j?.schema === schema ? j : null;
  } catch {
    return null;
  }
};

// @comment -- "The workspace this root belongs to: the snapshot, the cached export, whether root is the app folder, and which member it is (null at the app folder)."
export function readWorkspace(root) {
  const dir = join(root, '.bravos', 'workspace');
  const snap = read(join(dir, 'workspace.json'), WORKSPACE_SCHEMA);
  if (!snap || !Array.isArray(snap.members)) return null;
  const exp = read(join(dir, 'export.json'), EXPORT_SCHEMA);
  const here = resolve(root);
  const member = snap.members.find((m) => resolve(m.path) === here) ?? null;
  return { name: snap.name, appFolder: snap.appFolder ?? null, isAppFolder: !!snap.appFolder && resolve(snap.appFolder) === here, member: member?.name ?? null, members: snap.members, export: exp, at: snap.at };
}

// @comment -- "Runs guardlink ci -f json in each member (at most MAX_MEMBERS, concurrently, through the caller's runner) and returns {name: {open, bySeverity, confirmed, stale, coverage} | null}; a member that fails or times out reads as null, never as zero."
export async function memberCounts(ws, runJson, env, timeoutMs) {
  const out = {};
  const members = ws.members.slice(0, MAX_MEMBERS);
  const results = await Promise.all(members.map((m) => runJson('guardlink', ['ci', '-f', 'json'], { cwd: m.path, env, timeoutMs })));
  members.forEach((m, k) => {
    const r = results[k];
    const s = r?.ok ? r.json?.summary : null;
    out[m.name] = s
      ? {
          open: Number(s.exposures) || 0,
          bySeverity: s.by_severity ?? {},
          confirmed: Array.isArray(r.json.confirmed) ? r.json.confirmed.length : 0,
          stale: Number(s.stale) || 0,
          coverage: s.coverage ? Number(s.coverage.percent) || 0 : null,
        }
      : null;
  });
  return out;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// @comment -- "The briefing's workspace lines: in a member, the app, the other services and the cross-service calls into and out of it; at the app folder, one row per service and the edges, unresolved references and clashes; and where to work for each kind of question."
export function workspaceLines(ws, counts) {
  if (!ws) return [];
  const edges = ws.export?.edges ?? null;
  const lines = [];
  if (ws.isAppFolder) {
    lines.push(`Workspace: ${ws.name} — this is the app folder for ${plural(ws.members.length, 'service')}; make changes inside a service's repo, ask questions that cross services here`);
    for (const m of ws.members.slice(0, MAX_MEMBERS)) {
      const c = counts?.[m.name];
      const sev = c ? ['critical', 'high'].filter((k) => c.bySeverity?.[k]).map((k) => `${c.bySeverity[k]} ${k}`).join(', ') : '';
      lines.push(`  ${m.name}${m.url ? ` (${m.url})` : ''}: ${c ? `${c.open} open${sev ? ` (${sev})` : ''} · ${c.confirmed} confirmed · coverage ${c.coverage ?? '?'}%` : 'counts unknown (guardlink ci failed or timed out)'}`);
    }
    if (ws.members.length > MAX_MEMBERS) lines.push(`  … and ${ws.members.length - MAX_MEMBERS} more (bravos workspace show)`);
  } else {
    const others = ws.members.filter((m) => m.name !== ws.member).map((m) => m.name);
    const into = edges ? edges.filter((e) => e.dstMember === ws.member) : null;
    const outof = edges ? edges.filter((e) => e.srcMember === ws.member) : null;
    lines.push(`Workspace: ${ws.name} — this repo is the ${ws.member ?? '?'} service; the others are ${others.join(', ') || 'none'}`);
    if (into && outof) {
      const fmt = (e, dir) => (dir === 'in' ? `${e.srcMember}:${e.src} → ${e.dst}` : `${e.src} → ${e.dstMember}:${e.dst}`);
      lines.push(`  calls into this service: ${into.length ? into.map((e) => fmt(e, 'in')).join(', ') : 'none declared'}; calls out: ${outof.length ? outof.map((e) => fmt(e, 'out')).join(', ') : 'none declared'}`);
    } else lines.push('  cross-service calls: unknown (run bravos workspace show)');
  }
  if (edges) lines.push(`  ${plural(edges.length, 'cross-service edge')} declared${ws.export.unresolved?.length ? ` · ${ws.export.unresolved.length} unresolved reference${ws.export.unresolved.length === 1 ? '' : 's'}` : ''}${ws.export.clashes?.length ? ` · ${plural(ws.export.clashes.length, 'id clash')}` : ''}`);
  lines.push(`  Declare a call to another service as @flows #<this>-<x> -> #<other>-<y> via http|grpc|queue (plain ids; not the dotted #repo.tag form). The code graph links services only when built over the app folder${ws.appFolder ? ` (bravos graph build ${ws.appFolder} --scip no-exec)` : ''}.`);
  return lines;
}
