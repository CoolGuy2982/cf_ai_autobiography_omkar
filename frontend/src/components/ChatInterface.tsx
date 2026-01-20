import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { cn } from '../utils/cn'; 
import { getWsUrl } from '../utils/api';
import Markdown from 'react-markdown';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatInterfaceProps {
    sessionId: string;
    onDraftUpdate?: (draft: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ sessionId, onDraftUpdate }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [connected, setConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const wsUrl = getWsUrl(sessionId);
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            setConnected(true);
            ws.current?.send(JSON.stringify({ type: 'init' }));
        };

        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'response') {
                setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
            } else if (data.type === 'draft_update') {
                if (onDraftUpdate) onDraftUpdate(data.content);
            }
        };

        ws.current.onclose = () => setConnected(false);
        return () => ws.current?.close();
    }, [sessionId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = () => {
        if (!input.trim() || !ws.current) return;
        const msg = input;
        setMessages(prev => [...prev, { role: 'user', content: msg }]);
        setInput('');
        ws.current.send(JSON.stringify({ type: 'message', content: msg }));
    };

    return (
        <div className="flex flex-col h-full bg-white/5 backdrop-blur-2xl border-r border-white/10 shadow-[5px_0_30px_0_rgba(0,0,0,0.3)] text-stone-100">
            {/* Glass Header */}
            <div className="h-24 flex items-center px-8 border-b border-white/10 bg-black/20 shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-600 to-orange-800 flex items-center justify-center mr-5 shadow-lg border border-white/10">
                    <Sparkles size={20} className="text-white" />
                </div>
                <div>
                    <h2 className="font-serif font-medium text-2xl text-white tracking-wide">The Interview</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn("w-2 h-2 rounded-full animate-pulse", connected ? "bg-emerald-400" : "bg-red-400")} />
                        <span className="text-xs uppercase tracking-widest text-white/50 font-semibold">
                            {connected ? "Session Active" : "Connecting..."}
                        </span>
                    </div>
                </div>
            </div>

            {/* Transcript Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar" ref={scrollRef}>
                {messages.map((m, i) => (
                    <div key={i} className={cn(
                        "flex flex-col gap-3 max-w-[95%]",
                        m.role === 'user' ? "ml-auto items-end" : "items-start"
                    )}>
                        <span className="text-[11px] uppercase tracking-[0.2em] text-white/30 font-bold ml-1">
                            {m.role === 'user' ? 'Subject' : 'Biographer'}
                        </span>
                        
                        <div className={cn(
                            "shadow-md border backdrop-blur-sm",
                            m.role === 'user' 
                                ? "bg-amber-600/90 text-white border-amber-500/50 rounded-2xl rounded-tr-sm px-6 py-4" 
                                : "bg-black/40 text-stone-100 border-white/5 rounded-2xl rounded-tl-sm px-6 py-5" // Larger padding for AI
                        )}>
                            {/* Improved Markdown Rendering */}
                            <Markdown components={{
                                // AI uses Serif (Crimson Pro), User uses Sans (DM Sans)
                                p: ({children}) => (
                                    <p className={cn(
                                        "mb-3 last:mb-0 leading-relaxed",
                                        m.role === 'assistant' ? "font-serif text-[19px]" : "font-sans text-[16px]"
                                    )}>
                                        {children}
                                    </p>
                                ),
                                strong: ({children}) => <span className="font-bold text-white bg-white/10 px-1 rounded">{children}</span>,
                                em: ({children}) => <span className="italic text-white/80">{children}</span>,
                                ul: ({children}) => <ul className="list-disc pl-5 mb-2 space-y-1 marker:text-white/50">{children}</ul>,
                                li: ({children}) => <li className={m.role === 'assistant' ? "font-serif text-lg" : "font-sans text-base"}>{children}</li>
                            }}>
                                {m.content}
                            </Markdown>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Input Area */}
            <div className="p-8 pt-4 bg-gradient-to-t from-black/80 via-black/60 to-transparent shrink-0">
                <div className="relative group">
                    {/* Glowing effect on focus */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-amber-600 to-orange-700 rounded-2xl opacity-0 group-focus-within:opacity-40 transition duration-500 blur-lg"></div>
                    
                    <div className="relative flex items-center bg-[#1c1917] rounded-2xl shadow-2xl border border-white/10">
                        <textarea
                            className="flex-1 bg-transparent p-5 text-base font-sans text-white placeholder:text-white/20 focus:outline-none resize-none overflow-hidden"
                            placeholder="Type your response..."
                            rows={1}
                            style={{ minHeight: '60px' }}
                            value={input}
                            onChange={e => {
                                setInput(e.target.value);
                                // Auto-grow textarea
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim()}
                            className="p-4 mr-2 text-white/50 hover:text-amber-500 transition-colors disabled:opacity-30 disabled:hover:text-white/50"
                        >
                            <Send size={24} />
                        </button>
                    </div>
                    <div className="text-center mt-3">
                        <span className="text-[10px] text-white/20 uppercase tracking-widest">
                            Press Enter to Send
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};