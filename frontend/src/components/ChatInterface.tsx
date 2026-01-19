import React, { useEffect, useRef, useState } from 'react';
import { Send, User, Bot } from 'lucide-react';
import { cn } from '../utils/cn'; // Need to create utility

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
        // Connect to WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        // In local dev, Vite is 5173, backend is 8787.
        const wsUrl = `${protocol}://localhost:8787/api/session/${sessionId}/connect`;

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            console.log('Connected to Interview Session');
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
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 backdrop-blur">
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                    <Bot className="w-5 h-5 text-accent" />
                    Interviewer
                    {!connected && <span className="text-xs text-red-500 ml-auto">Disconnected</span>}
                    {connected && <span className="text-xs text-green-500 ml-auto">Live</span>}
                </h2>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((m, i) => (
                    <div key={i} className={cn(
                        "flex gap-3 max-w-[85%]",
                        m.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}>
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                            m.role === 'user' ? "bg-primary text-white" : "bg-accent/10 text-accent"
                        )}>
                            {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                        </div>
                        <div className={cn(
                            "p-3 rounded-2xl text-sm leading-relaxed",
                            m.role === 'user'
                                ? "bg-primary text-white rounded-tr-none"
                                : "bg-slate-100 text-slate-800 rounded-tl-none"
                        )}>
                            {m.content}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-100">
                <div className="flex gap-2">
                    <input
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                        placeholder="Type your answer..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!input.trim()}
                        className="p-2 bg-primary text-white rounded-full hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
