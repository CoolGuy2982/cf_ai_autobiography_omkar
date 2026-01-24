import React, { useState, useRef, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { BookCanvas } from './BookCanvas';
import { Notepad } from './Notepad';
import { MapSelector } from './MapSelector';
import { PenTool, BookOpen, Bug, Map as MapIcon, RefreshCw, ArrowRight, XCircle } from 'lucide-react';
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
    const [mode, setMode] = useState<'interview' | 'writing'>('interview');
    
    const [showDebug, setShowDebug] = useState(false);
    const [serverLogs, setServerLogs] = useState<string[]>([]);
    
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
                else if (data.type === 'mode_sync') {
                    setMode(data.content);
                    if (data.content === 'writing') {
                        setViewMode('book');
                    }
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
                else if (data.type === 'draft_chunk') {
                    if (data.reset) {
                        setManuscript(data.content);
                    } else {
                        setManuscript(prev => prev + data.content);
                    }
                    if (viewMode !== 'book') setViewMode('book');
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

    const handleMapSelect = (lat: number, lng: number, placeName?: string) => {
        const locationLabel = placeName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        const systemMsg = `[System: User pointed to location on map: ${locationLabel} (Coordinates: ${lat}, ${lng})]`;
        const uiMsg = `📍 **${locationLabel}**`;

        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'message', content: systemMsg }));
            setMessages(prev => [...prev, { role: 'user', content: uiMsg }]);
        }
    };

    // === CHANGED: Smarter update logic to prevent overwriting AI notes ===
    const handleManualNoteUpdate = (updatedNotes: any[]) => {
        if (updatedNotes.length === 0 && notes.length > 0 && notes.length > 1) {
             // Safety check: Avoid accidentally clearing all notes via a UI glitch
             return;
        }

        // Optimistically update UI
        setNotes(updatedNotes);

        if (ws.current?.readyState === WebSocket.OPEN) {
            // Check if this is a simple content edit (patch)
            if (updatedNotes.length === notes.length) {
                const changedNote = updatedNotes.find((note, idx) => {
                    const original = notes[idx];
                    return original && note.id === original.id && note.content !== original.content;
                });

                if (changedNote) {
                    // Send granular update
                    ws.current.send(JSON.stringify({ 
                        type: 'patch_note', 
                        id: changedNote.id, 
                        content: changedNote.content 
                    }));
                    return;
                }
            }
            
            // Fallback for Adds/Deletes: Send full list
            ws.current.send(JSON.stringify({ type: 'update_notes', content: updatedNotes }));
        }
    };

    const handleRetry = () => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'retry_chapter' }));
        }
    };

    const handleCancel = () => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'cancel_generation' }));
        }
    }

    const handleNextChapter = () => {
        if (confirm("Move to the next chapter? This will clear the chat history and notes for a fresh start.")) {
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'next_chapter' }));
                setMode('interview');
                setViewMode('notepad');
                setMessages([]);
            }
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden font-sans">
            {/* LEFT PANEL: Chat / Dashboard */}
            <div className="w-[450px] shrink-0 h-full relative z-50 transition-all shadow-[5px_0_30px_0_rgba(0,0,0,0.5)] bg-[#1c1917] flex flex-col">
                <ChatInterface 
                    messages={messages} 
                    onSendMessage={handleSendMessage} 
                    connected={connected}
                    disabled={mode === 'writing'} 
                /> 

                {mode === 'writing' && (
                    <div className="absolute bottom-0 left-0 right-0 bg-wood-dark/95 border-t border-white/10 p-6 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4 text-amber-500 animate-pulse">
                            <PenTool size={18} />
                            <span className="font-serif italic text-lg">Writing in progress...</span>
                        </div>
                        <p className="text-stone-400 text-sm mb-6">
                            The biographer is drafting your chapter based on the interview notes, transcripts, and your uploaded archives.
                        </p>
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-3">
                                <button 
                                    onClick={handleCancel}
                                    className="flex-1 py-3 px-4 rounded bg-stone-800 text-red-400 hover:text-red-300 hover:bg-stone-700 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide border border-white/5"
                                >
                                    <XCircle size={16} /> Cancel
                                </button>
                                <button 
                                    onClick={handleRetry}
                                    className="flex-1 py-3 px-4 rounded bg-stone-800 text-stone-300 hover:text-white hover:bg-stone-700 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide border border-white/5"
                                >
                                    <RefreshCw size={16} /> Retry
                                </button>
                            </div>
                            <button 
                                onClick={handleNextChapter}
                                className="w-full py-3 px-4 rounded bg-amber-700 text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide shadow-lg"
                            >
                                Next Chapter <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT PANEL: Workspace Canvas */}
            <div className="flex-1 h-full relative flex flex-col bg-wood-pattern">
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/20 via-transparent to-black/40 z-40" />

                <div className="absolute top-8 z-50 flex justify-center w-full pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md p-1.5 rounded-full flex gap-2 border border-white/10 shadow-xl pointer-events-auto">
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
                    
                    <div className={`transition-all duration-500 absolute inset-0 p-20 ${viewMode === 'map' ? 'opacity-100 z-30 scale-100' : 'opacity-0 -z-10 scale-95'}`}>
                        <div className="w-full h-full border-8 border-white shadow-2xl rounded-sm rotate-1 bg-[#e3dacb] relative">
                             <div className="absolute -top-12 left-0 right-0 text-center">
                                <span className="bg-black/40 text-white px-4 py-1 rounded-full text-sm backdrop-blur">
                                    Click anywhere to show the Biographer
                                </span>
                             </div>
                             
                             <MapSelector 
                                onLocationSelect={handleMapSelect} 
                                active={viewMode === 'map'} 
                                className="h-full w-full"
                             />
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