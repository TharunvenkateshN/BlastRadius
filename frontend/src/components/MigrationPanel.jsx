import React, { useState, useEffect, useRef } from 'react';

const sectionLabel = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '12px',
};

function PipelineStep({ label, state, children }) {
  const dotStyle = {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '5px',
    background: 'var(--line)',
  };

  let labelColor = 'var(--text-muted)';
  if (state === 'active') {
    dotStyle.background = 'var(--ember)';
    dotStyle.boxShadow = '0 0 8px var(--ember)';
    labelColor = 'var(--text-primary)';
  } else if (state === 'done-pass') {
    dotStyle.background = 'var(--safe)';
    labelColor = 'var(--safe)';
  } else if (state === 'done-fail') {
    dotStyle.background = '#f87171';
    labelColor = '#f87171';
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style={dotStyle} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: labelColor,
              marginBottom: children ? '8px' : 0,
            }}
          >
            {label}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function DiffBlock({ oldCode, newCode }) {
  const [expanded, setExpanded] = useState(true);
  const oldLines = (oldCode || '').split('\n');
  const newLines = (newCode || '').split('\n');

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '11px',
          padding: 0,
          marginBottom: '6px',
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {expanded ? '▾' : '▸'} View diff
      </button>
      {expanded && (
        <div
          className="custom-scrollbar"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '10px',
            maxHeight: '160px',
            overflowY: 'auto',
          }}
        >
          {oldLines.map((line, i) => (
            <div key={`old-${i}`} style={{ color: '#f87171' }}>
              − {line}
            </div>
          ))}
          {newLines.map((line, i) => (
            <div key={`new-${i}`} style={{ color: '#86efac' }}>
              + {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MigrationPanel({ node, blastRadiusData, repoUrl, rawNodes }) {
  const [pipeline, setPipeline] = useState({
    propose: 'idle',
    verify: 'idle',
    decide: 'idle',
  });
  const [proposeData, setProposeData] = useState(null);
  const [verifyTests, setVerifyTests] = useState([]);
  const [verifyTotal, setVerifyTotal] = useState(0);
  const [decideData, setDecideData] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [impactWidth, setImpactWidth] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    setPipeline({ propose: 'idle', verify: 'idle', decide: 'idle' });
    setProposeData(null);
    setVerifyTests([]);
    setVerifyTotal(0);
    setDecideData(null);
    setIsMigrating(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [node?.id]);

  useEffect(() => {
    if (blastRadiusData && rawNodes.length > 0) {
      const pct = (blastRadiusData.affected.length / rawNodes.length) * 100;
      requestAnimationFrame(() => setImpactWidth(pct));
    } else {
      setImpactWidth(0);
    }
  }, [blastRadiusData, rawNodes.length]);

  const runMigration = async () => {
    if (!node || !repoUrl) return;

    setIsMigrating(true);
    setPipeline({ propose: 'active', verify: 'idle', decide: 'idle' });
    setProposeData(null);
    setVerifyTests([]);
    setDecideData(null);

    try {
      const response = await fetch('http://localhost:8000/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: node.id, repo: repoUrl }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start migration: ${response.statusText}`);
      }

      const wsUrl = `ws://localhost:8000/ws/migrate/${node.id}?repo=${encodeURIComponent(repoUrl)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.stage === 'propose') {
            if (data.status === 'running') {
              setPipeline((p) => ({ ...p, propose: 'active' }));
            } else if (data.status === 'done') {
              setProposeData(data);
              setPipeline((p) => ({ ...p, propose: 'done-pass', verify: 'active' }));
            } else if (data.status === 'error') {
              setPipeline((p) => ({ ...p, propose: 'done-fail' }));
              setProposeData(data);
            }
          }

          if (data.stage === 'verify') {
            if (data.status === 'running' && data.total !== undefined) {
              setVerifyTotal(data.total);
              setPipeline((p) => ({ ...p, verify: 'active' }));
            } else if (data.status === 'done' && data.test_index !== undefined) {
              setVerifyTests((prev) => {
                const next = [...prev];
                next[data.test_index] = data;
                return next;
              });
            }
          }

          if (data.stage === 'decide') {
            setDecideData(data);
            const failed = data.action === 'blocked' || data.action === 'pr_failed';
            setPipeline((p) => ({
              ...p,
              verify: p.verify === 'active' ? 'done-pass' : p.verify,
              decide: failed ? 'done-fail' : 'done-pass',
            }));
            setIsMigrating(false);
          }
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onerror = () => {
        setPipeline((p) => ({ ...p, propose: 'done-fail' }));
        setIsMigrating(false);
      };

      ws.onclose = () => {
        setIsMigrating(false);
      };
    } catch (err) {
      console.error('Migration error:', err);
      setPipeline((p) => ({ ...p, propose: 'done-fail' }));
      setIsMigrating(false);
    }
  };

  const maxDepth = blastRadiusData?.maxDepth ?? 0;
  const affectedCount = blastRadiusData?.affected?.length ?? 0;

  const verifyLabel =
    pipeline.verify === 'idle'
      ? 'Verify'
      : verifyTotal > 0
        ? `Verify [${verifyTests.filter(Boolean).length}/${verifyTotal} tests]`
        : 'Verify';

  return (
    <aside
      className="hide-scrollbar"
      style={{
        width: '320px',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--line)',
        padding: '28px 22px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {!node ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            lineHeight: 1.6,
            padding: '0 12px',
          }}
        >
          Select a node to inspect its blast radius, or press migrate to run the
          agent pipeline live.
        </div>
      ) : (
        <>
          {/* Node identity */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--ember)',
                marginBottom: '6px',
                wordBreak: 'break-all',
              }}
            >
              {node.name || node.id.split(':').pop()}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11.5px',
                color: 'var(--text-muted)',
                wordBreak: 'break-all',
              }}
            >
              {node.file || node.id.split(':')[0]}
            </div>
          </div>

          {/* Blast radius impact bar */}
          {blastRadiusData && (
            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                }}
              >
                <span>Blast radius</span>
                <span
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {affectedCount} nodes · depth {maxDepth}
                </span>
              </div>
              <div
                style={{
                  height: '6px',
                  background: 'var(--line-soft)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${impactWidth}%`,
                    background: 'linear-gradient(90deg, var(--warn), var(--ember))',
                    borderRadius: '3px',
                    transition: 'width 0.6s ease-out',
                  }}
                />
              </div>
            </div>
          )}

          {/* Migrate button */}
          <button
            onClick={runMigration}
            disabled={isMigrating}
            style={{
              width: '100%',
              background: isMigrating ? '#cc5530' : 'var(--ember)',
              color: '#1a0a03',
              fontWeight: 600,
              fontSize: '13.5px',
              fontFamily: "'Space Grotesk', sans-serif",
              border: 'none',
              borderRadius: '8px',
              padding: '12px 16px',
              cursor: isMigrating ? 'not-allowed' : 'pointer',
              marginBottom: '28px',
            }}
          >
            {isMigrating ? 'Migrating…' : '▸ Migrate this node'}
          </button>

          {/* Agent pipeline */}
          <div>
            <div style={sectionLabel}>Agent Pipeline</div>

            <PipelineStep
              label="Propose"
              state={pipeline.propose}
            >
              {proposeData?.status === 'done' && (
                <DiffBlock oldCode={proposeData.old_code} newCode={proposeData.new_code} />
              )}
              {proposeData?.status === 'error' && (
                <div style={{ fontSize: '11px', color: '#f87171' }}>
                  {proposeData.message}
                </div>
              )}
            </PipelineStep>

            <PipelineStep label={verifyLabel} state={pipeline.verify}>
              {verifyTests.filter(Boolean).map((test, idx) => (
                <div
                  key={idx}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    color: test.passed ? 'var(--safe)' : '#f87171',
                    marginBottom: '6px',
                  }}
                >
                  {test.passed ? '✓' : '✗'} input: {test.input} → expected{' '}
                  {test.old_output}, got {test.new_output}
                </div>
              ))}
            </PipelineStep>

            <PipelineStep label="Decide" state={pipeline.decide}>
              {decideData?.action === 'pr_opened' && (
                <div>
                  <div style={{ color: 'var(--safe)', fontSize: '13px', marginBottom: '6px' }}>
                    PR opened ✓
                  </div>
                  <a
                    href={decideData.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11.5px',
                      color: 'var(--safe)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {decideData.pr_url}
                  </a>
                </div>
              )}
              {decideData?.action === 'blocked' && (
                <div style={{ color: '#f87171', fontSize: '12px' }}>
                  Blocked — {decideData.reason}
                </div>
              )}
              {decideData?.action === 'pr_failed' && (
                <div>
                  <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '8px' }}>
                    PR failed — {decideData.reason}
                  </div>
                  {decideData.diff && (
                    <pre
                      className="custom-scrollbar"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        padding: '10px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                      }}
                    >
                      {decideData.diff}
                    </pre>
                  )}
                </div>
              )}
            </PipelineStep>
          </div>
        </>
      )}
    </aside>
  );
}
