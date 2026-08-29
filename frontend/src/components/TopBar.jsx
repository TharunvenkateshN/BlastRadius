import React from 'react';
import { Search, Activity } from 'lucide-react';

const TopBar = ({ repoUrl, setRepoUrl, onAnalyze, loading, stats, blastData, resetNodeColors }) => {
  return (
    <div className="flex-none flex flex-col">
      {/* Top Bar */}
      <div className="h-16 bg-[#111] border-b border-gray-800 flex items-center px-6 gap-6">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-500" />
          <h1 className="text-xl font-bold tracking-tight">BlastRadius</h1>
        </div>
        
        <div className="flex-1 max-w-2xl mx-auto flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/pallets/click"
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded-md py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-200 placeholder-gray-500 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
            />
          </div>
          <button
            onClick={onAnalyze}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-[#161616] border-b border-gray-800 py-2 px-6 flex justify-between items-center text-sm">
        {stats ? (
          <div className="text-gray-400 flex gap-4">
            <span>{stats.nodesCount} nodes</span>
            <span>&middot;</span>
            <span>{stats.edgesCount} edges</span>
          </div>
        ) : (
          <div className="text-gray-500">Ready</div>
        )}
        
        {blastData && blastData.affectedCount > 0 && (
          <div className="text-pink-400 font-medium flex items-center gap-2 cursor-pointer" onClick={resetNodeColors}>
            ⚡ {blastData.affectedCount} functions affected across {blastData.maxDepth} hops — click origin to reset
          </div>
        )}
      </div>
    </div>
  );
};

export default TopBar;
