import React, { useState } from 'react';

import Sidebar from './components/Sidebar';
import GraphCanvas from './components/GraphCanvas';
import MigrationPanel from './components/MigrationPanel';

function App() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/pallets/click');
  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [blastRadiusData, setBlastRadiusData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  const fetchGraph = async (url) => {
    if (!url) return;
    setAnalyzing(true);
    setLoading(true);
    setSelectedNode(null);
    setBlastRadiusData(null);
    setVisibleCount(0);
    setRawNodes([]);
    setRawEdges([]);

    try {
      const response = await fetch(
        `http://localhost:8000/api/graph?url=${encodeURIComponent(url)}&include_tests=false`
      );
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (!data.nodes || !data.edges) {
        throw new Error('Invalid graph data received from server');
      }
      setRawNodes(data.nodes);
      setRawEdges(data.edges);
    } catch (err) {
      console.error('Failed to fetch graph:', err);
    } finally {
      setAnalyzing(false);
      setLoading(false);
    }
  };

  const handleNodeClick = async (node) => {
    setSelectedNode(node);
    setBlastRadiusData(null);

    try {
      const response = await fetch(
        `http://localhost:8000/api/blast-radius?node_id=${encodeURIComponent(node.id)}&repo=${encodeURIComponent(repoUrl)}`
      );
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data = await response.json();
      const maxDepth =
        Object.values(data.depth_map).length > 0
          ? Math.max(...Object.values(data.depth_map))
          : 0;
      setBlastRadiusData({ ...data, maxDepth });
    } catch (err) {
      console.error('Error fetching blast radius:', err);
    }
  };

  const handleReset = () => {
    setSelectedNode(null);
    setBlastRadiusData(null);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr 320px',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <Sidebar
        repoUrl={repoUrl}
        setRepoUrl={setRepoUrl}
        onAnalyze={fetchGraph}
        nodes={rawNodes}
        edges={rawEdges}
        analyzing={analyzing}
        onNodeSelect={handleNodeClick}
        selectedNode={selectedNode}
        visibleCount={visibleCount}
      />
      <GraphCanvas
        rawNodes={rawNodes}
        rawEdges={rawEdges}
        onNodeClick={handleNodeClick}
        blastRadiusData={blastRadiusData}
        selectedNode={selectedNode}
        repoUrl={repoUrl}
        onReset={handleReset}
        onVisibleCountChange={setVisibleCount}
        loading={loading}
      />
      <MigrationPanel
        node={selectedNode}
        blastRadiusData={blastRadiusData}
        repoUrl={repoUrl}
        rawNodes={rawNodes}
      />
    </div>
  );
}

export default App;
