import React, { useState, useEffect, useMemo, useCallback } from 'react';

const CX = 450;
const CY = 390;
const HUB_RADIUS = 220;
const HUB_COUNT = 15;
const DORMANT_RADIUS = 420;
const DORMANT_COUNT = 12;

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

function depthRadius(depth) {
  if (depth === 1) return 155;
  if (depth === 2) return 255;
  return 340;
}

function depthStyle(depth) {
  if (depth === 1) return { r: 13, fill: '#ff8c5f', stroke: '#ffb28f66' };
  if (depth === 2) return { r: 11, fill: '#cf7a58', stroke: '#cf7a5866' };
  return { r: 9, fill: '#a05a3e', stroke: '#a05a3e55' };
}

function Ripple({ x, y, keyId }) {
  return (
    <circle
      key={keyId}
      cx={x}
      cy={y}
      r={24}
      fill="none"
      stroke="var(--ember)"
      strokeWidth={1.5}
      style={{
        animation: 'ripple-expand 1.1s ease-out forwards',
        transformOrigin: `${x}px ${y}px`,
      }}
    />
  );
}

export default function GraphCanvas({
  rawNodes,
  rawEdges,
  onNodeClick,
  blastRadiusData,
  selectedNode,
  repoUrl,
  onReset,
  onVisibleCountChange,
  loading,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [revealedMaxDepth, setRevealedMaxDepth] = useState(0);
  const [ripples, setRipples] = useState([]);
  const [viewMode, setViewMode] = useState('hubs');

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
    const positions = { [origin]: { x: CX, y: CY } };

    const byDepth = {};
    affected.forEach((id) => {
      const depth = depth_map[id] || 3;
      if (!byDepth[depth]) byDepth[depth] = [];
      byDepth[depth].push(id);
    });

    Object.entries(byDepth).forEach(([depthStr, ids]) => {
      const depth = parseInt(depthStr, 10);
      const radius = depthRadius(depth);
      ids.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
        positions[id] = polarToXY(CX, CY, radius, angle);
      });
    });

    const visibleIds = new Set([origin, ...affected]);
    const nodeById = {};
    rawNodes.forEach((n) => {
      nodeById[n.id] = n;
    });

    const depth1Ids = new Set(byDepth[1] || []);
    const depth2Ids = new Set(byDepth[2] || []);

    const edges = [];
    rawEdges.forEach((e) => {
      if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return;
      if (e.from === origin && depth1Ids.has(e.to)) {
        edges.push({ ...e, tier: 1 });
      } else if (depth1Ids.has(e.from) && depth2Ids.has(e.to)) {
        edges.push({ ...e, tier: 2 });
      } else if (depth1Ids.has(e.to) && depth2Ids.has(e.from)) {
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
      byDepth,
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
    const depths = Object.values(blastRadiusData.depth_map);
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
      setRipples((prev) => [...prev, { id: Date.now(), x: x ?? CX, y: y ?? CY }]);
      setTimeout(() => setRipples((prev) => prev.slice(1)), 1200);
      onNodeClick(node);
    },
    [onNodeClick]
  );

  const handleReset = () => {
    setViewMode('hubs');
    setRevealedMaxDepth(0);
    onReset();
  };

  const repoName = repoUrl
    ? repoUrl.replace(/https?:\/\/github\.com\//, '').replace(/\/$/, '')
    : '';
  const nodeLabel = selectedNode?.name || selectedNode?.id?.split(':').pop() || '';

  const renderHubView = () => (
    <>
      <circle
        cx={CX}
        cy={CY}
        r={HUB_RADIUS}
        fill="none"
        stroke="#161d27"
        strokeWidth={1}
        strokeDasharray="2,6"
      />
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
      {hubNodes.map((node) => {
        const pos = hubPositions[node.id];
        const isHovered = hoveredId === node.id;
        return (
          <g
            key={node.id}
            style={{ cursor: 'pointer' }}
            onClick={() => handleNodeClick(node, pos.x, pos.y)}
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <circle
              cx={pos.x}
              cy={pos.y}
              r={14}
              fill={isHovered ? 'var(--safe-soft)' : 'var(--bg-panel)'}
              stroke={isHovered ? 'var(--safe)' : 'var(--line)'}
              strokeWidth={1.5}
              style={{ transition: 'all 0.15s ease' }}
            />
            <text
              x={pos.x}
              y={pos.y + 26}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize="10.5"
              fontFamily="'JetBrains Mono', monospace"
            >
              {node.name.length > 14 ? node.name.slice(0, 14) + '…' : node.name}
            </text>
            {isHovered && (
              <title>{node.id}</title>
            )}
          </g>
        );
      })}
    </>
  );

  const renderLoadingView = () => (
    <>
      <circle
        cx={CX}
        cy={CY}
        r={24}
        fill="var(--ember)"
        stroke="#ffb28f"
        strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 14px #ff6a3d33)' }}
      />
      <text
        x={CX}
        y={CY + 44}
        textAnchor="middle"
        fill="var(--text-secondary)"
        fontSize="12"
        fontFamily="'JetBrains Mono', monospace"
      >
        {selectedNode?.name || '…'}
      </text>
      <g transform={`translate(${CX - 12}, ${CY + 60})`}>
        <circle
          cx={12}
          cy={12}
          r={10}
          fill="none"
          stroke="var(--ember)"
          strokeWidth={2}
          strokeDasharray="20 40"
          style={{ animation: 'spin 0.8s linear infinite', transformOrigin: '12px 12px' }}
        />
      </g>
    </>
  );

  const renderBlastView = () => {
    if (!blastLayout || !blastRadiusData) return null;
    const { positions, byDepth, edges, dormantCandidates, dormantPositions, nodeById } =
      blastLayout;
    const { origin, depth_map } = blastRadiusData;
    const originNode = nodeById[origin] || selectedNode;

    return (
      <>
        {Object.entries(byDepth).map(([depthStr, ids]) => {
          const depth = parseInt(depthStr, 10);
          if (depth > revealedMaxDepth) return null;
          const style = depthStyle(depth);
          return ids.map((id, i) => {
            const pos = positions[id];
            const node = nodeById[id];
            const isHovered = hoveredId === id;
            return (
              <g
                key={id}
                style={{
                  cursor: 'pointer',
                  animation: `ring-reveal 0.3s ease-out ${depth * 150}ms both`,
                }}
                onClick={() => node && handleNodeClick(node, pos.x, pos.y)}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={style.r}
                  fill={isHovered ? 'var(--safe-soft)' : style.fill}
                  stroke={isHovered ? 'var(--safe)' : style.stroke}
                  strokeWidth={1.5}
                  style={{ transition: 'all 0.15s ease' }}
                />
                <text
                  x={pos.x}
                  y={pos.y + style.r + 14}
                  textAnchor="middle"
                  fill="var(--text-secondary)"
                  fontSize="10"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {(node?.name || id.split(':').pop()).slice(0, 12)}
                </text>
                {isHovered && <title>{id}</title>}
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
                stroke={isTier1 ? 'var(--ember)' : '#cf7a58'}
                strokeWidth={isTier1 ? 1.2 : 0.9}
                opacity={isTier1 ? 0.6 : 0.4}
              />
            );
          })}

        {/* Origin on top */}
        <g style={{ cursor: 'pointer' }} onClick={() => originNode && handleNodeClick(originNode, CX, CY)}>
          <circle
            cx={CX}
            cy={CY}
            r={24}
            fill="var(--ember)"
            stroke="#ffb28f"
            strokeWidth={2}
            style={{ filter: 'drop-shadow(0 0 14px #ff6a3d33)' }}
          />
          <text
            x={CX}
            y={CY + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1a0a03"
            fontSize="11"
            fontWeight="600"
            fontFamily="'JetBrains Mono', monospace"
          >
            {(originNode?.name || 'origin').slice(0, 10)}
          </text>
        </g>

        {/* Dormant nodes */}
        {dormantCandidates.map((node) => {
          const pos = dormantPositions[node.id];
          const isHovered = hoveredId === node.id;
          return (
            <g
              key={`dormant-${node.id}`}
              style={{ cursor: 'pointer' }}
              onClick={() => handleNodeClick(node, pos.x, pos.y)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={6}
                fill={isHovered ? 'var(--safe-soft)' : 'var(--bg-panel)'}
                stroke={isHovered ? 'var(--safe)' : 'var(--line)'}
                strokeWidth={1}
                opacity={isHovered ? 1 : 0.4}
                style={{ transition: 'all 0.15s ease' }}
              />
              {isHovered && <title>{node.id}</title>}
            </g>
          );
        })}

        <text
          x={CX + 180}
          y={CY + 320}
          fill="var(--text-muted)"
          fontSize="11"
          fontFamily="'Space Grotesk', sans-serif"
          style={{ maxWidth: '220px' }}
        >
          Click any dormant node in the outer ring to expand its own blast radius,
          or click the origin again to collapse this view back down.
        </text>
      </>
    );
  };

  return (
    <div
      style={{
        position: 'relative',
        background: 'radial-gradient(circle at 50% 45%, #0f141c 0%, #0a0e14 65%)',
        overflow: 'hidden',
      }}
    >
      {/* Breadcrumb + Reset */}
      {(viewMode === 'loading' || viewMode === 'blast') && selectedNode && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--line)',
            borderRadius: '10px',
            padding: '9px 16px',
          }}
        >
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
              0% { r: 24; opacity: 0.55; }
              100% { r: 80; opacity: 0; }
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

        {rawNodes.length > 0 && viewMode === 'hubs' && renderHubView()}
        {rawNodes.length > 0 && viewMode === 'loading' && renderLoadingView()}
        {rawNodes.length > 0 && viewMode === 'blast' && renderBlastView()}
      </svg>
    </div>
  );
}
