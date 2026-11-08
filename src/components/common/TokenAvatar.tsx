import React from 'react';

interface TokenAvatarProps {
  symbol: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const TokenAvatar: React.FC<TokenAvatarProps> = ({ symbol, logoUrl, size = 'md', className = '' }) => {
  const cleanSymbol = symbol.toUpperCase().trim();

  const sizeClasses = {
    sm: 'w-5 h-5 text-[9px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  }[size];

  if (logoUrl?.startsWith('https://')) {
    return (
      <div className={`${sizeClasses} relative rounded-full overflow-hidden shrink-0 bg-[#1e2024] border border-white/10 shadow-sm ${className}`}>
        <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-white">
          {cleanSymbol.slice(0, 2)}
        </span>
        <img
          src={logoUrl}
          alt={`${symbol} logo`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      </div>
    );
  }

  switch (cleanSymbol) {
    case 'BONK':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#e09843] flex items-center justify-center shadow-sm border border-white/10 ${className}`}>
          {/* Stylized Doge Meme Face */}
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <rect width="32" height="32" rx="16" fill="#F5A623" />
            <ellipse cx="16" cy="18" rx="10" ry="8" fill="#F8E71C" />
            <polygon points="8,10 13,5 15,11" fill="#D08B1C" />
            <polygon points="24,10 19,5 17,11" fill="#D08B1C" />
            <ellipse cx="12" cy="14" rx="2" ry="3" fill="#222" />
            <ellipse cx="20" cy="14" rx="2" ry="3" fill="#222" />
            <circle cx="12.5" cy="13.5" r="0.8" fill="#fff" />
            <circle cx="20.5" cy="13.5" r="0.8" fill="#fff" />
            <polygon points="16,18 14.5,19.5 17.5,19.5" fill="#222" />
            <path d="M 14,21 Q 16,23 18,21" stroke="#222" strokeWidth="1" fill="none" />
          </svg>
        </div>
      );

    case 'PEPE':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#4caf50] flex items-center justify-center shadow-sm border border-white/10 ${className}`}>
          {/* Stylized Pepe Meme Face */}
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <rect width="32" height="32" rx="16" fill="#43A047" />
            <ellipse cx="11" cy="11" rx="4.5" ry="4" fill="#FFFFFF" stroke="#1B5E20" strokeWidth="1" />
            <ellipse cx="21" cy="11" rx="4.5" ry="4" fill="#FFFFFF" stroke="#1B5E20" strokeWidth="1" />
            <ellipse cx="11.5" cy="11" rx="1.8" ry="2" fill="#111" />
            <ellipse cx="21.5" cy="11" rx="1.8" ry="2" fill="#111" />
            <ellipse cx="16" cy="20" rx="9" ry="4" fill="#E53935" />
            <path d="M 8,18 C 12,23 20,23 24,18" stroke="#1B5E20" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      );

    case 'WNC':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#0f172a] border border-[#3b82f6]/40 flex items-center justify-center shadow-sm ${className}`}>
          {/* X Node Monogram */}
          <svg viewBox="0 0 32 32" className="w-full h-full p-1" fill="none">
            <circle cx="16" cy="16" r="14" fill="#0b1329" />
            <path d="M 9,9 L 23,23 M 23,9 L 9,23" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="16" cy="16" r="3" fill="#93C5FD" />
          </svg>
        </div>
      );

    case 'MEOW':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#f1f5f9] border border-white/20 flex items-center justify-center shadow-sm ${className}`}>
          {/* White Cat Face */}
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <rect width="32" height="32" rx="16" fill="#F8FAFC" />
            <polygon points="7,12 11,5 15,11" fill="#F472B6" />
            <polygon points="25,12 21,5 17,11" fill="#F472B6" />
            <circle cx="16" cy="17" r="9" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="0.5" />
            <ellipse cx="12" cy="15" rx="1.5" ry="2" fill="#0EA5E9" />
            <ellipse cx="20" cy="15" rx="1.5" ry="2" fill="#0EA5E9" />
            <polygon points="16,18 14.5,19.5 17.5,19.5" fill="#EC4899" />
            <line x1="6" y1="18" x2="12" y2="19" stroke="#94A3B8" strokeWidth="0.8" />
            <line x1="26" y1="18" x2="20" y2="19" stroke="#94A3B8" strokeWidth="0.8" />
          </svg>
        </div>
      );

    case 'RAY':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#1e293b] border border-cyan-500/30 flex items-center justify-center shadow-sm ${className}`}>
          {/* Rocket Icon */}
          <svg viewBox="0 0 32 32" className="w-full h-full p-1.5" fill="none">
            <path d="M 16,5 C 21,9 22,17 19,23 L 13,23 C 10,17 11,9 16,5 Z" fill="#38BDF8" />
            <circle cx="16" cy="13" r="2.5" fill="#0F172A" />
            <path d="M 12,23 L 10,27 L 13,26 Z" fill="#F97316" />
            <path d="M 20,23 L 22,27 L 19,26 Z" fill="#F97316" />
            <polygon points="16,23 14,28 18,28" fill="#EF4444" />
          </svg>
        </div>
      );

    case 'SHIBAI':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#ea580c] border border-white/10 flex items-center justify-center shadow-sm ${className}`}>
          {/* Shiba Face */}
          <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
            <rect width="32" height="32" rx="16" fill="#F97316" />
            <polygon points="8,10 12,5 15,11" fill="#C2410C" />
            <polygon points="24,10 20,5 17,11" fill="#C2410C" />
            <ellipse cx="16" cy="18" rx="8" ry="7" fill="#FED7AA" />
            <circle cx="12" cy="15" r="1.5" fill="#1E293B" />
            <circle cx="20" cy="15" r="1.5" fill="#1E293B" />
            <polygon points="16,18 14.5,19.5 17.5,19.5" fill="#1E293B" />
          </svg>
        </div>
      );

    case 'FIRE':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#7c2d12] border border-orange-500/30 flex items-center justify-center shadow-sm ${className}`}>
          {/* Flame */}
          <svg viewBox="0 0 32 32" className="w-full h-full p-1.5" fill="none">
            <path d="M 16,4 C 18,10 24,14 24,20 C 24,25 20,28 16,28 C 12,28 8,25 8,20 C 8,14 14,10 16,4 Z" fill="#F97316" />
            <path d="M 16,13 C 17,16 20,18 20,21 C 20,24 18,26 16,26 C 14,26 12,24 12,21 C 12,18 15,16 16,13 Z" fill="#FDE047" />
          </svg>
        </div>
      );

    case 'GEM':
      return (
        <div className={`${sizeClasses} rounded-full overflow-hidden shrink-0 bg-[#0c4a6e] border border-cyan-400/30 flex items-center justify-center shadow-sm ${className}`}>
          {/* Diamond */}
          <svg viewBox="0 0 32 32" className="w-full h-full p-1.5" fill="none">
            <polygon points="16,6 26,13 16,26 6,13" fill="#38BDF8" stroke="#E0F2FE" strokeWidth="1" />
            <polygon points="16,6 26,13 20,13 16,6" fill="#7DD3FC" opacity="0.6" />
            <polygon points="16,6 6,13 12,13 16,6" fill="#0284C7" opacity="0.6" />
            <polygon points="12,13 20,13 16,26" fill="#0369A1" opacity="0.8" />
          </svg>
        </div>
      );

    default:
      return (
        <div className={`${sizeClasses} rounded-full bg-[#1e2024] border border-white/10 flex items-center justify-center font-mono font-bold text-white shrink-0 ${className}`}>
          {cleanSymbol.slice(0, 2)}
        </div>
      );
  }
};
