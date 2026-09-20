/**
 * Distribution queue runner.
 *
 * Reads scripts/social/content.json, finds posts whose scheduled time has
 * passed and that have not been published yet, and publishes them to X,
 * LinkedIn or Reddit.
 *
 *   npm run social:queue -- --dry-run     preview what would post
 *   npm run social:queue                  publish due posts
 *   npm run social:queue -- --id=<postId> publish one post now
 *
 * Published IDs are recorded in scripts/social/.published.json so a re-run is
 * safe. Add that file to .gitignore if you run this from more than one machine.
 *
 * Credentials come from the environment and are never written anywhere. A
 * channel with missing credentials is skipped with an explanation rather than
 * failing the whole run.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_PATH = join(HERE, 'content.json');
const STATE_PATH = join(HERE, '.published.json');

interface Post {
  id: string;
  channel: 'x' | 'linkedin' | 'reddit';
  scheduledFor: string;
  body: string;
  title?: string;
  subreddit?: string;
  link?: string | null;
}

interface PublishResult {
  ok: boolean;
  url?: string;
  error?: string;
}

async function loadPosts(): Promise<Post[]> {
  const raw = await readFile(CONTENT_PATH, 'utf8');
  const parsed = JSON.parse(raw) as { posts: Post[] };
  return parsed.posts ?? [];
}

async function loadPublished(): Promise<Set<string>> {
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function savePublished(ids: Set<string>): Promise<void> {
  await writeFile(STATE_PATH, JSON.stringify([...ids], null, 2), 'utf8');
}

/* ------------------------------------------------------------------ X (Twitter) */

/**
 * OAuth 1.0a request signing. X's v2 POST /2/tweets still uses it for
 * user-context writes, and it is short enough to implement correctly here
 * rather than pulling in a dependency.
 */
function oauthHeader(
  method: string,
  url: string,
  credentials: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  },
): string {
  const params: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
  };

  const encode = (value: string): string =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );

  const parameterString = Object.keys(params)
    .sort()
    .map((key) => `${encode(key)}=${encode(params[key] as string)}`)
    .join('&');

  const baseString = [method.toUpperCase(), encode(url), encode(parameterString)].join('&');
  const signingKey = `${encode(credentials.apiSecret)}&${encode(credentials.accessSecret)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  const header: Record<string, string> = { ...params, oauth_signature: signature };

  return `OAuth ${Object.keys(header)
    .sort()
    .map((key) => `${encode(key)}="${encode(header[key] as string)}"`)
    .join(', ')}`;
}

async function postToX(post: Post): Promise<PublishResult> {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return {
      ok: false,
      error: 'X credentials missing (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET).',
    };
  }

  const url = 'https://api.twitter.com/2/tweets';
  const text = post.link ? `${post.body}\n\n${post.link}` : post.body;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: oauthHeader('POST', url, { apiKey, apiSecret, accessToken, accessSecret }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: { id?: string };
    detail?: string;
    title?: string;
  } | null;

  if (!response.ok) {
    return { ok: false, error: payload?.detail ?? payload?.title ?? `HTTP ${response.status}` };
  }

  return { ok: true, url: `https://x.com/i/status/${payload?.data?.id ?? ''}` };
}

/* ------------------------------------------------------------------ LinkedIn */

async function postToLinkedIn(post: Post): Promise<PublishResult> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const author = process.env.LINKEDIN_AUTHOR_URN;

  if (!token || !author) {
    return {
      ok: false,
      error: 'LinkedIn credentials missing (LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN).',
    };
  }

  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: post.link ? `${post.body}\n\n${post.link}` : post.body },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { ok: false, error: text || `HTTP ${response.status}` };
  }

  const id = response.headers.get('x-restli-id') ?? '';
  return { ok: true, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
}

/* ------------------------------------------------------------------ Reddit */

async function redditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) return null;

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'crawlable-queue/1.0',
    },
    body: new URLSearchParams({ grant_type: 'password', username, password }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { access_token?: string };
  return payload.access_token ?? null;
}

async function postToReddit(post: Post): Promise<PublishResult> {
  if (!post.subreddit || !post.title) {
    return { ok: false, error: 'Reddit posts need a subreddit and a title.' };
  }

  const token = await redditToken();
  if (!token) {
    return {
      ok: false,
      error:
        'Reddit credentials missing or rejected (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD).',
    };
  }

  const response = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'crawlable-queue/1.0',
    },
    body: new URLSearchParams({
      sr: post.subreddit,
      kind: 'self',
      title: post.title,
      text: post.body,
      api_type: 'json',
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    json?: { errors?: string[][]; data?: { url?: string } };
  } | null;

  const errors = payload?.json?.errors ?? [];
  if (!response.ok || errors.length > 0) {
    return { ok: false, error: errors[0]?.join(': ') ?? `HTTP ${response.status}` };
  }

  return { ok: true, url: payload?.json?.data?.url };
}

/* ------------------------------------------------------------------ Runner */

async function publish(post: Post): Promise<PublishResult> {
  switch (post.channel) {
    case 'x':
      return postToX(post);
    case 'linkedin':
      return postToLinkedIn(post);
    case 'reddit':
      return postToReddit(post);
    default:
      return { ok: false, error: `Unknown channel: ${String(post.channel)}` };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const only = args.find((arg) => arg.startsWith('--id='))?.slice(5);

  const posts = await loadPosts();
  const published = await loadPublished();
  const now = Date.now();

  const due = posts.filter((post) => {
    if (only) return post.id === only;
    if (published.has(post.id)) return false;
    return Date.parse(post.scheduledFor) <= now;
  });

  if (due.length === 0) {
    console.log('Nothing due.');
    return;
  }

  console.log(`${due.length} post(s) due${dryRun ? ' (dry run)' : ''}\n`);

  for (const post of due) {
    const preview = post.body.split('\n')[0]?.slice(0, 72) ?? '';
    console.log(`[${post.channel}] ${post.id}`);
    console.log(`  ${preview}${post.body.length > 72 ? '…' : ''}`);

    if (dryRun) {
      console.log('  → would publish\n');
      continue;
    }

    const result = await publish(post);

    if (result.ok) {
      published.add(post.id);
      await savePublished(published);
      console.log(`  → published${result.url ? ` ${result.url}` : ''}\n`);
    } else {
      console.log(`  → failed: ${result.error}\n`);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
