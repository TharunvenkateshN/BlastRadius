import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();
  const [dots, setDots] = useState([]);

  useEffect(() => {
    // Generate random background dots
    const newDots = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animationDuration: `${Math.random() * 10 + 10}s`,
      animationDelay: `${Math.random() * 5}s`,
    }));
    setDots(newDots);
  }, []);

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] font-sans flex flex-col text-white overflow-x-hidden">
      {/* Hero Section */}
      <div 
        className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden flex-none"
        style={{
          background: 'radial-gradient(circle at center, #111827 0%, #0a0a0a 100%)'
        }}
      >
        {/* Animated Background Dots */}
        {dots.map(dot => (
          <div
            key={dot.id}
            className="absolute w-2 h-2 rounded-full bg-blue-500/20 blur-[1px]"
            style={{
              left: dot.left,
              top: dot.top,
              animation: `float-particle ${dot.animationDuration} infinite ease-in-out alternate`,
              animationDelay: dot.animationDelay
            }}
          />
        ))}

        <div className="relative z-10 flex flex-col items-center text-center px-6">
          <h1 className="text-[72px] font-extrabold text-white leading-tight tracking-tight mb-6">
            Ripple
          </h1>
          <p className="text-[22px] text-[#9ca3af] max-w-[600px] leading-relaxed mb-12">
            Understand the true impact of every code change — before you make it.
          </p>
          <button
            onClick={() => navigate('/app')}
            className="bg-[#3b82f6] text-white px-10 py-4 rounded-[12px] text-[18px] font-bold transition-all duration-300"
            style={{
              boxShadow: '0 0 30px rgba(59,130,246,0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 50px rgba(59,130,246,0.7)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 30px rgba(59,130,246,0.4)';
            }}
          >
            Analyze a Repository →
          </button>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="w-full bg-[#0d0d0d] py-[80px] flex flex-col items-center flex-none">
        <h2 className="text-[36px] font-bold text-white mb-16 text-center">How It Works</h2>
        
        <div className="flex flex-row justify-center gap-[32px] flex-wrap px-6 max-w-7xl">
          {/* Card 1 */}
          <div className="bg-[#161616] border border-[#222] rounded-[16px] p-[32px] w-[300px] flex flex-col items-center text-center">
            <svg className="w-[48px] h-[48px] text-[#3b82f6] mb-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <h3 className="text-white text-[18px] font-semibold mb-[8px]">Paste any GitHub repo URL</h3>
            <p className="text-[#6b7280] text-[14px] leading-[1.6]">
              Ripple clones and parses the entire codebase using static analysis — no setup, no tokens needed.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-[#161616] border border-[#222] rounded-[16px] p-[32px] w-[300px] flex flex-col items-center text-center">
            <svg className="w-[48px] h-[48px] text-[#3b82f6] mb-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-white text-[18px] font-semibold mb-[8px]">Click any function to see its blast radius</h3>
            <p className="text-[#6b7280] text-[14px] leading-[1.6]">
              Instantly see every function affected by a change — cascading outward hop by hop across the entire dependency graph.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-[#161616] border border-[#222] rounded-[16px] p-[32px] w-[300px] flex flex-col items-center text-center">
            <svg className="w-[48px] h-[48px] text-[#3b82f6] mb-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="text-white text-[18px] font-semibold mb-[8px]">Migrate safely with AI verification</h3>
            <p className="text-[#6b7280] text-[14px] leading-[1.6]">
              Our AI agent proposes a refactored version, verifies behavior is identical using automated tests, then opens a PR.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full bg-[#0a0a0a] py-[32px] text-center flex-none">
        <p className="text-[#4b5563] text-sm">Built at BuildSprint 2026 &middot; LatentForce.ai</p>
      </footer>
    </div>
  );
};

export default Landing;