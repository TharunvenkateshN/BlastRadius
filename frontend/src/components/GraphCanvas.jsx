import React from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 160;
const nodeHeight = 36;

export const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 20 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = direction === 'LR' ? 'left' : 'top';
    node.sourcePosition = direction === 'LR' ? 'right' : 'bottom';
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    return node;
  });

  return { nodes, edges };
};

const CustomNode = ({ data }) => {
  let bgColor, borderColor;
  if (data.type === 'function') {
    bgColor = '#1a1a2e';
    borderColor = '#4a4a8a';
  } else if (data.type === 'class') {
    bgColor = '#1a2e1a';
    borderColor = '#4a8a4a';
  } else {
    bgColor = '#2e1a1a';
    borderColor = '#8a4a4a';
  }

  return (
    <div
      style={{
        backgroundColor: data.bgColor || bgColor,
        borderColor: data.borderColor || borderColor,
        boxShadow: data.boxShadow || 'none',
        transition: 'all 0.3s ease-in-out',
      }}
      className={`px-4 py-1.5 border-2 rounded shadow-md text-white text-sm truncate max-w-[160px] w-[160px] text-center`}
      title={data.fullId}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-gray-400" />
      {data.label}
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-gray-400" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const GraphCanvas = ({ nodes, edges, onNodesChange, onEdgesChange, onNodeClick, onPaneClick }) => {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ maxZoom: 0.4 }}
      minZoom={0.05}
      maxZoom={1.5}
      className="bg-[#0a0a0a]"
    >
      <Background variant="dots" color="#222244" gap={20} />
      <Controls className="bg-[#1a1a1a] border-gray-800 fill-white" />
      <MiniMap 
        nodeColor={(node) => {
          if (node.data?.type === 'function') return '#1a1a2e';
          if (node.data?.type === 'class') return '#1a2e1a';
          return '#2e1a1a';
        }}
        maskColor="#0a0a0a80"
        className="bg-[#111] border-gray-800"
      />
    </ReactFlow>
  );
};

export default GraphCanvas;
