import React, { useState, useEffect, useRef } from 'react';

const sectionLabel = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '12px',
};

const TOKEN_COLORS = {
  keyword: '#c792ea',
  string: '#c3e88d',
  comment: '#546e7a',
  plain: 'var(--text-secondary)',
};

const KEYWORD_RE =
  /(#.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|\b(def|return|import|class|if|else|for|in|not|None)\b/g;

function encodeNodeId(id) {
  return id.replace(/\//g, '%2F').replace(/:/g, '%3A');
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// Splits a top-level python-repr-style dict/list body on commas, ignoring
// commas nested inside brackets/braces so values like {'args': [1, 2]}
// don't get sliced in the middle.
function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if ('[{('.includes(ch)) depth++;
    if (']})'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseInputSummary(raw) {
  if (!raw) return '';
  let inner = raw.trim();
  if (inner.startsWith('{') && inner.endsWith('}')) inner = inner.slice(1, -1);
  const parts = splitTopLevel(inner);
  const cleaned = parts.map((p) => {
    const idx = p.indexOf(':');
    if (idx === -1) return p;
    const key = p.slice(0, idx).trim().replace(/^['"]|['"]$/g, '');
    const val = p.slice(idx + 1).trim();
    return `${key}: ${val}`;
  });
  return cleaned.join('  ');
}

function countChangedLines(diff) {
  if (!diff) return 0;
  return diff
    .split('\n')
    .filter(
      (l) =>
        (l.startsWith('+') && !l.startsWith('+++')) ||
        (l.startsWith('-') && !l.startsWith('---'))
    ).length;
}

function tokenizeLine(line) {
  const tokens = [];
  let lastIndex = 0;
  let match;
  KEYWORD_RE.lastIndex = 0;
  while ((match = KEYWORD_RE.exec(line))) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }
    if (match[1]) tokens.push({ text: match[1], type: 'comment' });
    else if (match[2]) tokens.push({ text: match[2], type: 'string' });
    else if (match[3]) tokens.push({ text: match[3], type: 'keyword' });
    lastIndex = KEYWORD_RE.lastIndex;
  }
  if (lastIndex < line.length) tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  return tokens;
}

function DiffLines({ diff, maxHeight }) {
  const lines = (diff || '').split('\n');
  return (
    <div
      className="custom-scrollbar hide-scrollbar"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: '6px',
        padding: '10px',
        maxHeight: maxHeight ? `${maxHeight}px` : 'none',
        overflowY: maxHeight ? 'auto' : 'visible',
      }}
    >
      {lines.map((line, i) => {
        let color = 'var(--text-muted)';
        let display = line;
        if (line.startsWith('+++') || line.startsWith('---')) {
          color = 'var(--text-muted)';
        } else if (line.startsWith('+')) {
          color = '#86efac';
          display = '+ ' + line.slice(1);
        } else if (line.startsWith('-')) {
          color = '#f87171';
          display = '- ' + line.slice(1);
        } else if (line.startsWith('@@')) {
          color = '#a78bfa';
        }
        return (
          <div key={i} style={{ color, whiteSpace: 'pre' }}>
            {display || ' '}
          </div>
        );
      })}
    </div>
  );
}

function CodeBlock({ code }) {
  const lines = (code || '').split('\n');
  return (
    <pre
      className="custom-scrollbar hide-scrollbar"
      style={{
        margin: 0,
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: '6px',
        padding: '12px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11px',
        overflowX: 'auto',
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ whiteSpace: 'pre' }}>
          {line === ''
            ? ' '
            : tokenizeLine(line).map((tok, j) => (
                <span key={j} style={{ color: TOKEN_COLORS[tok.type] }}>
                  {tok.text}
                </span>
              ))}
        </div>
      ))}
    </pre>
  );
}

function ProposeSection({ proposeData, onOpenDiffPopup }) {
  const [expanded, setExpanded] = useState(false);
  if (!proposeData) return null;
  if (proposeData.status === 'error') {
    return (
      <div style={{ fontSize: '11px', color: '#f87171' }}>{proposeData.message}</div>
    );
  }
  return (
    <div style={{ marginTop: '6px' }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '11.5px',
          padding: 0,
          marginBottom: '6px',
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {expanded ? '▾' : '▸'} View diff
      </button>
      {expanded && (
        <>
          <DiffLines diff={proposeData.diff} maxHeight={200} />
          <div
            onClick={onOpenDiffPopup}
            style={{
              textAlign: 'right',
              fontSize: '11px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            Click to expand full diff
          </div>
        </>
      )}
    </div>
  );
}

function TestCard({ test, index, total, onClick }) {
  if (!test) return null;
  const inputSummary = truncate(parseInputSummary(test.input), 60);
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg)',
        borderRadius: '6px',
        padding: '8px 10px',
        borderLeft: `3px solid ${test.passed ? 'var(--safe)' : '#f87171'}`,
        marginBottom: '6px',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            color: test.passed ? 'var(--safe)' : '#f87171',
            background: test.passed ? 'var(--safe-soft)' : 'rgba(248,113,113,0.15)',
          }}
        >
          {test.passed ? '✓ PASS' : '✗ FAIL'}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          Test {index + 1} of {total}
        </span>
      </div>
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: '2px',
        }}
      >
        Input
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          color: 'var(--text-secondary)',
          marginBottom: test.passed ? 0 : '6px',
          wordBreak: 'break-all',
        }}
      >
        {inputSummary}
      </div>
      {!test.passed && (
        <>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: 'var(--text-muted)',
            }}
          >
            Expected:{' '}
            <span style={{ color: 'var(--text-secondary)' }}>
              {truncate(test.old_output, 50)}
            </span>
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#f87171',
            }}
          >
            Got: {truncate(test.new_output, 50)}
          </div>
        </>
      )}
    </div>
  );
}

function VerifySection({ verifyTests, verifyTotal, onOpenTestPopup }) {
  const completed = verifyTests.filter(Boolean);
  if (completed.length === 0) return null;
  const total = verifyTotal || completed.length;
  const passedCount = completed.filter((t) => t.passed).length;
  const anyFailed = completed.some((t) => !t.passed);
  const allDone = completed.length === total && total > 0;
  const summaryColor = anyFailed ? '#f87171' : allDone ? 'var(--safe)' : 'var(--text-secondary)';

  return (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: summaryColor }}>
        {passedCount} / {total} tests passed
      </div>
      {verifyTests.map((test, idx) =>
        test ? (
          <TestCard
            key={idx}
            test={test}
            index={idx}
            total={total}
            onClick={() => onOpenTestPopup(test, idx, total)}
          />
        ) : null
      )}
    </div>
  );
}

function DiffPopupContent({ data }) {
  return (
    <div>
      <DiffLines diff={data?.diff} />
      {data?.old_code && data?.new_code && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Before
            </div>
            <CodeBlock code={data.old_code} />
          </div>
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              After
            </div>
            <CodeBlock code={data.new_code} />
          </div>
        </div>
      )}
    </div>
  );
}

function TestPopupContent({ test }) {
  if (!test) return null;
  const blockStyle = (color) => ({
    margin: 0,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    background: 'var(--bg)',
    padding: '10px',
    borderRadius: '6px',
    color,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  });
  const label = {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    marginBottom: '6px',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <div style={label}>Input</div>
        <pre style={blockStyle('var(--text-secondary)')}>{test.input}</pre>
      </div>
      <div>
        <div style={label}>Expected output</div>
        <pre style={blockStyle('var(--safe)')}>{test.old_output}</pre>
      </div>
      <div>
        <div style={label}>Actual output</div>
        <pre style={blockStyle(test.passed ? 'var(--safe)' : '#f87171')}>{test.new_output}</pre>
      </div>
    </div>
  );
}

function Popup({ popup, onClose }) {
  if (!popup) return null;
  const isDiff = popup.type === 'diff';
  const title = isDiff
    ? 'Proposed diff'
    : `Test ${popup.index + 1} of ${popup.total} — ${popup.test?.passed ? 'PASS' : 'FAIL'}`;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 'min(800px, 90vw)',
          maxHeight: '80vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--line)',
          borderRadius: '12px',
          overflow: 'hidden',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            ×
          </button>
        </div>
        <div className="custom-scrollbar hide-scrollbar" style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>
          {isDiff ? <DiffPopupContent data={popup.data} /> : <TestPopupContent test={popup.test} />}
        </div>
      </div>
    </div>
  );
}

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
  } else if (state === 'done') {
    dotStyle.background = 'var(--safe)';
    labelColor = 'var(--safe)';
  } else if (state === 'error') {
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

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

export default function MigrationPanel({ node, blastRadiusData, repoUrl, rawNodes }) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);

  const [pipelineState, setPipelineState] = useState({
    propose: 'idle',
    verify: 'idle',
    decide: 'idle',
  });
  const [proposeData, setProposeData] = useState(null);
  const [verifyTests, setVerifyTests] = useState([]);
  const [verifyTotal, setVerifyTotal] = useState(0);
  const [approvalState, setApprovalState] = useState(null);
  const [decideResult, setDecideResult] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [impactWidth, setImpactWidth] = useState(0);
  const [popup, setPopup] = useState(null);

  const wsRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    setPipelineState({ propose: 'idle', verify: 'idle', decide: 'idle' });
    setProposeData(null);
    setVerifyTests([]);
    setVerifyTotal(0);
    setApprovalState(null);
    setDecideResult(null);
    setIsMigrating(false);
    setPopup(null);
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

  useEffect(() => {
    if (!dragging) return;
    const panelRight = panelRef.current
      ? panelRef.current.getBoundingClientRect().right
      : window.innerWidth;

    const onMouseMove = (e) => {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, panelRight - e.clientX));
      setPanelWidth(newWidth);
    };
    const onMouseUp = () => setDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging]);

  const runMigration = async () => {
    if (!node || !repoUrl) return;

    setIsMigrating(true);
    setPipelineState({ propose: 'active', verify: 'idle', decide: 'idle' });
    setProposeData(null);
    setVerifyTests([]);
    setVerifyTotal(0);
    setApprovalState(null);
    setDecideResult(null);

    try {
      const response = await fetch('http://localhost:8000/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: node.id, repo: repoUrl }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start migration: ${response.statusText}`);
      }

      const wsUrl = `ws://localhost:8000/ws/migrate/${encodeNodeId(node.id)}?repo=${encodeURIComponent(repoUrl)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.stage === 'propose') {
          if (data.status === 'running') {
            setPipelineState((p) => ({ ...p, propose: 'active' }));
          } else if (data.status === 'done') {
            setProposeData(data);
            setPipelineState((p) => ({ ...p, propose: 'done', verify: 'active' }));
          } else if (data.status === 'error') {
            setProposeData(data);
            setPipelineState((p) => ({ ...p, propose: 'error' }));
            setIsMigrating(false);
          }
        }

        if (data.stage === 'verify') {
          if (data.status === 'running' && data.total !== undefined) {
            setVerifyTotal(data.total);
            setPipelineState((p) => ({ ...p, verify: 'active' }));
          } else if (data.status === 'done' && data.test_index !== undefined) {
            setVerifyTests((prev) => {
              const next = [...prev];
              next[data.test_index] = data;
              return next;
            });
          } else if (data.status === 'error') {
            setPipelineState((p) => ({ ...p, verify: 'error' }));
            setIsMigrating(false);
          } else if (data.status === 'complete') {
            setPipelineState((p) => ({ ...p, verify: 'done', decide: 'active' }));
            setApprovalState('pending');
          }
        }

        if (data.stage === 'decide') {
          setDecideResult(data);
          setPipelineState((p) => ({ ...p, decide: 'done' }));
          setIsMigrating(false);
          setApprovalState(data.action === 'rejected' ? 'rejected' : 'approved');
        }
      };

      ws.onerror = () => {
        setPipelineState((p) => (p.propose === 'idle' ? { ...p, propose: 'error' } : p));
        setIsMigrating(false);
      };

      ws.onclose = () => {
        setIsMigrating(false);
      };
    } catch (err) {
      console.error('Migration error:', err);
      setPipelineState((p) => ({ ...p, propose: 'error' }));
      setIsMigrating(false);
    }
  };

  const handleApprove = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'approve' }));
      setApprovalState('raising');
    }
  };

  const handleReject = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'reject' }));
    }
    setApprovalState('rejected');
    setDecideResult({ action: 'rejected' });
    setPipelineState((p) => ({ ...p, decide: 'done' }));
  };

  const maxDepth = blastRadiusData?.maxDepth ?? 0;
  const affectedCount = blastRadiusData?.affected?.length ?? 0;

  const completedTests = verifyTests.filter(Boolean);
  const passedCount = completedTests.filter((t) => t.passed).length;

  const verifyLabel =
    pipelineState.verify === 'idle'
      ? 'Verify'
      : verifyTotal > 0
        ? `Verify [${completedTests.length}/${verifyTotal} tests]`
        : 'Verify';

  const showApprovalGate = pipelineState.decide === 'active' && !decideResult;

  return (
    <aside
      ref={panelRef}
      className="hide-scrollbar"
      style={{
        position: 'relative',
        width: `${panelWidth}px`,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--line)',
        padding: '28px 22px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: '6px',
          cursor: 'col-resize',
          background: dragging ? 'rgba(255,106,61,0.3)' : 'transparent',
          transition: dragging ? 'none' : 'background 0.15s ease',
          zIndex: 5,
        }}
        onMouseEnter={(e) => {
          if (!dragging) e.currentTarget.style.background = 'rgba(255,106,61,0.3)';
        }}
        onMouseLeave={(e) => {
          if (!dragging) e.currentTarget.style.background = 'transparent';
        }}
      />

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
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
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

            <PipelineStep label="Propose" state={pipelineState.propose}>
              <ProposeSection
                proposeData={proposeData}
                onOpenDiffPopup={() => setPopup({ type: 'diff', data: proposeData })}
              />
            </PipelineStep>

            <PipelineStep label={verifyLabel} state={pipelineState.verify}>
              <VerifySection
                verifyTests={verifyTests}
                verifyTotal={verifyTotal}
                onOpenTestPopup={(test, idx, total) =>
                  setPopup({ type: 'test', test, index: idx, total })
                }
              />
            </PipelineStep>

            <PipelineStep
              label={pipelineState.decide === 'idle' ? 'Decide' : 'Decide'}
              state={pipelineState.decide === 'active' ? 'active' : pipelineState.decide === 'done' ? 'done' : 'idle'}
            >
              {showApprovalGate && (
                <div style={{ marginTop: '4px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '10px',
                    }}
                  >
                    Ready to raise PR
                  </div>
                  <div
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        marginBottom: '4px',
                      }}
                    >
                      Function: {node.name || node.id.split(':').pop()}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        marginBottom: '4px',
                        color:
                          verifyTotal > 0 && passedCount === verifyTotal
                            ? 'var(--safe)'
                            : '#f87171',
                      }}
                    >
                      Tests: {passedCount}/{verifyTotal} passed
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Changes: {countChangedLines(proposeData?.diff)} lines modified
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleReject}
                      disabled={approvalState === 'raising'}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: '1px solid #f87171',
                        color: '#f87171',
                        borderRadius: '8px',
                        padding: '10px 0',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: approvalState === 'raising' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      ✕ Reject
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={approvalState === 'raising'}
                      style={{
                        flex: 1,
                        background: 'var(--ember)',
                        color: '#1a0a03',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 0',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: approvalState === 'raising' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {approvalState === 'raising' ? 'Raising PR…' : '✓ Raise PR'}
                    </button>
                  </div>
                </div>
              )}

              {decideResult?.action === 'pr_opened' && (
                <div>
                  <div style={{ color: 'var(--safe)', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    PR opened ✓
                  </div>
                  <a
                    href={decideResult.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11.5px',
                      color: 'var(--safe)',
                      textDecoration: 'underline',
                      wordBreak: 'break-all',
                    }}
                  >
                    {decideResult.pr_url}
                  </a>
                </div>
              )}

              {decideResult?.action === 'blocked' && (
                <div>
                  <div style={{ color: '#f87171', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                    Blocked
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    {decideResult.reason}
                  </div>
                </div>
              )}

              {decideResult?.action === 'pr_failed' && (
                <div>
                  <div style={{ color: '#f87171', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                    PR failed
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '8px' }}>
                    {decideResult.reason}
                  </div>
                  {decideResult.diff && <DiffLines diff={decideResult.diff} maxHeight={160} />}
                </div>
              )}

              {decideResult?.action === 'rejected' && (
                <div>
                  <div
                    style={{
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      fontSize: '12px',
                      marginBottom: '4px',
                    }}
                  >
                    Changes rejected
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    Click Migrate again to restart the pipeline.
                  </div>
                </div>
              )}
            </PipelineStep>
          </div>
        </>
      )}

      <Popup popup={popup} onClose={() => setPopup(null)} />
    </aside>
  );
}
