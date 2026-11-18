import React, { useEffect, useState } from 'react';
import { invoke, view } from '@forge/bridge';

const colors = { LOW: '#1f845a', MEDIUM: '#b38600', HIGH: '#c9372c' };

const Badge = ({ risk }) => (
  <span style={{ background: colors[risk], color: '#fff', borderRadius: 4, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>
    {risk}
  </span>
);

export default function App() {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const ctx = await view.getContext();
        setReviews(await invoke('getReviews', { issueKey: ctx.extension.issue.key }));
      } catch (e) {
        setError('Could not load reviews.');
      }
    })();
  }, []);

  if (error) return <p>{error}</p>;
  if (!reviews) return <p>Loading…</p>;
  if (reviews.length === 0)
    return <p>No reviews yet. Open Rovo Chat, pick “AI Code Review Agent” and paste your code with this issue key.</p>;

  const trend = reviews.slice(0, 4).map((r) => r.risk).reverse();

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <strong>Latest risk:</strong> <Badge risk={reviews[0].risk} />
        <span style={{ color: '#666', marginLeft: 10 }}>{reviews.length} review(s)</span>
        {trend.length > 1 && (
          <div style={{ marginTop: 6, color: '#444' }}>
            Trend: {trend.map((r, i) => (
              <span key={i}>{i > 0 ? ' → ' : ''}<Badge risk={r} /></span>
            ))}
          </div>
        )}
      </div>
      {reviews.map((r) => (
        <div key={r.at} style={{ borderLeft: `4px solid ${colors[r.risk]}`, padding: '4px 10px', marginBottom: 12 }}>
          <Badge risk={r.risk} />
          <span style={{ color: '#666' }}> · {new Date(r.at).toLocaleString()}</span>
          <div style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{r.review}</div>
        </div>
      ))}
    </div>
  );
}
