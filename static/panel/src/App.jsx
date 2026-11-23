import React, { useEffect, useState } from 'react';
import { invoke, view } from '@forge/bridge';

const COLORS = { LOW: '#1F845A', MEDIUM: '#B38600', HIGH: '#C9372C' };
const LABELS = { LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk' };
const t = {
  text: 'var(--ds-text, #172B4D)',
  subtle: 'var(--ds-text-subtle, #626F86)',
  surface: 'var(--ds-surface-raised, #FFFFFF)',
  sunken: 'var(--ds-background-neutral, #F1F2F4)',
  border: 'var(--ds-border, #DCDFE4)',
};

const Badge = ({ risk, big }) => (
  <span
    style={{
      background: COLORS[risk],
      color: '#fff',
      borderRadius: 4,
      padding: big ? '4px 12px' : '1px 8px',
      fontSize: big ? 15 : 12,
      fontWeight: 700,
      letterSpacing: 0.3,
    }}
  >
    {big ? LABELS[risk] : risk}
  </span>
);

const Chip = ({ children }) => (
  <span
    style={{
      background: t.sunken,
      color: t.text,
      borderRadius: 12,
      padding: '2px 10px',
      fontSize: 12,
      marginRight: 6,
      display: 'inline-block',
      marginTop: 4,
    }}
  >
    {children}
  </span>
);

const ago = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
};

const ReviewCard = ({ r }) => {
  const [open, setOpen] = useState(false);
  const lines = String(r.review || '').split(/\n|(?= \d+\. )/).filter((l) => l.trim());
  const shown = open ? lines : lines.slice(0, 3);
  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${COLORS[r.risk]}`,
        borderRadius: 6,
        padding: '8px 12px',
        marginBottom: 10,
        background: t.surface,
      }}
    >
      <div style={{ marginBottom: 4 }}>
        <Badge risk={r.risk} />
        <span style={{ color: t.subtle, fontSize: 12, marginLeft: 8 }}>{ago(r.at)}</span>
      </div>
      {shown.map((l, i) => (
        <div key={i} style={{ color: t.text, fontSize: 13, lineHeight: 1.5 }}>
          {l.trim()}
        </div>
      ))}
      {lines.length > 3 && (
        <button
          onClick={() => setOpen(!open)}
          style={{ border: 'none', background: 'none', color: '#0C66E4', cursor: 'pointer', padding: 0, marginTop: 4, fontSize: 12 }}
        >
          {open ? 'Show less' : `Show ${lines.length - 3} more`}
        </button>
      )}
    </div>
  );
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        try {
          await view.theme.enable();
        } catch (e) {
          // theme support is optional
        }
        const ctx = await view.getContext();
        const res = await invoke('getReviews', { issueKey: ctx.extension.issue.key });
        setData(Array.isArray(res) ? { reviews: res, graph: null } : res);
      } catch (e) {
        setError('Could not load reviews.');
      }
    })();
  }, []);

  if (error) return <p style={{ color: t.text }}>{error}</p>;
  if (!data) return <p style={{ color: t.subtle }}>Loading…</p>;

  const { reviews, graph } = data;
  const chips = [];
  if (graph) {
    (graph.parents || []).forEach((p) => chips.push(`Epic: ${p}`));
    if (graph.children) chips.push(`${graph.children} child item(s)`);
    chips.push(`${graph.pullRequests || 0} linked PR(s)`);
    chips.push(`${graph.goals || 0} goal(s)`);
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div style={{ fontFamily: 'sans-serif', color: t.text, fontSize: 14 }}>
        <p>No reviews yet. Open Rovo Chat, pick “AI Code Review Agent” and ask it to review this issue.</p>
        <p style={{ color: t.subtle, fontSize: 12 }}>Tip: add the code as a code block in a comment and the agent will find it.</p>
      </div>
    );
  }

  const trend = reviews.slice(0, 5).map((r) => r.risk).reverse();
  const count = (k) => reviews.filter((r) => r.risk === k).length;

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 14, color: t.text }}>
      <div style={{ background: t.sunken, borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <Badge risk={reviews[0].risk} big />
          <span style={{ color: t.subtle, fontSize: 13 }}>
            {reviews.length} review(s) · last {ago(reviews[0].at)}
          </span>
        </div>
        {trend.length > 1 && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Trend:{' '}
            {trend.map((r, i) => (
              <span key={i}>
                {i > 0 ? ' → ' : ' '}
                <Badge risk={r} />
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 12, color: t.subtle }}>
          High {count('HIGH')} · Medium {count('MEDIUM')} · Low {count('LOW')}
        </div>
        {chips.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 12, color: t.subtle }}>Teamwork Graph: </span>
            {chips.map((c, i) => (
              <Chip key={i}>{c}</Chip>
            ))}
          </div>
        )}
      </div>
      {reviews.map((r) => (
        <ReviewCard key={r.at} r={r} />
      ))}
    </div>
  );
}
