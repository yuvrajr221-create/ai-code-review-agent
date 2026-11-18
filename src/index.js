import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import Resolver from '@forge/resolver';

const VALID_RISK = ['LOW', 'MEDIUM', 'HIGH'];
const KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const cut = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '...' : String(s || ''));

const adfToText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfToText).join(node.type === 'doc' ? '\n' : '');
  return ['paragraph', 'heading', 'listItem'].includes(node.type) ? inner + '\n' : inner;
};

const toAdf = (text) => ({
  type: 'doc',
  version: 1,
  content: String(text)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
});

const cleanKey = (k) => String(k || '').trim().toUpperCase();
const cleanText = (t) => String(t || '').replace(/[`*#]/g, '').replace(/[ \t]+\n/g, '\n').trim();

const jira = (path, opts) => api.asUser().requestJira(path, opts);

const loadHistory = async (issueKey) => {
  try {
    return (await kvs.get(`reviews:${issueKey}`)) || [];
  } catch (e) {
    return [];
  }
};

export const getIssueContext = async (payload) => {
  const issueKey = cleanKey(payload.issueKey);
  if (!KEY_RE.test(issueKey)) return { error: `Invalid issue key: ${issueKey}` };

  const res = await jira(
    route`/rest/api/3/issue/${issueKey}?fields=summary,description,status,priority,labels,issuelinks,comment`
  );
  if (!res.ok) return { error: `Could not read ${issueKey} (HTTP ${res.status})` };
  const { fields } = await res.json();

  const linkedIssues = (fields.issuelinks || []).slice(0, 10).map((l) => {
    const other = l.outwardIssue || l.inwardIssue;
    const rel = l.outwardIssue ? l.type?.outward : l.type?.inward;
    return other
      ? `${rel}: ${other.key} - ${other.fields?.summary} [${other.fields?.status?.name}]`
      : null;
  }).filter(Boolean);

  const comments = (fields.comment?.comments || [])
    .map((c) => ({ by: c.author?.displayName, text: adfToText(c.body).trim() }))
    .filter((c) => c.text && !c.text.startsWith('AI Code Review'))
    .slice(-5)
    .map((c) => `${c.by}: ${cut(c.text, 300)}`);

  let remoteLinks = [];
  try {
    const rl = await jira(route`/rest/api/3/issue/${issueKey}/remotelink`);
    if (rl.ok) {
      remoteLinks = (await rl.json()).slice(0, 10).map((r) => `${r.object?.title} (${r.object?.url})`);
    }
  } catch (e) {
    remoteLinks = [];
  }

  const history = await loadHistory(issueKey);
  const previousReviews = history.slice(0, 3).map((h) => `${h.at.slice(0, 10)} risk ${h.risk}: ${cut(h.review, 300)}`);

  return {
    issueKey,
    summary: fields.summary,
    status: fields.status?.name,
    priority: fields.priority?.name,
    labels: fields.labels || [],
    requirements: cut(adfToText(fields.description).trim() || '(no description)', 3000),
    linkedIssues,
    linkedDocs: remoteLinks,
    recentComments: comments,
    previousReviews,
  };
};

export const saveReview = async (payload) => {
  const issueKey = cleanKey(payload.issueKey);
  const risk = String(payload.risk || '').toUpperCase();
  const review = cut(cleanText(payload.review), 1500);
  if (!KEY_RE.test(issueKey)) return { error: `Invalid issue key: ${issueKey}` };
  if (!VALID_RISK.includes(risk)) return { error: 'risk must be LOW, MEDIUM or HIGH' };
  if (!review) return { error: 'review is empty' };

  const res = await jira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ body: toAdf(`AI Code Review (risk: ${risk})\n${review}`) }),
  });
  if (!res.ok) return { error: `Could not comment on ${issueKey} (HTTP ${res.status})` };

  const history = await loadHistory(issueKey);
  history.unshift({ at: new Date().toISOString(), risk, review });
  await kvs.set(`reviews:${issueKey}`, history.slice(0, 20));

  let labelSet = false;
  try {
    const lr = await jira(route`/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update: {
          labels: [
            ...VALID_RISK.filter((r) => r !== risk).map((r) => ({ remove: `ai-risk-${r.toLowerCase()}` })),
            { add: `ai-risk-${risk.toLowerCase()}` },
          ],
        },
      }),
    });
    labelSet = lr.ok;
  } catch (e) {
    labelSet = false;
  }
  return { saved: true, issueKey, risk, labelSet };
};

const resolver = new Resolver();
resolver.define('getReviews', async ({ payload }) => {
  const issueKey = cleanKey(payload?.issueKey);
  if (!KEY_RE.test(issueKey)) return [];
  return loadHistory(issueKey);
});
export const resolver_handler = resolver.getDefinitions();
