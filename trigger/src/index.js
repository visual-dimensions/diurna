/**
 * Diurna fetch trigger.
 *
 * GitHub drops most scheduled workflow runs of public repositories under load, so this
 * Cloudflare Cron Trigger starts the "Fetch headlines" workflow instead (workflow_dispatch).
 * It only sends that one request: it serves no data and stores nothing – the site stays
 * static (CLAUDE.md, principle 1).
 *
 * Secret (set by the repository owner, never in code):
 *   GITHUB_TOKEN – fine-grained token, repository visual-dimensions/diurna only,
 *                  permission "Actions: Read and write".
 */

const REPO = 'visual-dimensions/diurna';
const WORKFLOW = 'fetch.yml';

async function dispatch(env) {
  if (!env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is not set – nothing dispatched');
    return;
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'diurna-trigger (+https://github.com/visual-dimensions/diurna)',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  // 204 No Content = dispatched. Anything else is logged (visible with `wrangler tail`).
  if (res.status !== 204) console.error(`dispatch failed: HTTP ${res.status} ${await res.text()}`);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },
};
