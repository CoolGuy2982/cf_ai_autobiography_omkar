import React, { useState, useRef, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { BookCanvas } from './BookCanvas';
import { Notepad } from './Notepad';
import { MapSelector } from './MapSelector'; // Reusing the map component
import { PenTool, BookOpen, Bug, Map as MapIcon } from 'lucide-react';
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
    const [viewMode, setViewMode] = useState<'notepad' | 'map' | 'book'>('notepad');
    const [notes, setNotes] = useState<any[]>([]);
    const [outline, setOutline] = useState<any>(null);
    const [manuscript, setManuscript] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [connected, setConnected] = useState(false);
    
    // Debug State
    const [showDebug, setShowDebug] = useState(false);
    const [serverLogs, setServerLogs] = useState<string[]>([]);
    
    // Single WebSocket Ref
    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!sessionId) return;
        if (ws.current) return; 

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
                else if (data.type === 'debug_log') {
                    setServerLogs(prev => [data.content, ...prev].slice(0, 50));
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

    const handleMapSelect = (lat: number, lng: number) => {
        // We can't easily get zoom level from the callback without modifying MapSelector widely,
        // but we can infer or just send the coords. 
        // For a better UX, let's assume if they click, they mean a specific place.
        // Ideally we'd pass the zoom level. For now, let's send the coords.
        
        // Construct a system message to the AI
        const locationMsg = `[System: User pointed to location on map: ${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
        
        if (ws.current?.readyState === WebSocket.OPEN) {
            // Send silently to AI
            ws.current.send(JSON.stringify({ type: 'message', content: locationMsg }));
            // Add a visual indicator for the user
            setMessages(prev => [...prev, { role: 'user', content: `📍 *Points to location on map* (${lat.toFixed(2)}, ${lng.toFixed(2)})` }]);
        }
    };

    const handleManualNoteUpdate = (updatedNotes: any[]) => {
        if (updatedNotes.length === 0 && notes.length > 0) return;
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
                            onClick={() => setViewMode('map')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'map' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                            <MapIcon size={14} /> <span>Map</span>
                        </button>
                        <button 
                            onClick={() => setViewMode('book')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'book' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                            <BookOpen size={14} /> <span>Manuscript</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center relative p-12 overflow-hidden">
                    <Notepad 
                        visible={viewMode === 'notepad'} 
                        notes={notes} 
                        outline={outline}
                        onUpdateNote={handleManualNoteUpdate}
                    />
                    
                    {/* Map Mode */}
                    <div className={`transition-all duration-500 absolute inset-0 p-20 ${viewMode === 'map' ? 'opacity-100 z-30 scale-100' : 'opacity-0 -z-10 scale-95'}`}>
                        <div className="w-full h-full border-8 border-white shadow-2xl rounded-sm rotate-1 bg-[#e3dacb] relative">
                             <div className="absolute -top-12 left-0 right-0 text-center">
                                <span className="bg-black/40 text-white px-4 py-1 rounded-full text-sm backdrop-blur">
                                    Click anywhere to show the Biographer
                                </span>
                             </div>
                             <MapSelector onLocationSelect={handleMapSelect} />
                        </div>
                    </div>

                    <BookCanvas 
                        visible={viewMode === 'book'} 
                        content={manuscript} 
                        chapterTitle={bookTitle || "My Story"} 
                    />
                </div>
                
                <button 
                    onClick={() => setShowDebug(!showDebug)}
                    className="absolute bottom-4 left-4 z-50 p-2 bg-black/50 text-white/30 rounded-full hover:text-white hover:bg-black/80 transition-colors"
                >
                    <Bug size={20} />
                </button>

                {showDebug && (
                    <div className="absolute bottom-16 left-4 z-50 w-[400px] h-[300px] bg-black/90 text-green-400 font-mono text-xs p-4 rounded-lg border border-green-900 overflow-y-auto shadow-2xl">
                        <h3 className="font-bold border-b border-green-800 pb-2 mb-2">DEBUG CONSOLE</h3>
                        <div className="mb-4">
                            <h4 className="text-white/50 mb-1">RAW NOTES STATE ({notes.length})</h4>
                            <pre className="whitespace-pre-wrap break-all bg-green-900/10 p-2 rounded text-[10px]">
                                {JSON.stringify(notes, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <h4 className="text-white/50 mb-1">SERVER LOGS</h4>
                            <div className="flex flex-col gap-1">
                                {serverLogs.map((log, i) => (
                                    <div key={i} className="border-l-2 border-green-600 pl-2 opacity-80">{log}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};