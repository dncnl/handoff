/**
 * Recent public GitHub activity, fetched live from the REST API (no token: 60
 * requests an hour per visitor IP, so results are cached for the session).
 * Events are summarised into short lines; noisy ones (branch creation, etc.) are dropped.
 */

export interface ActivityItem {
  verb: string;
  repo: string;
  repoUrl: string;
  /** Trailing note, e.g. "5 pushes". */
  detail?: string;
  /** ISO timestamp of the most recent event in the group. */
  at: string;
}

interface GhEvent {
  type: string;
  repo: { name: string };
  created_at: string;
  payload: {
    action?: string;
    number?: number;
    ref_type?: string;
    release?: { tag_name?: string };
    issue?: { number?: number };
  };
}

const TTL_MS = 10 * 60 * 1000;

/** Words before the repo name, or null to skip the event. `key` groups repeats of the same thing. */
function describe(e: GhEvent): { key: string; verb: string } | null {
  const p = e.payload;
  switch (e.type) {
    case 'PushEvent':
      return { key: 'push', verb: 'Pushed to' };
    case 'PullRequestEvent':
      // Opened and merged fold into one line per PR; the newest action wins.
      if (p.action === 'opened' || p.action === 'merged' || p.action === 'closed')
        return {
          key: `pr-${p.number}`,
          verb: `${p.action === 'opened' ? 'Opened' : 'Merged'} PR #${p.number} in`,
        };
      return null;
    case 'CreateEvent':
      return p.ref_type === 'repository' ? { key: 'create', verb: 'Created' } : null;
    case 'PublicEvent':
      return { key: 'public', verb: 'Open-sourced' };
    case 'IssuesEvent':
      return p.action === 'opened'
        ? { key: `issue-${p.issue?.number}`, verb: `Opened issue #${p.issue?.number} in` }
        : null;
    case 'ReleaseEvent':
      return { key: 'release', verb: `Released ${p.release?.tag_name ?? 'a version'} of` };
    case 'ForkEvent':
      return { key: 'fork', verb: 'Forked' };
    case 'WatchEvent':
      return { key: 'star', verb: 'Starred' };
    case 'MemberEvent':
      return { key: 'member', verb: 'Joined' };
    default:
      return null;
  }
}

export function summarise(events: GhEvent[], user: string, limit = 5): ActivityItem[] {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const items: (ActivityItem & { key: string; count: number })[] = [];
  for (const e of sorted) {
    const d = describe(e);
    if (!d) continue;
    const name = e.repo.name;
    const repo = name.startsWith(`${user}/`) ? name.slice(user.length + 1) : name;
    const key = `${d.key}:${name}`;
    // Fold repeats (e.g. a run of pushes to one repo) into the newest line.
    const same = items.find((x) => x.key === key);
    if (same) {
      same.count++;
      continue;
    }
    if (items.length >= limit) continue;
    items.push({
      key,
      count: 1,
      verb: d.verb,
      repo,
      repoUrl: `https://github.com/${name}`,
      at: e.created_at,
    });
  }
  return items.map(({ key: _key, count, ...item }) =>
    count > 1 && item.verb === 'Pushed to' ? { ...item, detail: `${count} pushes` } : item,
  );
}

export async function fetchActivity(user: string): Promise<ActivityItem[]> {
  const cacheKey = `gh-activity:${user}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null') as {
      t: number;
      items: ActivityItem[];
    } | null;
    if (hit && Date.now() - hit.t < TTL_MS) return hit.items;
  } catch {
    /* storage unavailable: just fetch */
  }
  const res = await fetch(`https://api.github.com/users/${user}/events/public?per_page=50`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const items = summarise((await res.json()) as GhEvent[], user);
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items }));
  } catch {
    /* fine without a cache */
  }
  return items;
}

/** "just now", "5h ago", "3d ago", "2w ago", or a short date beyond a couple of months. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 60) return `${Math.floor(s / (86400 * 7))}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
