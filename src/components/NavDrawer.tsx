import { useState } from 'react';
import { Player } from '../types/chess';
import SocialSidebar from './SocialSidebar';
import {
  Menu,
  X,
  Users,
  BarChart2,
  Layers,
  Bot,
  Trophy,
  Puzzle,
  Shield,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NavDrawerProps {
  player: Player;
  profileId: string;
  onViewProfile: (username: string) => void;
  onSelectOfflineDual: () => void;
  onOpenAdmin?: () => void;
}

export default function NavDrawer({
  player,
  profileId,
  onViewProfile,
  onSelectOfflineDual,
  onOpenAdmin
}: NavDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'social' | 'stats' | null>(null);

  const toggleDrawer = () => setIsOpen(!isOpen);

  const handleNavClick = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <>
      {/* 3-Line Hamburger Trigger Button */}
      <button
        onClick={toggleDrawer}
        className="flex items-center gap-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-violet-500/50 rounded-xl px-3.5 py-2.5 transition-all duration-200 text-slate-200 hover:text-white shadow-lg active:scale-95 group"
        title="Open Navigation Menu"
      >
        <Menu size={20} className="text-violet-400 group-hover:scale-110 transition-transform" />
        <span className="text-xs font-bold hidden sm:inline">Menu</span>
      </button>

      {/* Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] transition-opacity duration-300"
        />
      )}

      {/* Slide-over Drawer Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-slate-900/95 border-l border-slate-800/80 shadow-2xl backdrop-blur-2xl z-[9999] flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
          <div
            onClick={() => handleNavClick(() => onViewProfile(player.username))}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white uppercase shadow-md shadow-violet-600/20">
              {player.username.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-bold text-white group-hover:text-violet-400 transition-colors">
                @{player.username}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Elo: {player.rating || 1200}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Menu Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
          
          {/* 1. Social & Friends */}
          <button
            onClick={() => {
              setIsOpen(false);
              setActiveModal('social');
            }}
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/60 text-slate-200 hover:text-white transition-all group border border-transparent hover:border-slate-750"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-600/10 text-violet-400 flex items-center justify-center group-hover:bg-violet-600/20">
                <Users size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Social & Friends</div>
                <div className="text-[10px] text-slate-500">Players, search & direct chat</div>
              </div>
            </div>
            <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-300 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* 2. Stats */}
          <button
            onClick={() => {
              setIsOpen(false);
              setActiveModal('stats');
            }}
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/60 text-slate-200 hover:text-white transition-all group border border-transparent hover:border-slate-750"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-600/10 text-cyan-400 flex items-center justify-center group-hover:bg-cyan-600/20">
                <BarChart2 size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Player Stats</div>
                <div className="text-[10px] text-slate-500">Ratings & match history</div>
              </div>
            </div>
            <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-300 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* 3. Analysis / Offline Dual */}
          <button
            onClick={() => handleNavClick(onSelectOfflineDual)}
            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/60 text-slate-200 hover:text-white transition-all group border border-transparent hover:border-slate-750"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-600/20">
                <Layers size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Analysis (Offline Dual)</div>
                <div className="text-[10px] text-slate-500">2 Players on 1 screen offline</div>
              </div>
            </div>
            <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-300 transition-transform group-hover:translate-x-0.5" />
          </button>

          <div className="py-2">
            <div className="h-px bg-slate-800/80 my-1" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 px-3">Future Additions</span>
          </div>

          {/* 4. Bots */}
          <div className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-850/40 text-slate-400 opacity-80 cursor-not-allowed">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center">
                <Bot size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-300">Bots (AI Engine)</div>
                <div className="text-[10px] text-slate-500">Play vs Stockfish levels</div>
              </div>
            </div>
            <span className="text-[9px] font-bold bg-violet-600/20 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full">
              Soon
            </span>
          </div>

          {/* 5. Leaderboard */}
          <div className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-850/40 text-slate-400 opacity-80 cursor-not-allowed">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center">
                <Trophy size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-300">Leaderboard</div>
                <div className="text-[10px] text-slate-500">Global player rankings</div>
              </div>
            </div>
            <span className="text-[9px] font-bold bg-amber-600/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              Soon
            </span>
          </div>

          {/* 6. Puzzles */}
          <div className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-850/40 text-slate-400 opacity-80 cursor-not-allowed">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center">
                <Puzzle size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-300">Puzzles & Tactics</div>
                <div className="text-[10px] text-slate-500">Daily mate challenges</div>
              </div>
            </div>
            <span className="text-[9px] font-bold bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">
              Soon
            </span>
          </div>

          {onOpenAdmin && (
            <>
              <div className="h-px bg-slate-800/80 my-2" />
              <button
                onClick={() => handleNavClick(onOpenAdmin)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-violet-600/10 border border-transparent hover:border-violet-500/30 text-violet-400 transition-all text-xs font-bold"
              >
                <Shield size={18} />
                <span>Admin Suite</span>
              </button>
            </>
          )}

        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-rose-600/20 hover:border-rose-500/30 text-slate-300 hover:text-rose-300 border border-slate-750 rounded-xl text-xs font-bold transition-all"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Social Modal Overlay */}
      {activeModal === 'social' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[600px] max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                <h2 className="text-base font-bold text-white">Social & Friends</h2>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <SocialSidebar
                currentProfileId={profileId}
                onViewProfile={(uname) => {
                  setActiveModal(null);
                  onViewProfile(uname);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal Overlay */}
      {activeModal === 'stats' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-center">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X size={18} />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto mb-4">
              <BarChart2 size={28} />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">@{player.username} Stats</h2>
            <p className="text-slate-400 text-xs mb-6">Performance summary and active rating</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xs text-slate-500 mb-0.5">Rating (Elo)</div>
                <div className="text-lg font-black text-white">{player.rating || 1200}</div>
              </div>
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xs text-slate-500 mb-0.5">Status</div>
                <div className="text-lg font-bold text-emerald-400 uppercase text-xs mt-1">Active</div>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveModal(null);
                onViewProfile(player.username);
              }}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg"
            >
              View Full Profile
            </button>
          </div>
        </div>
      )}
    </>
  );
}
