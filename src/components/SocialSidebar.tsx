import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  X, Send, UserPlus, Users, MessageSquare,
  Check, Minus, ChevronDown, Loader2
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialProfile {
  id: string;
  username: string;
  full_name: string | null;
}

interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  sender?: SocialProfile;
  receiver?: SocialProfile;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
}

interface SocialSidebarProps {
  currentProfileId: string;   // auth UUID from profiles table
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialSidebar({ currentProfileId }: SocialSidebarProps) {
  const [tab, setTab] = useState<'players' | 'friends'>('players');

  // All players (excluding self)
  const [allPlayers, setAllPlayers] = useState<SocialProfile[]>([]);
  // My sent/received requests
  const [myRequests, setMyRequests] = useState<FriendRequest[]>([]);
  // Incoming pending
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  // Accepted friends
  const [friends, setFriends] = useState<SocialProfile[]>([]);

  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFriend, setChatFriend] = useState<SocialProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load players ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingPlayers(true);

    supabase
      .from('profiles')
      .select('id, username, full_name')
      .neq('id', currentProfileId)
      .order('username')
      .then(({ data }) => {
        if (!cancelled) setAllPlayers(data ?? []);
        setLoadingPlayers(false);
      });

    return () => { cancelled = true; };
  }, [currentProfileId]);

  // ── Load friend requests + friends ─────────────────────────────────────────
  const loadFriends = async () => {
    setLoadingFriends(true);
    try {
      // All requests involving me
      const { data: requests } = await supabase
        .from('friend_requests')
        .select(`
          id, sender_id, receiver_id, status,
          sender:profiles!friend_requests_sender_id_fkey(id, username, full_name),
          receiver:profiles!friend_requests_receiver_id_fkey(id, username, full_name)
        `)
        .or(`sender_id.eq.${currentProfileId},receiver_id.eq.${currentProfileId}`);

      const all: FriendRequest[] = (requests ?? []).map((r: any) => ({
        ...r,
        sender: Array.isArray(r.sender) ? r.sender[0] : r.sender,
        receiver: Array.isArray(r.receiver) ? r.receiver[0] : r.receiver,
      }));

      setMyRequests(all);

      setIncomingRequests(
        all.filter(r => r.receiver_id === currentProfileId && r.status === 'pending')
      );

      const accepted = all.filter(r => r.status === 'accepted');
      const friendProfiles: SocialProfile[] = accepted.map(r =>
        r.sender_id === currentProfileId ? (r.receiver as SocialProfile) : (r.sender as SocialProfile)
      ).filter(Boolean);
      setFriends(friendProfiles);
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => { loadFriends(); }, [currentProfileId]);

  // ── Realtime: watch friend_requests ────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`friend-requests:${currentProfileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'friend_requests',
      }, () => loadFriends())
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [currentProfileId]);

  // ── Friendship helpers ──────────────────────────────────────────────────────
  function getRelationship(otherId: string): 'none' | 'pending_sent' | 'pending_recv' | 'accepted' {
    const req = myRequests.find(r =>
      (r.sender_id === currentProfileId && r.receiver_id === otherId) ||
      (r.receiver_id === currentProfileId && r.sender_id === otherId)
    );
    if (!req) return 'none';
    if (req.status === 'accepted') return 'accepted';
    if (req.sender_id === currentProfileId) return 'pending_sent';
    return 'pending_recv';
  }

  const sendFriendRequest = async (receiverId: string) => {
    await supabase.from('friend_requests').insert({
      sender_id: currentProfileId,
      receiver_id: receiverId,
      status: 'pending',
    });
    await loadFriends();
  };

  const respondToRequest = async (requestId: string, accept: boolean) => {
    await supabase
      .from('friend_requests')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', requestId);
    await loadFriends();
  };

  // ── Open chat with a friend ─────────────────────────────────────────────────
  const openChat = async (friend: SocialProfile) => {
    setChatFriend(friend);
    setChatOpen(true);
    setMessages([]);

    // Load history
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentProfileId},receiver_id.eq.${friend.id}),` +
        `and(sender_id.eq.${friend.id},receiver_id.eq.${currentProfileId})`
      )
      .order('created_at', { ascending: true })
      .limit(100);

    setMessages(data ?? []);

    // Tear down old channel
    if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current);

    // Subscribe to new messages between the two users
    chatChannelRef.current = supabase
      .channel(`chat:${[currentProfileId, friend.id].sort().join('-')}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, (payload) => {
        const msg = payload.new as Message;
        const relevant =
          (msg.sender_id === currentProfileId && msg.receiver_id === friend.id) ||
          (msg.sender_id === friend.id && msg.receiver_id === currentProfileId);
        if (relevant) setMessages(prev => [...prev, msg]);
      })
      .subscribe();
  };

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup chat channel on close
  const closeChat = () => {
    setChatOpen(false);
    setChatFriend(null);
    setMessages([]);
    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }
  };

  const sendMessage = async () => {
    if (!msgInput.trim() || !chatFriend || sendingMsg) return;
    setSendingMsg(true);
    const body = msgInput.trim();
    setMsgInput('');
    await supabase.from('messages').insert({
      sender_id: currentProfileId,
      receiver_id: chatFriend.id,
      body,
    });
    setSendingMsg(false);
  };

  const handleMsgKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Sidebar panel ── */}
      <aside className="
        hidden lg:flex flex-col
        w-72 shrink-0
        bg-slate-950/80 border-l border-slate-800 backdrop-blur-lg
        h-screen sticky top-0 overflow-hidden
      ">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase mb-3">
            Social
          </p>
          {/* Tab toggle */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 gap-0.5">
            {(['players', 'friends'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`
                  flex-1 py-1.5 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase
                  transition-all duration-150
                  ${tab === t
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                    : 'text-slate-500 hover:text-slate-300'}
                `}
              >
                {t === 'players' ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Users size={11} /> All Players
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5 relative">
                    <Users size={11} /> Friends
                    {incomingRequests.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full
                        text-[8px] flex items-center justify-center text-white font-bold
                        shadow-[0_0_6px_rgba(244,63,94,0.8)]">
                        {incomingRequests.length}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── ALL PLAYERS tab ── */}
        {tab === 'players' && (
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800">
            {loadingPlayers ? (
              <div className="flex justify-center pt-10">
                <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
              </div>
            ) : allPlayers.length === 0 ? (
              <p className="text-center text-slate-600 font-mono text-xs pt-10">No other players yet.</p>
            ) : (
              <ul className="divide-y divide-slate-800/50">
                {allPlayers.map(p => {
                  const rel = getRelationship(p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-900/40 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{p.username}</p>
                        {p.full_name && (
                          <p className="text-[10px] text-slate-600 font-mono truncate">{p.full_name}</p>
                        )}
                      </div>

                      {rel === 'none' && (
                        <button
                          onClick={() => sendFriendRequest(p.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md shrink-0 ml-2
                            text-[10px] font-mono font-bold text-cyan-400 border border-cyan-500/30
                            bg-cyan-500/5 hover:bg-cyan-500/20 hover:border-cyan-400/60
                            shadow-[0_0_6px_rgba(6,182,212,0.1)] hover:shadow-[0_0_12px_rgba(6,182,212,0.2)]
                            transition-all duration-150"
                        >
                          <UserPlus size={10} /> ADD
                        </button>
                      )}
                      {rel === 'pending_sent' && (
                        <span className="text-[10px] font-mono text-slate-600 ml-2 shrink-0">SENT</span>
                      )}
                      {rel === 'pending_recv' && (
                        <span className="text-[10px] font-mono text-amber-500 ml-2 shrink-0 animate-pulse">PENDING</span>
                      )}
                      {rel === 'accepted' && (
                        <button
                          onClick={() => openChat(p)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md shrink-0 ml-2
                            text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/30
                            bg-emerald-500/5 hover:bg-emerald-500/20
                            transition-all duration-150"
                        >
                          <MessageSquare size={10} /> CHAT
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ── FRIENDS tab ── */}
        {tab === 'friends' && (
          <div className="flex-1 overflow-y-auto">
            {loadingFriends ? (
              <div className="flex justify-center pt-10">
                <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
              </div>
            ) : (
              <>
                {/* Incoming requests */}
                {incomingRequests.length > 0 && (
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-widest mb-2">
                      Incoming Requests
                    </p>
                    <ul className="space-y-2">
                      {incomingRequests.map(req => (
                        <li key={req.id}
                          className="bg-rose-950/20 border border-rose-500/20 rounded-lg px-3 py-2.5">
                          <p className="text-sm font-semibold text-slate-200 mb-2">
                            {req.sender?.username ?? '—'}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => respondToRequest(req.id, true)}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md
                                text-[10px] font-mono font-bold text-emerald-400
                                bg-emerald-500/10 border border-emerald-500/30
                                hover:bg-emerald-500/20 shadow-[0_0_6px_rgba(16,185,129,0.1)]
                                hover:shadow-[0_0_12px_rgba(16,185,129,0.2)] transition-all"
                            >
                              <Check size={10} /> ACCEPT
                            </button>
                            <button
                              onClick={() => respondToRequest(req.id, false)}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md
                                text-[10px] font-mono font-bold text-rose-400
                                bg-rose-500/10 border border-rose-500/30
                                hover:bg-rose-500/20 transition-all"
                            >
                              <Minus size={10} /> DECLINE
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Accepted friends */}
                <div className="px-4 pt-4">
                  <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Friends
                  </p>
                  {friends.length === 0 ? (
                    <p className="text-slate-600 font-mono text-xs text-center py-6">
                      No friends yet. Add someone from All Players!
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-800/50">
                      {friends.map(f => (
                        <li key={f.id}
                          className="flex items-center justify-between py-3 hover:bg-slate-900/30 transition-colors rounded-lg px-1">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-200 truncate">{f.username}</p>
                            {f.full_name && (
                              <p className="text-[10px] text-slate-600 font-mono truncate">{f.full_name}</p>
                            )}
                          </div>
                          <button
                            onClick={() => openChat(f)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md shrink-0 ml-2
                              text-[10px] font-mono font-bold text-cyan-400 border border-cyan-500/30
                              bg-cyan-500/5 hover:bg-cyan-500/20
                              shadow-[0_0_6px_rgba(6,182,212,0.1)]
                              hover:shadow-[0_0_12px_rgba(6,182,212,0.2)]
                              transition-all duration-150"
                          >
                            <MessageSquare size={10} /> CHAT
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </aside>

      {/* ── Floating Chat Console ── */}
      {chatOpen && chatFriend && (
        <div className="
          fixed bottom-0 right-0 lg:right-72 z-50
          w-80 flex flex-col
          bg-slate-950/95 border border-slate-800 border-b-0 backdrop-blur-xl
          rounded-t-2xl shadow-2xl shadow-black/60
          transition-all duration-300
        ">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              <p className="text-sm font-semibold text-slate-200">{chatFriend.username}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={closeChat}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <ChevronDown size={15} />
              </button>
              <button
                onClick={closeChat}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-72">
            {messages.length === 0 && (
              <p className="text-center text-slate-600 text-xs font-mono py-6">
                No messages yet. Say hello!
              </p>
            )}
            {messages.map(msg => {
              const isMe = msg.sender_id === currentProfileId;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`
                    max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug
                    ${isMe
                      ? 'bg-cyan-600/30 text-cyan-100 border border-cyan-500/30 rounded-br-sm shadow-[0_0_8px_rgba(6,182,212,0.1)]'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'}
                  `}>
                    {msg.body}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-slate-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={handleMsgKeyDown}
                placeholder="Message..."
                className="
                  flex-1 bg-slate-900 border border-slate-700 rounded-xl
                  px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600
                  focus:outline-none focus:border-cyan-500
                  focus:shadow-[0_0_10px_rgba(6,182,212,0.5)]
                  transition-all duration-200
                "
              />
              <button
                onClick={sendMessage}
                disabled={sendingMsg || !msgInput.trim()}
                className="
                  w-9 h-9 flex items-center justify-center rounded-xl
                  bg-cyan-600/20 border border-cyan-500/30 text-cyan-400
                  hover:bg-cyan-600/40 hover:shadow-[0_0_12px_rgba(6,182,212,0.3)]
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-all duration-150
                "
              >
                {sendingMsg ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
