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

  if (!selectedNode) {
    return (
      <div className="fixed right-0 top-0 w-[440px] h-screen bg-[#0a0a0a] border-l border-[#1f2937] z-10 flex flex-col items-center justify-center p-8 text-center animate-slide-in">
        <div className="text-[48px] mb-4">⚡</div>
        <h2 className="text-white text-[18px] font-bold mb-2">Select a function</h2>
        <p className="text-[#6b7280] text-[14px] max-w-[280px] leading-relaxed">
          Click any node in the graph to inspect it and migrate it safely using AI.
        </p>
      </div>
    );
  }

  const isSuccess = stageStates.decide && (stageStates.decide.stub || stageStates.decide.action === 'pr_opened');

  return (
    <div 
      className="fixed right-0 top-0 w-[440px] h-screen bg-[#111111] border-l border-[#222222] z-10 flex flex-col shadow-2xl animate-slide-in overflow-hidden relative"
    >
      {/* Confetti Animation */}
      {isSuccess && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i} 
              className="confetti-piece"
              style={{
                left: `${15 + i * 15}%`,
                backgroundColor: ['#ef4444', '#3b82f6', '#22c55e', '#eab308'][i % 4],
                animationDelay: `${i * 0.1}s`
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex-none p-6 border-b border-[#1f2937] flex justify-between items-start bg-[#0f172a]">
        <div className="min-w-0 pr-4">
          <h2 className="text-white text-[20px] font-bold truncate" title={selectedNode.data?.label || selectedNode.id}>
            {selectedNode.data?.label || selectedNode.id.split(':').pop()}
          </h2>
          <p className="text-[#6b7280] text-[12px] break-all mb-4 leading-tight">
            {selectedNode.data?.file || selectedNode.id.split(':')[0]}
          </p>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors flex-shrink-0 mt-1"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#111111] flex flex-col">
        {!isMigrating ? (
          <button
            onClick={handleMigrate}
            className="w-full text-white font-semibold text-[15px] h-[44px] rounded-[8px] transition-all flex items-center justify-center mt-2 mb-4 hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)'
            }}
          >
            Migrate this function
          </button>
        ) : (
          <div className="flex flex-col gap-6 text-sm">
            <button
              disabled
              className="w-full text-white font-semibold text-[15px] h-[44px] rounded-[8px] flex items-center justify-center mt-2 mb-4 opacity-60 cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)'
              }}
            >
              <Loader2 className="animate-spin w-4 h-4 mr-2" />
              Migrating...
            </button>
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
                <div className="flex items-center gap-2 text-[#374151] text-[11px] tracking-[0.15em] uppercase font-bold mb-1">
                  <div className="h-px bg-[#374151] flex-1"></div>
                  PROPOSE
                  <div className="h-px bg-[#374151] flex-1"></div>
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
                    <div className="flex items-center gap-2 text-[#22c55e] text-[14px] font-semibold">
                      <CheckCircle className="w-4 h-4" />
                      Proposal ready
                    </div>
                    
                    <div className="flex gap-2 w-full">
                      {/* Before */}
                      <div className="flex-1 flex flex-col min-w-0 border border-[#7f1d1d] rounded-md overflow-hidden bg-[#1a0505]">
                        <div className="bg-[#7f1d1d]/30 text-red-400 text-[10px] px-2 py-1 font-mono uppercase tracking-wide border-b border-[#7f1d1d]">BEFORE</div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 max-h-[160px] overflow-x-auto">
                          <pre className="text-[#e2e8f0] font-mono text-[11px] whitespace-pre m-0 w-max pr-4">
                            {stageStates.propose.old_code}
                          </pre>
                        </div>
                      </div>
                      
                      {/* After */}
                      <div className="flex-1 flex flex-col min-w-0 border border-[#14532d] rounded-md overflow-hidden bg-[#052e16]">
                        <div className="bg-[#14532d]/40 text-green-400 text-[10px] px-2 py-1 font-mono uppercase tracking-wide border-b border-[#14532d]">AFTER</div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 max-h-[160px] overflow-x-auto">
                          <pre className="text-[#e2e8f0] font-mono text-[11px] whitespace-pre m-0 w-max pr-4">
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
                <div className="flex items-center gap-2 text-[#374151] text-[11px] tracking-[0.15em] uppercase font-bold mb-1">
                  <div className="h-px bg-[#374151] flex-1"></div>
                  VERIFY
                  <div className="h-px bg-[#374151] flex-1"></div>
                </div>
                
                {stageStates.verify.stub && (
                  <div className="flex items-center gap-2 text-[#22c55e] font-medium text-[14px]">
                    <CheckCircle className="w-5 h-5 fill-[#22c55e] text-black" />
                    Verification complete
                  </div>
                )}
                
                {!stageStates.verify.stub && (
                  <div className="flex flex-col gap-2">
                    {/* Render completed tests */}
                    {stageStates.verify.tests?.map((test, idx) => {
                      if (!test) return null;
                      
                      let verifyMessage = "Test " + (test.test_index + 1) + (test.passed ? " passed" : " failed");
                      let outcomeClass = test.passed ? "text-[#22c55e]" : "text-red-500 font-medium";
                      
                      if (test.outcome === 'matched_success') {
                        verifyMessage = "✓ Output matched";
                      } else if (test.outcome === 'matched_exception') {
                        verifyMessage = "✓ Exception matched";
                      } else if (test.outcome === 'mismatch') {
                        verifyMessage = "✗ Output mismatch";
                        outcomeClass = "text-[#ef4444] font-medium";
                      }
                      
                      return test.passed ? (
                        <div key={idx} className={`flex items-center gap-2 ${outcomeClass}`}>
                          <CheckCircle className="w-4 h-4" />
                          {verifyMessage}
                        </div>
                      ) : (
                        <div key={idx} className="flex flex-col gap-2 border border-red-900/50 bg-red-950/20 p-3 rounded-md">
                          <div className={`flex items-center gap-2 ${outcomeClass}`}>
                            <XCircle className="w-4 h-4" />
                            {verifyMessage}
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
                <div className="flex items-center gap-2 text-[#374151] text-[11px] tracking-[0.15em] uppercase font-bold mb-1">
                  <div className="h-px bg-[#374151] flex-1"></div>
                  DECIDE
                  <div className="h-px bg-[#374151] flex-1"></div>
                </div>
                
                {stageStates.decide.stub ? (
                  <div className="flex flex-col border border-[#16a34a] bg-[#052e16] p-4 rounded-[8px] w-full mt-2">
                    <div className="text-white text-[16px] font-bold mb-1">🎉 Migration Verified</div>
                    <div className="text-[#a7f3d0] text-[14px]">PR would be opened here</div>
                    <div className="text-[#22c55e] text-[14px] font-medium mt-3">Ready to ship →</div>
                  </div>
                ) : stageStates.decide.action === 'pr_opened' ? (
                  <div className="flex flex-col border border-[#16a34a] bg-[#052e16] p-4 rounded-[8px] w-full mt-2">
                    <div className="text-white text-[16px] font-bold mb-1">🎉 Migration Verified</div>
                    <a 
                      href={stageStates.decide.pr_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[#60a5fa] hover:text-[#93c5fd] underline flex items-center gap-1 w-fit text-[14px]"
                    >
                      {stageStates.decide.pr_url} <ExternalLink className="w-3 h-3" />
                    </a>
                    <div className="text-[#22c55e] text-[14px] font-medium mt-3">Ready to ship →</div>
                  </div>
                ) : stageStates.decide.action === 'blocked' ? (
                  <div className="flex flex-col gap-2 border border-[#d97706] bg-[#1c1400] p-4 rounded-[8px] w-full mt-2">
                    <div className="text-[#fbbf24] font-bold flex items-center gap-2 text-[16px]">
                      ⚠ Migration Blocked
                    </div>
                    <div className="text-[#9ca3af] text-[14px] mt-1">
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
