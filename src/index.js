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

const collectCode = (node, acc = []) => {
  if (!node) return acc;
  if (node.type === 'codeBlock') {
    const t = (node.content || []).map((c) => c.text || '').join('');
    if (t.trim()) acc.push(t.trim());
  }
  (node.content || []).forEach((c) => collectCode(c, acc));
  return acc;
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


const twg = async (query, variables) => {
  const r = await api.asUser().requestTeamworkGraph(query, variables);
  return r.json();
};

const short = (v) => String(v && v.message ? v.message : v).slice(0, 160);

const graphContext = async (issueId, cloudId) => {
  const out = { connected: false, hierarchy: [], linkedPullRequests: [], goalsCount: 0, notes: [] };
  try {
    const e = await twg('query codereview_echo { echo(myString: "ping") }');
    out.connected = e?.data?.echo === 'ping';
  } catch (err) {
    out.notes.push('echo: ' + short(err));
  }
  if (!cloudId || !issueId) {
    out.notes.push('cloudId or issueId missing');
    return out;
  }
  const ari = `ari:cloud:jira:${cloudId}:issue/${issueId}`;

  let kinds = [];
  try {
    const en = await twg(
      'query codereview_kinds { __type(name: "JiraWorkItemHierarchyKind") { enumValues { name } } }'
    );
    kinds = (en?.data?.__type?.enumValues || []).map((v) => v.name).filter((n) => n === 'PARENT' || n === 'CHILD');
  } catch (err) {
    out.notes.push('kinds: ' + short(err));
  }
  for (const k of kinds) {
    if (!/^[A-Z_]+$/.test(k)) continue;
    try {
      const h = await twg(
        `query codereview_hierarchy($id: ID!) { jiraWorkItemHierarchy(id: $id, kinds: [${k}], first: 10) { edges { node { ... on JiraWorkItem { key summary webUrl } } } } }`,
        { id: ari }
      );
      if (h?.errors?.length) {
        out.notes.push(`hierarchy ${k}: ` + short(h.errors[0]));
        continue;
      }
      for (const edge of h?.data?.jiraWorkItemHierarchy?.edges || []) {
        const n = edge?.node;
        if (n?.key) out.hierarchy.push(`${k}: ${n.key} - ${n.summary}`);
      }
    } catch (err) {
      out.notes.push(`hierarchy ${k}: ` + short(err));
    }
  }

  try {
    const pr = await twg(
      'query codereview_pullRequests($id: ID!) { jiraWorkItemLinkedExternalPullRequests(id: $id, first: 5) { edges { node { ... on ExternalPullRequest { displayName description lastUpdatedAt } } } } }',
      { id: ari }
    );
    if (pr?.errors?.length) out.notes.push('pull requests: ' + short(pr.errors[0]));
    for (const edge of pr?.data?.jiraWorkItemLinkedExternalPullRequests?.edges || []) {
      const n = edge?.node;
      if (n?.displayName) out.linkedPullRequests.push(`${n.displayName}: ${cut(n.description, 200)}`);
    }
  } catch (err) {
    out.notes.push('pull requests: ' + short(err));
  }

  try {
    const g = await twg(
      'query codereview_goals($id: ID!) { jiraWorkItemGoals(id: $id, first: 5) { edges { node { __typename } } } }',
      { id: ari }
    );
    if (g?.errors?.length) out.notes.push('goals: ' + short(g.errors[0]));
    out.goalsCount = (g?.data?.jiraWorkItemGoals?.edges || []).length;
  } catch (err) {
    out.notes.push('goals: ' + short(err));
  }
  return out;
};

export const getIssueContext = async (payload, context) => {
  const issueKey = cleanKey(payload.issueKey);
  if (!KEY_RE.test(issueKey)) return { error: `Invalid issue key: ${issueKey}` };

  const res = await jira(
    route`/rest/api/3/issue/${issueKey}?fields=summary,description,status,priority,labels,issuelinks,comment`
  );
  if (!res.ok) return { error: `Could not read ${issueKey} (HTTP ${res.status})` };
  const issue = await res.json();
  const { fields } = issue;

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

  const codeBlocks = [];
  collectCode(fields.description).forEach((c) => codeBlocks.push(`[issue description] ${cut(c, 3000)}`));
  (fields.comment?.comments || []).forEach((c) => {
    if (adfToText(c.body).trim().startsWith('AI Code Review')) return;
    collectCode(c.body).forEach((code) => codeBlocks.push(`[comment by ${c.author?.displayName}] ${cut(code, 3000)}`));
  });

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

  const cloudId = payload?.context?.cloudId || context?.cloudId;
  const teamworkGraph = await graphContext(issue.id, cloudId);
  try {
    await kvs.set(`graph:${issueKey}`, {
      at: new Date().toISOString(),
      parents: teamworkGraph.hierarchy.filter((x) => x.startsWith('PARENT')).map((x) => x.replace(/^PARENT: /, '')),
      children: teamworkGraph.hierarchy.filter((x) => x.startsWith('CHILD')).length,
      pullRequests: teamworkGraph.linkedPullRequests.length,
      goals: teamworkGraph.goalsCount,
    });
  } catch (e) {
    // graph summary is optional
  }

  return {
    issueKey,
    teamworkGraph,
    summary: fields.summary,
    status: fields.status?.name,
    priority: fields.priority?.name,
    labels: fields.labels || [],
    requirements: cut(adfToText(fields.description).trim() || '(no description)', 3000),
    linkedIssues,
    linkedDocs: remoteLinks,
    recentComments: comments,
    codeBlocks: codeBlocks.slice(-3),
    previousReviews,
  };
};

export const saveReview = async (payload) => {
  const issueKey = cleanKey(payload.issueKey);
  let risk = String(payload.risk || '').toUpperCase();
  let review = cut(cleanText(payload.review), 1500);
  if (!KEY_RE.test(issueKey)) return { error: `Invalid issue key: ${issueKey}` };
  if (!VALID_RISK.includes(risk)) return { error: 'risk must be LOW, MEDIUM or HIGH' };
  if (!review) return { error: 'review is empty' };

  // Deterministic guard: a review that reports an unmet requirement or a security problem is always HIGH.
  const HIGH_CUES = [
    /\brequirements?\b[^.\n]{0,20}\bnot (met|satisfied|implemented)\b/i,
    /\bnot met\b/i,
    /security (vulnerabilit|issue|risk|problem)/i,
  ];
  if (risk !== 'HIGH' && HIGH_CUES.some((re) => re.test(review))) {
    review = cut(`${review}\nRisk raised to HIGH: the review reports an unmet requirement or a security problem.`, 1600);
    risk = 'HIGH';
  }

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
  if (!KEY_RE.test(issueKey)) return { reviews: [], graph: null };
  let graph = null;
  try {
    graph = (await kvs.get(`graph:${issueKey}`)) || null;
  } catch (e) {
    graph = null;
  }
  return { reviews: await loadHistory(issueKey), graph };
});
export const resolver_handler = resolver.getDefinitions();
