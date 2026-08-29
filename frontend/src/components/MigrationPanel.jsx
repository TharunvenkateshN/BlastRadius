import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';

const MigrationPanel = ({ selectedNode, repoUrl, onClose, onMigrationSuccess }) => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [events, setEvents] = useState([]);
  const [stageStates, setStageStates] = useState({});
  const bottomRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    // Reset state when node changes
    setIsMigrating(false);
    setEvents([]);
    setStageStates({});
    
    // Cleanup any existing websocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [selectedNode?.id]);

  useEffect(() => {
    // Auto-scroll to bottom as new events come in
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, stageStates]);

  const handleMigrate = async () => {
    if (!selectedNode || !repoUrl) return;
    
    setIsMigrating(true);
    setEvents([{ stage: 'init', status: 'running', message: 'Initializing migration...' }]);
    
    try {
      // Step 1: POST to start migration
      const response = await fetch('http://localhost:8000/api/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          node_id: selectedNode.id,
          repo: repoUrl
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start migration: ${response.statusText}`);
      }
      
      setEvents(prev => [...prev, { stage: 'init', status: 'done', message: 'Migration initialized' }]);

      // Step 2: Connect WebSocket
      const wsUrl = `ws://localhost:8000/ws/migrate/${selectedNode.id}?repo=${encodeURIComponent(repoUrl)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setEvents(prev => [...prev, { stage: 'ws', status: 'connected', message: 'Connected to migration stream' }]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          setStageStates(prev => {
            const newState = { ...prev };
            
            // Handle PROPOSE
            if (data.stage === 'propose') {
              if (data.status === 'running') {
                newState.propose = { ...data };
              } else if (data.status === 'done' || data.status === 'error') {
                newState.propose = { ...data };
              }
            }
            
            // Handle VERIFY
            if (data.stage === 'verify') {
              if (!newState.verify) {
                newState.verify = { tests: [], status: data.status };
              } else {
                newState.verify.status = data.status;
              }
              
              if (data.status === 'running') {
                newState.verify.current = { index: data.test_index, total: data.total };
              } else if (data.status === 'done' && data.test_index !== undefined) {
                // Ensure array is large enough
                const tests = [...(newState.verify.tests || [])];
                tests[data.test_index] = data;
                newState.verify.tests = tests;
              } else if (data.status === 'stub') {
                newState.verify.stub = true;
              }
            }
            
            // Handle DECIDE
            if (data.stage === 'decide') {
              newState.decide = { ...data };
              
              if (data.status === 'done' && data.action === 'pr_opened') {
                if (onMigrationSuccess) onMigrationSuccess(selectedNode.id);
              } else if (data.status === 'stub') {
                if (onMigrationSuccess) onMigrationSuccess(selectedNode.id);
              }
            }
            
            return newState;
          });
          
        } catch (err) {
          console.error("Error parsing websocket message:", err);
        }
      };

      ws.onerror = (error) => {
        setEvents(prev => [...prev, { stage: 'ws', status: 'error', message: 'WebSocket connection error' }]);
      };

      ws.onclose = () => {
        setEvents(prev => [...prev, { stage: 'ws', status: 'closed', message: 'Migration stream closed' }]);
      };

    } catch (err) {
      setEvents(prev => [...prev, { stage: 'error', status: 'error', message: err.message }]);
    }
  };

  if (!selectedNode) return null;

  return (
    <div 
      className="fixed right-0 top-0 w-[420px] h-screen bg-[#111111] border-l border-[#222222] z-10 flex flex-col shadow-2xl transition-transform duration-200 ease-in-out transform translate-x-0 overflow-hidden"
    >
      {/* Header */}
      <div className="flex-none p-6 border-b border-[#222222] flex justify-between items-start bg-[#161616]">
        <div className="min-w-0 pr-4">
          <h2 className="text-white text-[18px] font-bold truncate" title={selectedNode.data?.label || selectedNode.id}>
            {selectedNode.data?.label || selectedNode.id.split(':').pop()}
          </h2>
          <p className="text-[#888888] text-[12px] break-all mt-1 leading-tight">
            {selectedNode.id}
          </p>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#111111] flex flex-col">
        {!isMigrating ? (
          <button
            onClick={handleMigrate}
            className="w-full bg-[#3b82f6] hover:bg-blue-600 active:bg-blue-700 text-white font-bold h-[44px] rounded-[12px] transition-colors flex items-center justify-center mt-4"
          >
            Migrate this function
          </button>
        ) : (
          <div className="flex flex-col gap-6 text-sm">
            {/* Init Phase */}
            {events.find(e => e.stage === 'init' && e.status === 'running') && (
              <div className="flex items-center gap-2 text-gray-300">
                <Loader2 className="animate-spin w-4 h-4 text-blue-500" />
                Initializing migration...
              </div>
            )}

            {/* Propose Phase */}
            {(stageStates.propose || events.find(e => e.stage === 'ws' && e.status === 'connected')) && (
              <div className="flex flex-col gap-3">
                <div className="text-[#888888] uppercase tracking-widest text-xs font-semibold mb-1">
                  ── PROPOSE ──
                </div>
                
                {!stageStates.propose || stageStates.propose.status === 'running' ? (
                  <div className="flex items-center gap-2 text-gray-300">
                    <Loader2 className="animate-spin w-4 h-4 text-blue-500" />
                    Proposing refactored version...
                  </div>
                ) : stageStates.propose.status === 'error' ? (
                  <div className="flex items-start gap-2 text-red-500">
                    <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Error: {stageStates.propose.message}</span>
                  </div>
                ) : stageStates.propose.status === 'done' ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[#22c55e] font-medium">
                      <CheckCircle className="w-4 h-4" />
                      Proposal ready
                    </div>
                    
                    <div className="flex gap-2 w-full h-[180px]">
                      {/* Before */}
                      <div className="flex-1 flex flex-col min-w-0 border border-red-900/50 rounded-md overflow-hidden bg-[#1a0a0a]">
                        <div className="bg-red-950/30 text-red-400 text-[10px] px-2 py-1 font-mono uppercase tracking-wider border-b border-red-900/50">Before</div>
                        <div className="flex-1 overflow-auto p-2">
                          <pre className="text-red-200 font-mono text-[11px] leading-relaxed m-0 w-max pr-4">
                            {stageStates.propose.old_code}
                          </pre>
                        </div>
                      </div>
                      
                      {/* After */}
                      <div className="flex-1 flex flex-col min-w-0 border border-green-900/50 rounded-md overflow-hidden bg-[#0a1a0a]">
                        <div className="bg-green-950/30 text-green-400 text-[10px] px-2 py-1 font-mono uppercase tracking-wider border-b border-green-900/50">After</div>
                        <div className="flex-1 overflow-auto p-2">
                          <pre className="text-green-200 font-mono text-[11px] leading-relaxed m-0 w-max pr-4">
                            {stageStates.propose.new_code}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Verify Phase */}
            {stageStates.verify && (
              <div className="flex flex-col gap-3 mt-2">
                <div className="text-[#888888] uppercase tracking-widest text-xs font-semibold mb-1">
                  ── VERIFY ──
                </div>
                
                {stageStates.verify.stub && (
                  <div className="flex items-center gap-2 text-[#22c55e] font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Verification complete
                  </div>
                )}
                
                {!stageStates.verify.stub && (
                  <div className="flex flex-col gap-2">
                    {/* Render completed tests */}
                    {stageStates.verify.tests?.map((test, idx) => {
                      if (!test) return null;
                      
                      return test.passed ? (
                        <div key={idx} className="flex items-center gap-2 text-[#22c55e]">
                          <CheckCircle className="w-4 h-4" />
                          Test {test.test_index + 1} passed
                        </div>
                      ) : (
                        <div key={idx} className="flex flex-col gap-2 border border-red-900/50 bg-red-950/20 p-3 rounded-md">
                          <div className="flex items-center gap-2 text-red-500 font-medium">
                            <XCircle className="w-4 h-4" />
                            Test {test.test_index + 1} failed
                          </div>
                          
                          <div className="text-[11px] font-mono mt-1 space-y-1">
                            <div className="text-gray-400">Input:</div>
                            <div className="text-gray-300 bg-[#111] p-1 rounded">{test.input}</div>
                            
                            <div className="flex gap-2 mt-2">
                              <div className="flex-1">
                                <div className="text-red-400 mb-1">Old Output:</div>
                                <div className="text-red-300 bg-red-950/40 p-1 rounded break-all whitespace-pre-wrap">{test.old_output}</div>
                              </div>
                              <div className="flex-1">
                                <div className="text-green-400 mb-1">New Output:</div>
                                <div className="text-green-300 bg-green-950/40 p-1 rounded break-all whitespace-pre-wrap">{test.new_output}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Render current running test */}
                    {stageStates.verify.status === 'running' && stageStates.verify.current && (
                      <div className="flex items-center gap-2 text-gray-300">
                        <Loader2 className="animate-spin w-4 h-4 text-blue-500" />
                        Verifying test {stageStates.verify.current.index + 1} of {stageStates.verify.current.total}...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Decide Phase */}
            {stageStates.decide && stageStates.decide.status !== 'running' && (
              <div className="flex flex-col gap-3 mt-2">
                <div className="text-[#888888] uppercase tracking-widest text-xs font-semibold mb-1">
                  ── DECIDE ──
                </div>
                
                {stageStates.decide.stub ? (
                  <div className="flex flex-col gap-2 border border-[#22c55e]/50 bg-[#22c55e]/10 p-4 rounded-md">
                    <div className="text-[#22c55e] font-medium">✓ Migration verified — PR would be opened here</div>
                    <div className="text-[#22c55e] font-bold mt-1">🎉 Ready to ship</div>
                  </div>
                ) : stageStates.decide.action === 'pr_opened' ? (
                  <div className="flex flex-col gap-3 border border-[#22c55e]/50 bg-[#22c55e]/10 p-4 rounded-md">
                    <div className="text-[#22c55e] font-medium flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      🎉 Migration verified — PR opened
                    </div>
                    <a 
                      href={stageStates.decide.pr_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1 w-fit"
                    >
                      View Pull Request <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : stageStates.decide.action === 'blocked' ? (
                  <div className="flex flex-col gap-2 border border-red-500/50 bg-red-500/10 p-4 rounded-md">
                    <div className="text-red-400 font-medium flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      ⚠ Migration blocked
                    </div>
                    <div className="text-red-200 text-sm mt-1">
                      {stageStates.decide.reason}
                    </div>
                  </div>
                ) : stageStates.decide.action === 'pr_failed' ? (
                  <div className="flex flex-col gap-3 border border-orange-500/50 bg-orange-500/10 p-4 rounded-md">
                    <div className="text-orange-400 font-medium flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      PR creation failed — diff ready to apply manually
                    </div>
                    <div className="text-orange-200 text-sm">
                      {stageStates.decide.reason}
                    </div>
                    
                    {stageStates.decide.diff && (
                      <div className="mt-2 flex flex-col border border-orange-900/50 rounded-md overflow-hidden bg-[#1a110a]">
                        <div className="bg-orange-950/30 text-orange-400 text-[10px] px-2 py-1 font-mono uppercase tracking-wider border-b border-orange-900/50">Diff</div>
                        <div className="overflow-auto p-2 max-h-[150px]">
                          <pre className="text-gray-300 font-mono text-[11px] leading-relaxed m-0 w-max pr-4">
                            {stageStates.decide.diff}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
            
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MigrationPanel;
