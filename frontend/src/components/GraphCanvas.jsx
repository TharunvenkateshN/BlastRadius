import React, { useState, useEffect, useMemo, useCallback } from 'react';

const CX = 450;
const CY = 390;
const HUB_RADIUS = 220;
const HUB_COUNT = 15;
const DORMANT_RADIUS = 430;
const DORMANT_COUNT = 10;
const MAX_PER_RING = 8;

const COLORS = {
  origin: { fill: '#ff6a3d', stroke: '#ffb28f', label: '#ffffff' },
  dormant: { fill: '#10151d', stroke: '#1c2530', label: '#4d5867' },
  migrated: { fill: '#0f2a1a', stroke: '#3d7bff', label: '#86efac' },
};

// Every node gets its own hue derived from its full id — a plain mod-360
// hash clusters similar-looking ids (e.g. several "cli" functions across
// different files all landing in the same teal band), so we run the hash
// through the golden-ratio conjugate to spread hues evenly regardless of
// how similar the input strings are. This replaces a single-hue
// "shades of orange" ramp with real, reliable node-to-node separation.
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

function hashHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const spread = ((hash >>> 0) * GOLDEN_RATIO_CONJUGATE) % 1;
  return Math.floor(spread * 360);
}

function nodeHue(node, fallbackId) {
  const key = node?.id || fallbackId || node?.name || 'unknown';
  return hashHue(key);
}

function hubNodeColor(hue, hovered) {
  return {
    fill: `hsl(${hue}, ${hovered ? 55 : 38}%, ${hovered ? 28 : 20}%)`,
    stroke: `hsl(${hue}, ${hovered ? 85 : 65}%, ${hovered ? 68 : 55}%)`,
    label: `hsl(${hue}, 50%, 72%)`,
  };
}

// Depth is communicated primarily through size here, not through washing
// color out — every tier keeps a high enough saturation/lightness floor
// that a sparse, mostly-deep blast radius (few direct dependents, mostly
// 2-3 hop nodes) still reads as vividly colored, not dim and muddy.
const RING_TUNING = {
  1: { r: 12, s: 75, lFill: 36, lStroke: 66, lLabel: 82 },
  2: { r: 10, s: 68, lFill: 32, lStroke: 60, lLabel: 76 },
  3: { r: 8, s: 60, lFill: 28, lStroke: 54, lLabel: 70 },
};

function ringNodeColor(hue, bucket) {
  const t = RING_TUNING[bucket] || RING_TUNING[3];
  return {
    r: t.r,
    fill: `hsl(${hue}, ${t.s}%, ${t.lFill}%)`,
    stroke: `hsl(${hue}, ${t.s}%, ${t.lStroke}%)`,
    label: `hsl(${hue}, ${t.s}%, ${t.lLabel}%)`,
  };
}

function computeDegreeMap(nodes, edges) {
  const degreeMap = {};
  nodes.forEach((n) => {
    degreeMap[n.id] = 0;
  });
  edges.forEach((e) => {
    if (degreeMap[e.from] !== undefined) degreeMap[e.from]++;
    if (degreeMap[e.to] !== undefined) degreeMap[e.to]++;
  });
  return degreeMap;
}

function polarToXY(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function bezierPath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * 0.25;
  const cy = my + dx * 0.25;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function bucketDepth(depth) {
  return depth >= 3 ? 3 : depth;
}

function ringRadius(bucket) {
  if (bucket === 1) return 155;
  if (bucket === 2) return 265;
  return 360;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function Ripple({ x, y, keyId }) {
  return (
    <circle
      key={keyId}
      cx={x}
      cy={y}
      r={30}
      fill="none"
      stroke="#ff6a3d"
      strokeWidth={1.5}
      style={{
        animation: 'ripple-expand 1s ease-out forwards',
        transformOrigin: `${x}px ${y}px`,
      }}
    />
  );
}

function Tooltip({ x, y, text }) {
  const width = Math.min(320, Math.max(60, text.length * 6.4 + 16));
  return (
    <g style={{ pointerEvents: 'none' }} transform={`translate(${x - width / 2}, ${y - 40})`}>
      <rect
        width={width}
        height={24}
        rx={5}
        fill="#10151d"
        stroke="#1c2530"
        strokeWidth={1}
      />
      <text
        x={width / 2}
        y={16}
        textAnchor="middle"
        fill="#eef1f5"
        fontSize="11"
        fontFamily="'JetBrains Mono', monospace"
      >
        {text}
      </text>
    </g>
  );
}

export default function GraphCanvas({
  rawNodes,
  rawEdges,
  onNodeClick,
  blastRadiusData,
  selectedNode,
  previousNode,
  repoUrl,
  onReset,
  onBack,
  onVisibleCountChange,
  loading,
}) {
  const [hovered, setHovered] = useState(null);
  const [revealedMaxDepth, setRevealedMaxDepth] = useState(0);
  const [ripples, setRipples] = useState([]);
  const [viewMode, setViewMode] = useState('hubs');
  const [originAnimPos, setOriginAnimPos] = useState({ x: CX, y: CY });

  const degreeMap = useMemo(
    () => computeDegreeMap(rawNodes, rawEdges),
    [rawNodes, rawEdges]
  );

  const hubNodes = useMemo(() => {
    if (!rawNodes.length) return [];
    return [...rawNodes]
      .sort((a, b) => (degreeMap[b.id] || 0) - (degreeMap[a.id] || 0))
      .slice(0, HUB_COUNT);
  }, [rawNodes, degreeMap]);

  const hubPositions = useMemo(() => {
    const positions = {};
    hubNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / hubNodes.length - Math.PI / 2;
      positions[node.id] = polarToXY(CX, CY, HUB_RADIUS, angle);
    });
    return positions;
  }, [hubNodes]);

  const blastLayout = useMemo(() => {
    if (!blastRadiusData || !selectedNode) return null;

    const { origin, affected, depth_map } = blastRadiusData;

    const byBucket = {};
    affected.forEach((id) => {
      const depth = depth_map[id] || 1;
      const bucket = bucketDepth(depth);
      if (!byBucket[bucket]) byBucket[bucket] = [];
      byBucket[bucket].push(id);
    });

    // Cap each ring to the highest-degree nodes so it stays legible.
    Object.keys(byBucket).forEach((bucket) => {
      byBucket[bucket] = byBucket[bucket]
        .sort((a, b) => (degreeMap[b] || 0) - (degreeMap[a] || 0))
        .slice(0, MAX_PER_RING);
    });

    const positions = { [origin]: { x: CX, y: CY } };
    Object.entries(byBucket).forEach(([bucketStr, ids]) => {
      const bucket = parseInt(bucketStr, 10);
      const radius = ringRadius(bucket);
      ids.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
        positions[id] = polarToXY(CX, CY, radius, angle);
      });
    });

    const visibleIds = new Set([origin, ...Object.values(byBucket).flat()]);
    const nodeById = {};
    rawNodes.forEach((n) => {
      nodeById[n.id] = n;
    });

    const bucket1Ids = new Set(byBucket[1] || []);
    const bucket2Ids = new Set(byBucket[2] || []);

    const edges = [];
    rawEdges.forEach((e) => {
      if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return;
      if (e.from === origin && bucket1Ids.has(e.to)) {
        edges.push({ ...e, tier: 1 });
      } else if (bucket1Ids.has(e.from) && bucket2Ids.has(e.to)) {
        edges.push({ ...e, tier: 2 });
      } else if (bucket1Ids.has(e.to) && bucket2Ids.has(e.from)) {
        edges.push({ from: e.to, to: e.from, tier: 2 });
      }
    });

    const dormantCandidates = rawNodes
      .filter((n) => !visibleIds.has(n.id))
      .sort((a, b) => (degreeMap[b.id] || 0) - (degreeMap[a.id] || 0))
      .slice(0, DORMANT_COUNT);

    const dormantPositions = {};
    dormantCandidates.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / dormantCandidates.length - Math.PI / 2;
      dormantPositions[node.id] = polarToXY(CX, CY, DORMANT_RADIUS, angle);
    });

    return {
      positions,
      byBucket,
      edges,
      dormantCandidates,
      dormantPositions,
      visibleIds,
      nodeById,
    };
  }, [blastRadiusData, selectedNode, rawNodes, rawEdges, degreeMap]);

  useEffect(() => {
    if (selectedNode && !blastRadiusData) {
      setViewMode('loading');
    } else if (blastRadiusData) {
      setViewMode('blast');
    } else {
      setViewMode('hubs');
    }
  }, [selectedNode, blastRadiusData]);

  useEffect(() => {
    if (!blastRadiusData) {
      setRevealedMaxDepth(0);
      return;
    }
    const depths = Object.values(blastRadiusData.depth_map).map(bucketDepth);
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    setRevealedMaxDepth(0);
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setRevealedMaxDepth(current);
      if (current >= maxDepth) clearInterval(interval);
    }, 150);
    return () => clearInterval(interval);
  }, [blastRadiusData]);

  useEffect(() => {
    if (blastRadiusData && onVisibleCountChange) {
      onVisibleCountChange(1 + (blastRadiusData.affected?.length || 0));
    } else if (viewMode === 'hubs' && hubNodes.length && onVisibleCountChange) {
      onVisibleCountChange(hubNodes.length);
    } else if (onVisibleCountChange) {
      onVisibleCountChange(0);
    }
  }, [blastRadiusData, viewMode, hubNodes.length, onVisibleCountChange]);

  const handleNodeClick = useCallback(
    (node, x, y) => {
      const startX = x ?? CX;
      const startY = y ?? CY;
      setRipples((prev) => [...prev, { id: Date.now(), x: startX, y: startY }]);
      setTimeout(() => setRipples((prev) => prev.slice(1)), 1200);
      // Start the new origin at the point clicked, then glide it to center.
      setOriginAnimPos({ x: startX, y: startY });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setOriginAnimPos({ x: CX, y: CY }));
      });
      onNodeClick(node);
    },
    [onNodeClick]
  );

  const handleReset = () => {
    setViewMode('hubs');
    setRevealedMaxDepth(0);
    setOriginAnimPos({ x: CX, y: CY });
    onReset();
  };

  const handleBack = () => {
    setOriginAnimPos({ x: CX, y: CY });
    onBack();
  };

  const repoName = repoUrl
    ? repoUrl.replace(/https?:\/\/github\.com\//, '').replace(/\/$/, '')
    : '';
  const nodeLabel = selectedNode?.name || selectedNode?.id?.split(':').pop() || '';

  const renderHubView = (faded = false) => (
    <>
      <circle
        cx={CX}
        cy={CY}
        r={HUB_RADIUS}
        fill="none"
        stroke="#161d27"
        strokeWidth={1}
        strokeDasharray="2,6"
        opacity={faded ? 0.3 : 1}
        style={{ transition: 'opacity 0.3s ease' }}
      />
      {!faded && (
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-muted)"
          fontSize="12"
          fontFamily="'Space Grotesk', sans-serif"
        >
          Click any node to explore its blast radius
        </text>
      )}
      {hubNodes.map((node, i) => {
        const pos = hubPositions[node.id];
        const isHovered = hovered?.id === node.id;
        const hue = nodeHue(node);
        const c = hubNodeColor(hue, isHovered);
        return (
          <g
            key={node.id}
            style={{
              cursor: faded ? 'default' : 'pointer',
              pointerEvents: faded ? 'none' : 'auto',
              opacity: faded ? 0.2 : 1,
              transition: 'opacity 0.3s ease',
            }}
            onClick={() => !faded && handleNodeClick(node, pos.x, pos.y)}
            onMouseEnter={() => !faded && setHovered({ id: node.id, x: pos.x, y: pos.y, r: 13 })}
            onMouseLeave={() => setHovered(null)}
          >
            <circle
              cx={pos.x}
              cy={pos.y}
              r={13}
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth={isHovered ? 2.5 : 1.5}
              style={{
                transition: 'all 0.15s ease',
                filter: isHovered ? `drop-shadow(0 0 8px hsla(${hue},80%,60%,0.55))` : 'none',
              }}
            />
            <text
              x={pos.x}
              y={pos.y + 13 + 14}
              textAnchor="middle"
              fill={c.label}
              fontSize="10"
              fontFamily="'JetBrains Mono', monospace"
            >
              {truncate(node.name, 14)}
            </text>
          </g>
        );
      })}
    </>
  );

  const renderLoadingOverlay = () => (
    <>
      <circle
        cx={originAnimPos.x}
        cy={originAnimPos.y}
        r={24}
        fill={COLORS.origin.fill}
        stroke={COLORS.origin.stroke}
        strokeWidth={2}
        style={{
          filter: 'drop-shadow(0 0 16px rgba(255,106,61,0.5))',
          transition: 'cx 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), cy 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
      <text
        x={originAnimPos.x}
        y={originAnimPos.y + 44}
        textAnchor="middle"
        fill="var(--text-secondary)"
        fontSize="12"
        fontFamily="'JetBrains Mono', monospace"
      >
        {selectedNode?.name || '…'}
      </text>
      <g transform={`translate(${originAnimPos.x - 12}, ${originAnimPos.y + 60})`}>
        <circle
          cx={12}
          cy={12}
          r={10}
          fill="none"
          stroke="#ff6a3d"
          strokeWidth={2}
          strokeDasharray="20 40"
          style={{ animation: 'spin 0.8s linear infinite', transformOrigin: '12px 12px' }}
        />
      </g>
    </>
  );

  const renderBlastView = () => {
    if (!blastLayout || !blastRadiusData) return null;
    const { positions, byBucket, edges, dormantCandidates, dormantPositions, nodeById } =
      blastLayout;
    const { origin } = blastRadiusData;
    const originNode = nodeById[origin] || selectedNode;

    return (
      <>
        {Object.entries(byBucket).map(([bucketStr, ids]) => {
          const bucket = parseInt(bucketStr, 10);
          if (bucket > revealedMaxDepth) return null;
          const labelLen = bucket >= 2 ? 10 : 12;
          return ids.map((id, i) => {
            const pos = positions[id];
            const node = nodeById[id];
            const isHovered = hovered?.id === id;
            const hue = nodeHue(node, id);
            const style = ringNodeColor(hue, bucket);
            return (
              <g
                key={`${bucketStr}-${id}-${i}`}
                style={{
                  cursor: 'pointer',
                  animation: `fade-in-ring 0.3s ease-out ${(bucket - 1) * 150}ms both`,
                }}
                onClick={() => node && handleNodeClick(node, pos.x, pos.y)}
                onMouseEnter={() => setHovered({ id, x: pos.x, y: pos.y, r: style.r })}
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={style.r}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  style={{
                    transition: 'all 0.15s ease',
                    filter: isHovered ? `drop-shadow(0 0 8px hsla(${hue},80%,60%,0.6))` : 'none',
                  }}
                />
                <text
                  x={pos.x}
                  y={pos.y + style.r + 14}
                  textAnchor="middle"
                  fill={style.label}
                  fontSize={bucket >= 2 ? '9' : '10'}
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {truncate(node?.name || id.split(':').pop(), labelLen)}
                </text>
              </g>
            );
          });
        })}

        {revealedMaxDepth >= 1 &&
          edges.map((e, i) => {
            const from = positions[e.from];
            const to = positions[e.to];
            if (!from || !to) return null;
            const isTier1 = e.tier === 1;
            return (
              <path
                key={`edge-${i}`}
                d={bezierPath(from.x, from.y, to.x, to.y)}
                fill="none"
                stroke={isTier1 ? '#ff6a3d44' : '#cf7a5844'}
                strokeWidth={isTier1 ? 1.2 : 0.8}
              />
            );
          })}

        {/* Dormant nodes (behind origin) */}
        {dormantCandidates.map((node, i) => {
          const pos = dormantPositions[node.id];
          const isHovered = hovered?.id === node.id;
          return (
            <g
              key={`dormant-${node.id}-${i}`}
              style={{ cursor: 'pointer' }}
              onClick={() => handleNodeClick(node, pos.x, pos.y)}
              onMouseEnter={() => setHovered({ id: node.id, x: pos.x, y: pos.y, r: 6 })}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={6}
                fill={COLORS.dormant.fill}
                stroke={COLORS.dormant.stroke}
                strokeWidth={1}
                opacity={isHovered ? 1 : 0.35}
                style={{ transition: 'all 0.15s ease' }}
              />
            </g>
          );
        })}

        {/* Origin on top */}
        <g style={{ cursor: 'pointer' }} onClick={() => originNode && handleNodeClick(originNode, CX, CY)}>
          <circle
            cx={originAnimPos.x}
            cy={originAnimPos.y}
            r={24}
            fill={COLORS.origin.fill}
            stroke={COLORS.origin.stroke}
            strokeWidth={2}
            style={{
              filter: 'drop-shadow(0 0 16px rgba(255,106,61,0.5))',
              transition: 'cx 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), cy 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          />
          <text
            x={originAnimPos.x}
            y={originAnimPos.y + 38}
            textAnchor="middle"
            fill={COLORS.origin.label}
            fontSize="13"
            fontWeight="600"
            fontFamily="'Space Grotesk', sans-serif"
          >
            {truncate(originNode?.name || 'origin', 20)}
          </text>
          <text
            x={originAnimPos.x}
            y={originAnimPos.y + 52}
            textAnchor="middle"
            fill="#4d5867"
            fontSize="10"
            fontFamily="'JetBrains Mono', monospace"
          >
            {truncate((originNode?.file || origin.split(':')[0]).split('/').pop(), 24)}
          </text>
        </g>

        <text
          x={CX + 180}
          y={CY + 340}
          fill="var(--text-muted)"
          fontSize="11"
          fontFamily="'Space Grotesk', sans-serif"
        >
          Click any node to make it the new origin, or use Back / Reset above.
        </text>
      </>
    );
  };

  const showTopbar = viewMode === 'loading' || viewMode === 'blast';
  const showBack = showTopbar && !!previousNode;

  return (
    <div
      style={{
        position: 'relative',
        background: 'radial-gradient(circle at 50% 45%, #0f141c 0%, #0a0e14 65%)',
        overflow: 'hidden',
      }}
    >
      {/* Topbar: back + breadcrumb + reset */}
      {showTopbar && selectedNode && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--line)',
            borderRadius: '10px',
            padding: '9px 16px',
          }}
        >
          {showBack && (
            <button
              onClick={handleBack}
              style={{
                background: 'transparent',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '11.5px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#3d7bff';
                e.currentTarget.style.color = '#eef1f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              ← Back
            </button>
          )}
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            {repoName} › {nodeLabel}
          </span>
          <button
            onClick={handleReset}
            style={{
              background: 'var(--line-soft)',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Reset view
          </button>
        </div>
      )}

      <svg viewBox="0 0 900 780" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <style>{`
            @keyframes ripple-expand {
              0% { r: 30; opacity: 0.6; }
              100% { r: 120; opacity: 0; }
            }
            @keyframes fade-in-ring {
              from { opacity: 0; transform: scale(0.7); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </defs>

        {ripples.map((r) => (
          <Ripple key={r.id} x={r.x} y={r.y} keyId={r.id} />
        ))}

        {!loading && rawNodes.length === 0 && (
          <text
            x={CX}
            y={CY}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="13"
            fontFamily="'Space Grotesk', sans-serif"
          >
            Enter a repository and click Analyze
          </text>
        )}

        {rawNodes.length > 0 && viewMode === 'hubs' && renderHubView(false)}
        {rawNodes.length > 0 && viewMode === 'loading' && (
          <>
            {renderHubView(true)}
            {renderLoadingOverlay()}
          </>
        )}
        {rawNodes.length > 0 && viewMode === 'blast' && renderBlastView()}

        {hovered && <Tooltip x={hovered.x} y={hovered.y - hovered.r} text={hovered.id} />}
      </svg>
    </div>
  );
}
