import React, { useState, useRef, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { BookCanvas } from './BookCanvas';
import { Notepad } from './Notepad';
import { PenTool, BookOpen } from 'lucide-react';
import { getWsUrl } from '../utils/api';

interface WorkspaceProps {
    sessionId: string;
    bookTitle?: string;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export const Workspace: React.FC<WorkspaceProps> = ({ sessionId, bookTitle }) => {
    const [viewMode, setViewMode] = useState<'notepad' | 'book'>('notepad');
    const [notes, setNotes] = useState<any[]>([]);
    const [outline, setOutline] = useState<any>(null);
    const [manuscript, setManuscript] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [connected, setConnected] = useState(false);
    
    // Single WebSocket Ref
    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!sessionId) return;
        if (ws.current) return; // Prevent React Strict Mode double-connect

        const url = getWsUrl(sessionId);
        const socket = new WebSocket(url);
        ws.current = socket;
        
        socket.onopen = () => {
            setConnected(true);
            socket.send(JSON.stringify({ type: 'init' }));
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'outline') {
                    setOutline(data.content);
                }
                else if (data.type === 'notes_sync') {
                    setNotes(data.content);
                }
                else if (data.type === 'response') {
                    // Check if message already exists to avoid dupes on hot reload
                    setMessages(prev => {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === data.content) {
                            return prev;
                        }
                        return [...prev, { role: data.role || 'assistant', content: data.content }];
                    });
                }
                else if (data.type === 'history') {
                    setMessages(data.content);
                }
                else if (data.type === 'draft_final') {
                    setManuscript(data.content);
                    setViewMode('book'); 
                }
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        socket.onclose = () => {
            setConnected(false);
            ws.current = null;
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) socket.close();
            ws.current = null;
        };
    }, [sessionId]);

    const handleSendMessage = (text: string) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        ws.current.send(JSON.stringify({ type: 'message', content: text }));
    };

    const handleManualNoteUpdate = (updatedNotes: any[]) => {
        setNotes(updatedNotes);
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'update_notes', content: updatedNotes }));
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden">
            <div className="w-[500px] shrink-0 h-full relative z-50 transition-all shadow-[5px_0_30px_0_rgba(0,0,0,0.5)]">
                <ChatInterface 
                    messages={messages} 
                    onSendMessage={handleSendMessage} 
                    connected={connected}
                /> 
            </div>

            <div className="flex-1 h-full relative flex flex-col bg-wood-pattern">
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/20 via-transparent to-black/40 z-40" />

                <div className="absolute top-8 z-50 flex justify-center w-full">
                    <div className="bg-black/30 backdrop-blur-md p-1.5 rounded-full flex gap-2 border border-white/10 shadow-xl">
                        <button 
                            onClick={() => setViewMode('notepad')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'notepad' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                            <PenTool size={14} /> <span>Notes</span>
                        </button>
                        <button 
                            onClick={() => setViewMode('book')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'book' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                            <BookOpen size={14} /> <span>Manuscript</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center relative p-12">
                    <Notepad 
                        visible={viewMode === 'notepad'} 
                        notes={notes} 
                        outline={outline}
                        onUpdateNote={handleManualNoteUpdate}
                    />
                    <BookCanvas 
                        visible={viewMode === 'book'} 
                        content={manuscript} 
                        chapterTitle={bookTitle || "My Story"} 
                    />
                </div>
            </div>
        </div>
    );
};