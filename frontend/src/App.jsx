import React, { useState } from 'react';
import { useNodesState, useEdgesState } from '@xyflow/react';
import { AlertCircle } from 'lucide-react';

import TopBar from './components/TopBar';
import GraphCanvas, { getLayoutedElements } from './components/GraphCanvas';
import MigrationPanel from './components/MigrationPanel';

function App() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/pallets/click');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [blastData, setBlastData] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const handleAnalyze = async () => {
    if (!repoUrl) return;
    setLoading(true);
    setError(null);
    setStats(null);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);

    try {
      const response = await fetch(`http://localhost:8000/api/graph?url=${encodeURIComponent(repoUrl)}&include_tests=false`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      if (!data.nodes || !data.edges) {
        throw new Error('Invalid graph data received from server');
      }

      const initialNodes = data.nodes.map((node) => ({
        id: node.id,
        type: 'custom',
        data: {
          label: node.name,
          file: node.file,
          type: node.type,
          fullId: node.id
        },
        position: { x: 0, y: 0 } // initial position, overwritten by dagre
      }));

      const initialEdges = data.edges.map((edge) => ({
        id: `e-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'default',
        animated: false,
        style: { stroke: '#333355', strokeWidth: 1 },
        markerEnd: {
          type: 'arrowclosed',
          color: '#333355',
        },
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setStats({
        nodesCount: layoutedNodes.length,
        edgesCount: layoutedEdges.length
      });
      setBlastData(null); // Reset blast data on new graph analysis
    } catch (err) {
      setError(err.message || 'Failed to fetch graph data');
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = async (event, node) => {
    // If clicking the currently selected node, reset it
    if (blastData && blastData.origin === node.id) {
      resetNodeColors();
      return;
    }
    
    // Reset any previous colors first
    resetNodeColors();
    setSelectedNode(node);
    
    try {
      const response = await fetch(`http://localhost:8000/api/blast-radius?node_id=${encodeURIComponent(node.id)}&repo=${encodeURIComponent(repoUrl)}`);
      
      if (response.status === 404) {
        showToast("Node not found in graph");
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      setBlastData(data);
      animateBlastRadius(data);
    } catch (err) {
      console.error("Error fetching blast radius:", err);
      showToast("Failed to fetch blast radius");
    }
  };

  const onPaneClick = () => {
    resetNodeColors();
  };

  const resetNodeColors = () => {
    setBlastData(null);
    setSelectedNode(null);
    setNodes(nds => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        bgColor: undefined,
        borderColor: undefined,
        boxShadow: undefined
      }
    })));
  };

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const animateBlastRadius = (data) => {
    const { origin, depth_map } = data;
    
    // Calculate max depth for the stats bar
    const maxDepth = Object.values(depth_map).length > 0 
      ? Math.max(...Object.values(depth_map)) 
      : 0;
    
    setBlastData({
      ...data,
      maxDepth,
      affectedCount: Object.keys(depth_map).length
    });

    // Update nodes state incrementally with timeouts
    setNodes(nds => nds.map(n => {
      if (n.id === origin) {
        return {
          ...n,
          data: {
            ...n.data,
            bgColor: '#3a0a14',
            borderColor: '#FF2D55',
            boxShadow: '0 0 20px #FF2D55'
          }
        };
      }
      
      // We process affected nodes dynamically
      return n;
    }));

    // Process each depth level
    const depthLevels = {};
    for (const [nodeId, depth] of Object.entries(depth_map)) {
      if (!depthLevels[depth]) depthLevels[depth] = [];
      depthLevels[depth].push(nodeId);
    }

    // Schedule updates for each depth
    Object.entries(depthLevels).forEach(([depthStr, nodeIds]) => {
      const depth = parseInt(depthStr);
      setTimeout(() => {
        setNodes(currentNodes => currentNodes.map(n => {
          if (nodeIds.includes(n.id)) {
            let bgColor, borderColor;
            if (depth === 1) {
              bgColor = '#2d1a1a';
              borderColor = '#FF6B6B';
            } else if (depth === 2) {
              bgColor = '#261818';
              borderColor = '#FF8C8C';
            } else {
              bgColor = '#201515';
              borderColor = '#FFB3B3';
            }

            return {
              ...n,
              data: {
                ...n.data,
                bgColor,
                borderColor
              }
            };
          }
          return n;
        }));
      }, 200 * depth);
    });
  };

  const handleMigrationSuccess = (nodeId) => {
    setNodes(nds => nds.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            label: n.data.label.startsWith("✓ ") ? n.data.label : "✓ " + n.data.label,
            bgColor: '#00C853',
            borderColor: '#00e676',
            boxShadow: '0 0 15px rgba(0, 200, 83, 0.5)'
          }
        };
      }
      return n;
    }));
  };

  return (
    <div className="w-full h-screen bg-[#0a0a0a] text-white flex flex-col font-sans">
      <TopBar 
        repoUrl={repoUrl}
        setRepoUrl={setRepoUrl}
        onAnalyze={handleAnalyze}
        loading={loading}
        stats={stats}
        blastData={blastData}
        resetNodeColors={resetNodeColors}
      />

      {/* Main Content Area */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-300">Cloning and parsing repository...</p>
            <p className="text-gray-500 text-sm mt-1">this may take 30-60 seconds</p>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-md flex items-center gap-3 shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-gray-800 text-white px-4 py-2 rounded shadow-lg transition-opacity">
            {toastMessage}
          </div>
        )}

        <GraphCanvas 
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={onPaneClick}
        />
        
        <MigrationPanel 
          selectedNode={selectedNode}
          repoUrl={repoUrl}
          onClose={resetNodeColors}
          onMigrationSuccess={handleMigrationSuccess}
        />
      </div>
    </div>
  );
}

export default App;
