import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import TopBar from './components/TopBar';
import GraphCanvas from './components/GraphCanvas';
import MigrationPanel from './components/MigrationPanel';

function App() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/pallets/click');
  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [blastData, setBlastData] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [isFocusView, setIsFocusView] = useState(true);
  const [showFullGraphWarning, setShowFullGraphWarning] = useState(false);

  const getFilteredNodes = (nodes, edges, hubMode) => {
    if (!hubMode) return nodes;
    const degreeMap = {};
    nodes.forEach(n => { degreeMap[n.id] = 0; });
    edges.forEach(e => {
      if (degreeMap[e.from] !== undefined) degreeMap[e.from]++;
      if (degreeMap[e.to] !== undefined) degreeMap[e.to]++;
    });
    return nodes.filter(n => (degreeMap[n.id] || 0) >= 5);
  };

  const handleAnalyze = async () => {
    if (!repoUrl) return;
    setLoading(true);
    setError(null);
    setStats(null);
    setRawNodes([]);
    setRawEdges([]);
    setSelectedNode(null);
    setShowTooltip(false);
    setIsFocusView(true); // Reset to Hub View on new search

    try {
      const response = await fetch(`http://localhost:8000/api/graph?url=${encodeURIComponent(repoUrl)}&include_tests=false`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      if (!data.nodes || !data.edges) {
        throw new Error('Invalid graph data received from server');
      }

      setRawNodes(data.nodes);
      setRawEdges(data.edges);
      
      setHasAnalyzed(true);
      
      setStats({
        nodesCount: data.nodes.length,
        edgesCount: data.edges.length
      });
      setBlastData(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch graph data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFocusView = () => {
    if (rawNodes.length === 0) return;
    
    if (isFocusView) {
      // Switching to Full Graph - show modal warning briefly before rendering
      setShowFullGraphWarning(true);
      
      setTimeout(() => {
        setIsFocusView(false);
        setShowFullGraphWarning(false);
      }, 500);
    } else {
      setIsFocusView(true);
    }
  };

  const handleNodeClick = async (node) => {
    // If clicking the currently selected node, reset it
    if (blastData && blastData.origin === node.id) {
      resetNodeColors();
      return;
    }
    
    // Reset any previous colors first
    resetNodeColors();
    setSelectedNode(node);
    setShowTooltip(false); // Hide instructional badge
    
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
      
      // Calculate max depth for the stats bar
      const maxDepth = Object.values(data.depth_map).length > 0 
        ? Math.max(...Object.values(data.depth_map)) 
        : 0;
      
      setBlastData({
        ...data,
        maxDepth,
        affectedCount: Object.keys(data.depth_map).length
      });
    } catch (err) {
      console.error("Error fetching blast radius:", err);
      showToast("Failed to fetch blast radius");
    }
  };

  const resetNodeColors = () => {
    setBlastData(null);
    setSelectedNode(null);
  };

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMigrationSuccess = (nodeId) => {
    // We update the underlying raw nodes data so the label shows a checkmark
    setRawNodes(nds => nds.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          name: n.name.startsWith("✓ ") ? n.name : "✓ " + n.name
        };
      }
      return n;
    }));
  };

  const displayNodes = getFilteredNodes(rawNodes, rawEdges, isFocusView);

  return (
    <div className="w-full h-screen bg-[#0a0a0a] text-white flex flex-col font-sans">
      {/* Full Graph Virtual Loading Warning */}
      {showFullGraphWarning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[rgba(0,0,0,0.8)] backdrop-blur-sm">
          <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-white text-lg font-medium">⚠ Loading full graph ({rawNodes.length} nodes)</p>
          <p className="text-gray-400 mt-2">This may take a moment...</p>
        </div>
      )}

      {/* Full Screen Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-md">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-white text-lg font-medium">Analyzing repository...</p>
          <p className="text-gray-400 mt-2">this may take 30-60 seconds</p>
        </div>
      )}

      <TopBar 
        repoUrl={repoUrl}
        setRepoUrl={setRepoUrl}
        onAnalyze={handleAnalyze}
        loading={loading}
        stats={stats}
        blastData={blastData}
        resetNodeColors={resetNodeColors}
        isFocusView={isFocusView}
        onToggleFocusView={handleToggleFocusView}
      />

      {/* Main Content Area */}
      <div className="flex-1 relative">
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

        {!hasAnalyzed && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-[#4b5563] text-[16px] max-w-md text-center">
              ← Enter a GitHub repository URL and click Analyze to explore its dependency graph
            </p>
          </div>
        )}

        {hasAnalyzed && (
          <GraphCanvas 
            rawNodes={displayNodes}
            rawEdges={rawEdges}
            onNodeClick={handleNodeClick}
            blastRadiusData={blastData}
          />
        )}
        
        {/* Onboarding Tooltip */}
        {showTooltip && hasAnalyzed && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#1e3a5f] border border-[#3b82f6] rounded-[20px] py-1.5 px-4 shadow-xl text-center flex items-center gap-2 pointer-events-none">
            <span className="text-xl">👆</span>
            <p className="text-[#93c5fd] text-[13px] font-medium m-0">
              Click any node to see its blast radius
            </p>
          </div>
        )}
        
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
