import React, { useState } from 'react';
import { Copy, Check, Search, ChevronRight, ChevronDown } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  title?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, title = 'Event Payload' }) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedKeys, setCollapsedKeys] = useState<Record<string, boolean>>({});

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleCollapse = (path: string) => {
    setCollapsedKeys((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  // Render tree node
  const renderValue = (val: any, path: string, depth = 0): React.ReactNode => {
    if (val === null) return <span className="text-[#8e8e93]">null</span>;
    if (typeof val === 'boolean') return <span className="text-amber-400 font-semibold">{String(val)}</span>;
    if (typeof val === 'number') return <span className="text-blue-400 tabular-nums">{val}</span>;
    if (typeof val === 'string') {
      const isSearchMatch = searchQuery && val.toLowerCase().includes(searchQuery.toLowerCase());
      return (
        <span className={isSearchMatch ? 'bg-amber-500/30 text-emerald-300 px-0.5 rounded' : 'text-emerald-400'}>
          "{val}"
        </span>
      );
    }

    if (Array.isArray(val)) {
      const isCollapsed = collapsedKeys[path];
      if (val.length === 0) return <span className="text-[#8e8e93]">[]</span>;

      return (
        <span>
          <button
            onClick={() => toggleCollapse(path)}
            className="inline-flex items-center text-[#737373] hover:text-white mr-1 align-middle"
          >
            {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <span className="text-[#8e8e93]">[</span>
          {isCollapsed ? (
            <span
              onClick={() => toggleCollapse(path)}
              className="text-[11px] text-[#737373] px-1 cursor-pointer hover:text-[#a3a3a3]"
            >
              {val.length} items...
            </span>
          ) : (
            <div className="pl-4 border-l border-[#222] my-0.5 space-y-0.5">
              {val.map((item, idx) => (
                <div key={idx}>
                  <span className="text-[#525252] mr-1">{idx}:</span>
                  {renderValue(item, `${path}[${idx}]`, depth + 1)}
                </div>
              ))}
            </div>
          )}
          <span className="text-[#8e8e93]">]</span>
        </span>
      );
    }

    if (typeof val === 'object') {
      const isCollapsed = collapsedKeys[path];
      const keys = Object.keys(val);
      if (keys.length === 0) return <span className="text-[#8e8e93]">{'{}'}</span>;

      return (
        <span>
          <button
            onClick={() => toggleCollapse(path)}
            className="inline-flex items-center text-[#737373] hover:text-white mr-1 align-middle"
          >
            {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <span className="text-[#8e8e93]">{'{'}</span>
          {isCollapsed ? (
            <span
              onClick={() => toggleCollapse(path)}
              className="text-[11px] text-[#737373] px-1 cursor-pointer hover:text-[#a3a3a3]"
            >
              {keys.length} keys...
            </span>
          ) : (
            <div className="pl-4 border-l border-[#222] my-0.5 space-y-0.5">
              {keys.map((k) => {
                const isKeyMatch = searchQuery && k.toLowerCase().includes(searchQuery.toLowerCase());
                return (
                  <div key={k} className="leading-relaxed">
                    <span
                      className={`text-[#d4d4d8] font-medium mr-1.5 ${
                        isKeyMatch ? 'bg-amber-500/30 text-white px-0.5 rounded' : ''
                      }`}
                    >
                      "{k}":
                    </span>
                    {renderValue(val[k], `${path}.${k}`, depth + 1)}
                  </div>
                );
              })}
            </div>
          )}
          <span className="text-[#8e8e93]">{'}'}</span>
        </span>
      );
    }

    return <span>{String(val)}</span>;
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-full font-mono text-xs shadow-lg">
      {/* Inspector Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.08] select-none shrink-0 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-white uppercase tracking-wider">{title}</span>
          <span className="text-[10px] text-[#737373]">RAW JSON</span>
        </div>

        <div className="flex items-center gap-2">
          {/* In-JSON Search */}
          <div className="relative">
            <Search className="w-3 h-3 text-[#737373] absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find key/value..."
              className="glass-panel-subtle rounded-lg pl-6 pr-2 py-1 text-[11px] text-white placeholder-[#525252] focus:outline-none focus:border-white/20 w-32"
            />
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            title="Copy Raw JSON"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-icon text-[11px] text-[#a3a3a3] hover:text-white transition-all"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Interactive JSON viewer body */}
      <div className="p-4 overflow-auto flex-1 font-mono text-[11px] leading-relaxed max-h-[550px]">
        {renderValue(data, 'root')}
      </div>
    </div>
  );
};
