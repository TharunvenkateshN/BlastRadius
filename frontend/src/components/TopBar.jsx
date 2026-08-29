import React from 'react';
import { Search, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TopBar = ({ repoUrl, setRepoUrl, onAnalyze, loading, stats, blastData, resetNodeColors, isFocusView, onToggleFocusView }) => {
  const navigate = useNavigate();
  
  return (
    <div className="flex-none flex flex-col z-20">
      {/* Top Bar */}
      <div className="h-[56px] bg-[#0a0a0a] border-b border-[#1f2937] flex items-center px-6 justify-between">
        
        {/* Left: Logo */}
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/')}
        >
          <span className="text-[18px]">⚡</span>
          <h1 className="text-[18px] font-bold text-white tracking-tight">BlastRadius</h1>
        </div>
        
        {/* Center: Search input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/pallets/click"
            className="w-[500px] bg-[#111827] border border-[#374151] rounded-[8px] py-[8px] px-[16px] text-[14px] text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-500 transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
          />
          <button
            onClick={onAnalyze}
            disabled={loading}
            className="bg-[#3b82f6] hover:bg-blue-600 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-[8px] py-[8px] px-[20px] text-[14px] font-semibold transition-colors"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        
        {/* Right: Stats & View Toggle */}
        <div className="flex items-center gap-4">
          {stats ? (
            <div className="text-[#6b7280] text-[13px]">
              {stats.nodesCount} nodes &middot; {stats.edgesCount} edges
            </div>
          ) : null}
          
          {stats && (
            <button 
              onClick={onToggleFocusView}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors border ${
                isFocusView 
                  ? 'bg-[#3b82f6]/20 border-[#3b82f6]/50 text-[#93c5fd]' 
                  : 'bg-[#1f2937] border-[#374151] text-gray-300'
              }`}
            >
              {isFocusView ? 'Hub View' : 'Full Graph'}
            </button>
          )}
        </div>
      </div>

      {/* Blast Radius Bar (only shows when active) */}
      {blastData && blastData.affectedCount > 0 && (
        <div className="bg-[#161616] border-b border-[#1f2937] py-2 px-6 flex justify-center items-center text-[13px]">
          <div 
            className="text-pink-400 font-medium flex items-center gap-2 cursor-pointer bg-[#3a0a14] px-4 py-1.5 rounded-full animate-pulse-blue border border-pink-900/50 hover:bg-[#4a0a1a] transition-colors" 
            onClick={resetNodeColors}
          >
            ⚡ {blastData.affectedCount} functions affected across {blastData.maxDepth} hops — click here to reset
          </div>
        </div>
      )}
    </div>
  );
};

export default TopBar;
