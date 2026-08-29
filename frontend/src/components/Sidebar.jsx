import React, { useMemo, useState } from 'react';

const sectionLabel = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '10px',
};

const statRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '9px 0',
  borderBottom: '1px solid var(--line-soft)',
  fontSize: '13px',
  color: 'var(--text-secondary)',
};

function Sidebar({
  repoUrl,
  setRepoUrl,
  onAnalyze,
  nodes,
  edges,
  analyzing,
  onNodeSelect,
  selectedNode,
  visibleCount,
}) {
  const [collapsedFolders, setCollapsedFolders] = useState({});

  const filesByFolder = useMemo(() => {
    const map = {};
    nodes.forEach((node) => {
      const file = node.file || 'unknown';
      const parts = file.split('/');
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      const fileName = parts[parts.length - 1];
      if (!map[folder]) map[folder] = [];
      map[folder].push({ ...node, fileName });
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name))
    );
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [nodes]);

  const toggleFolder = (file) => {
    setCollapsedFolders((prev) => ({ ...prev, [file]: !prev[file] }));
  };

  return (
    <aside
      className="hide-scrollbar"
      style={{
        width: '300px',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--line)',
        padding: '28px 22px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: 'var(--ember)',
            boxShadow: '0 0 12px var(--ember)',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '17px',
            color: 'var(--text-primary)',
          }}
        >
          Ripple
        </span>
      </div>

      {/* Repository */}
      <section>
        <div style={sectionLabel}>Repository</div>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/pallets/click"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '10px 12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12.5px',
            color: 'var(--text-secondary)',
            outline: 'none',
            marginBottom: '10px',
          }}
        />
        <button
          onClick={() => onAnalyze(repoUrl)}
          disabled={analyzing}
          style={{
            width: '100%',
            background: analyzing ? '#cc5530' : 'var(--ember)',
            color: '#1a0a03',
            fontWeight: 600,
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '13px',
            border: 'none',
            borderRadius: '8px',
            padding: '11px',
            cursor: analyzing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {analyzing && (
            <span
              style={{
                width: '14px',
                height: '14px',
                border: '2px solid #1a0a03',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }}
            />
          )}
          {analyzing ? 'Analyzing...' : 'Analyze'}
        </button>
      </section>

      {/* Graph Stats */}
      <section>
        <div style={sectionLabel}>Graph Stats</div>
        <div style={statRow}>
          <span>Nodes</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {nodes.length}
          </span>
        </div>
        <div style={statRow}>
          <span>Edges</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {edges.length.toLocaleString()}
          </span>
        </div>
        <div style={{ ...statRow, borderBottom: 'none' }}>
          <span>Visible</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {visibleCount}
          </span>
        </div>
      </section>

      {/* Legend */}
      <section>
        <div style={sectionLabel}>Legend</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { color: '#ff6a3d', border: 'none', label: 'Selected origin' },
            { color: '#ff8c5f', border: 'none', label: 'Direct dependent' },
            { color: '#cf7a58', border: 'none', label: 'Indirect (2+ hops)' },
            { color: 'var(--bg-panel)', border: '1px solid var(--line)', label: 'Unexplored' },
          ].map(({ color, border, label }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '3px',
                  background: color,
                  border: border || 'none',
                  flexShrink: 0,
                }}
              />
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* File Tree */}
      {nodes.length > 0 && (
        <section style={{ flex: 1, minHeight: 0 }}>
          <div style={sectionLabel}>Files</div>
          <div
            className="custom-scrollbar"
            style={{ overflowY: 'auto', maxHeight: '280px' }}
          >
            {filesByFolder.map(([folder, fileNodes]) => {
              const isCollapsed = collapsedFolders[folder];
              return (
                <div key={folder} style={{ marginBottom: '4px' }}>
                  <button
                    onClick={() => toggleFolder(folder)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 0',
                      color: 'var(--text-secondary)',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11.5px',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {isCollapsed ? '▸' : '▾'}
                    </span>
                    {folder}/
                  </button>
                  {!isCollapsed &&
                    fileNodes.map((node) => {
                      const isActive = selectedNode?.id === node.id;
                      return (
                        <button
                          key={node.id}
                          onClick={() => onNodeSelect(node)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: isActive ? 'var(--ember-soft)' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '5px 8px 5px 18px',
                            borderRadius: '4px',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '12px',
                            color: isActive ? 'var(--ember)' : 'var(--text-secondary)',
                          }}
                        >
                          {node.fileName} : {node.name}
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}

export default Sidebar;
