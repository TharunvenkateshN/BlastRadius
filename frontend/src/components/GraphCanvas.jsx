import React, { useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Force layout function — places nodes dynamically simulating physical forces
function buildForceLayout(rawNodes, rawEdges) {
  if (!rawNodes || rawNodes.length === 0) return { nodes: [], edges: [] };

  const NODE_W = 180;
  const NODE_H = 44;
  
  // Step 1: Initialize positions in a circle
  const count = rawNodes.length;
  const radius = Math.max(300, count * 25);
  
  const positions = {};
  rawNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / count;
    positions[node.id] = {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });

  // Step 2: Build adjacency for force simulation
  const neighbors = {};
  rawNodes.forEach(n => { neighbors[n.id] = new Set(); });
  rawEdges.forEach(e => {
    if (neighbors[e.from] && neighbors[e.to]) {
      neighbors[e.from].add(e.to);
      neighbors[e.to].add(e.from);
    }
  });

  // Step 3: Run 80 iterations of force simulation
  const REPEL = 8000;
  const ATTRACT = 0.05;
  const IDEAL = 220;

  for (let iter = 0; iter < 80; iter++) {
    const forces = {};
    rawNodes.forEach(n => { forces[n.id] = { x: 0, y: 0 }; });

    // Repulsion between all pairs
    for (let i = 0; i < rawNodes.length; i++) {
      for (let j = i + 1; j < rawNodes.length; j++) {
        const a = rawNodes[i].id;
        const b = rawNodes[j].id;
        const dx = positions[a].x - positions[b].x;
        const dy = positions[a].y - positions[b].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = REPEL / (dist * dist);
        forces[a].x += (dx / dist) * force;
        forces[a].y += (dy / dist) * force;
        forces[b].x -= (dx / dist) * force;
        forces[b].y -= (dy / dist) * force;
      }
    }

    // Attraction along edges
    rawEdges.forEach(e => {
      if (!positions[e.from] || !positions[e.to]) return;
      const dx = positions[e.to].x - positions[e.from].x;
      const dy = positions[e.to].y - positions[e.from].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = ATTRACT * (dist - IDEAL);
      forces[e.from].x += (dx / dist) * force;
      forces[e.from].y += (dy / dist) * force;
      forces[e.to].x -= (dx / dist) * force;
      forces[e.to].y -= (dy / dist) * force;
    });

    // Apply forces with damping
    const damping = 0.85 - iter * 0.005;
    rawNodes.forEach(n => {
      positions[n.id].x += forces[n.id].x * damping;
      positions[n.id].y += forces[n.id].y * damping;
    });
  }

  // Step 4: Build ReactFlow nodes
  const nodes = rawNodes.map(node => ({
    id: node.id,
    position: {
      x: positions[node.id].x - NODE_W / 2,
      y: positions[node.id].y - NODE_H / 2,
    },
    data: {
      label: node.name.length > 16
        ? node.name.slice(0, 16) + '...'
        : node.name,
      fullId: node.id,
      file: node.file,
    },
    style: {
      background: '#1e293b',
      border: '1px solid #475569',
      borderRadius: '8px',
      color: '#e2e8f0',
      fontSize: '13px',
      fontWeight: '500',
      width: NODE_W,
      height: NODE_H,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      padding: '0 10px',
      boxSizing: 'border-box',
    },
  }));

  const nodeIds = new Set(rawNodes.map(n => n.id));
  const edges = rawEdges
    .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e, i) => ({
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      style: { stroke: '#334155', strokeWidth: 1, opacity: 0.4 },
      animated: false,
    }));

  return { nodes, edges };
}

// Grid layout function — places nodes in a clean grid as a fallback
function buildGridLayout(rawNodes, rawEdges) {
  if (!rawNodes || rawNodes.length === 0) return { nodes: [], edges: [] };

  const COLS = Math.ceil(Math.sqrt(rawNodes.length));
  const NODE_W = 180;
  const NODE_H = 44;
  const GAP_X = 60;
  const GAP_Y = 40;

  const nodes = rawNodes.map((node, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    return {
      id: node.id,
      position: {
        x: col * (NODE_W + GAP_X),
        y: row * (NODE_H + GAP_Y),
      },
      data: {
        label: node.name.length > 16
          ? node.name.slice(0, 16) + '...'
          : node.name,
        fullId: node.id,
        file: node.file,
      },
      style: {
        background: '#1e293b',
        border: '1px solid #475569',
        borderRadius: '8px',
        color: '#e2e8f0',
        fontSize: '13px',
        fontWeight: '500',
        width: NODE_W,
        height: NODE_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: '0 10px',
        boxSizing: 'border-box',
      },
    };
  });

  const nodeIds = new Set(rawNodes.map(n => n.id));
  const edges = rawEdges
    .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e, i) => ({
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      style: { stroke: '#334155', strokeWidth: 1, opacity: 0.5 },
      animated: false,
    }));

  return { nodes, edges };
}

function GraphCanvasInner({ rawNodes, rawEdges, onNodeClick, blastRadiusData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!rawNodes || rawNodes.length === 0) return;
    
    let laidNodes, laidEdges;
    if (rawNodes.length <= 150) {
      const result = buildForceLayout(rawNodes, rawEdges);
      laidNodes = result.nodes;
      laidEdges = result.edges;
    } else {
      const result = buildGridLayout(rawNodes, rawEdges);
      laidNodes = result.nodes;
      laidEdges = result.edges;
    }
    
    setNodes(laidNodes);
    setEdges(laidEdges);
    setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 150);
  }, [rawNodes.length]);

  useEffect(() => {
    if (!blastRadiusData) return;
    const { origin, affected, depth_map } = blastRadiusData;
    const affectedSet = new Set(affected);
    setNodes(nds => nds.map(n => {
      if (n.id === origin) return {
        ...n, style: { ...n.style, background: '#dc2626',
        border: '2px solid #ef4444' }
      };
      if (affectedSet.has(n.id)) {
        const depth = depth_map[n.id] || 1;
        const opacity = Math.max(0.3, 1 - depth * 0.08);
        return { ...n, style: { ...n.style,
          background: '#92400e',
          border: '1px solid #f59e0b',
          opacity
        }};
      }
      return { ...n, style: { ...n.style,
        background: '#1e293b',
        border: '1px solid #475569',
        opacity: 0.3
      }};
    }));
  }, [blastRadiusData]);

  const handleNodeClick = useCallback((event, node) => {
    onNodeClick(node);
    setNodes(nds => nds.map(n => ({
      ...n,
      style: {
        ...n.style,
        border: n.id === node.id
          ? '2px solid #3b82f6'
          : '1px solid #475569',
        boxShadow: n.id === node.id
          ? '0 0 12px rgba(59,130,246,0.5)'
          : 'none',
        background: n.id === node.id ? '#1e3a5f' : '#1e293b',
      },
    })));
  }, [onNodeClick, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      minZoom={0.02}
      maxZoom={3}
      fitView
      fitViewOptions={{ padding: 0.3, includeHiddenNodes: false }}
      defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
    >
      <Background color="#1f2937" gap={24} />
      <Controls />
      <MiniMap
        nodeColor="#3b82f6"
        maskColor="rgba(0,0,0,0.7)"
        style={{ background: '#0a0a0a' }}
      />
      
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
        <button 
          onClick={() => fitView({ padding: 0.3, duration: 600 })}
          className="bg-[#1a1a1a] border border-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded shadow-md hover:bg-[#2a2a2a] transition-colors"
        >
          Fit View
        </button>
      </div>
    </ReactFlow>
  );
}

export default function GraphCanvas({ rawNodes, rawEdges, onNodeClick, blastRadiusData }) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner
        rawNodes={rawNodes}
        rawEdges={rawEdges}
        onNodeClick={onNodeClick}
        blastRadiusData={blastRadiusData}
      />
    </ReactFlowProvider>
  );
}
