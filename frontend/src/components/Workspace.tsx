import React, { useState, useRef, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { BookCanvas } from './BookCanvas';
import { Notepad } from './Notepad';
import { MapSelector } from './MapSelector';
import { FinalizeBook } from './FinalizeBook'; // Import the new component
import { PenTool, BookOpen, Bug, Map as MapIcon, RefreshCw, ArrowRight, XCircle, CheckCircle2, Download, PlusCircle } from 'lucide-react';
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
    const [viewMode, setViewMode] = useState<'notepad' | 'map' | 'book' | 'export'>('notepad');
    const [notes, setNotes] = useState<any[]>([]);
    const [outline, setOutline] = useState<any>(null);
    const [manuscript, setManuscript] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [connected, setConnected] = useState(false);
    const [mode, setMode] = useState<'interview' | 'writing'>('interview');
    const [isGenerating, setIsGenerating] = useState(false); 
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    // Track chapter progress
    const [currentChapterIndex, setCurrentChapterIndex] = useState(1);
    
    // Expansion State
    const [showExpandInput, setShowExpandInput] = useState(false);
    const [expandQuery, setExpandQuery] = useState("");
    const [isExpanding, setIsExpanding] = useState(false);

    // Debug tools
    const [showDebug, setShowDebug] = useState(false);
    const [serverLogs, setServerLogs] = useState<string[]>([]);
    
    const ws = useRef<WebSocket | null>(null);

    // ... (WebSocket useEffect mostly same, but add handler for chapter_index_sync) ...
    useEffect(() => {
        if (!sessionId) return;
        if (ws.current?.readyState === WebSocket.OPEN) return; 

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
                
                if (data.type === 'init') {
                    setMessages([]);
                    setNotes([]);
                    setIsAnalyzing(true);
                    socket.send(JSON.stringify({ type: 'init' }));
                }
                else if (data.type === 'outline') {
                    setOutline(data.content);
                    // If we were expanding, we are done now
                    setIsExpanding(false);
                    setShowExpandInput(false);
                }
                else if (data.type === 'chapter_index_sync') {
                    setCurrentChapterIndex(data.content);
                }
                else if (data.type === 'notes_sync') { setNotes(data.content); }
                else if (data.type === 'mode_sync') {
                    setMode(data.content);
                    if (data.content === 'writing') {
                        setViewMode('book');
                        setIsGenerating(true); 
                    }
                }
                else if (data.type === 'draft_complete') { setIsGenerating(false); }
                else if (data.type === 'history') {
                    setMessages(data.content);
                    if (data.content.length > 0) setIsAnalyzing(false);
                }
                else if (data.type === 'response') {
                    setIsAnalyzing(false);
                    setMessages(prev => [...prev, { role: data.role || 'assistant', content: data.content }]);
                }
                else if (data.type === 'draft_chunk') {
                    if (data.reset) setManuscript(data.content);
                    else setManuscript(prev => prev + data.content);
                    if (viewMode !== 'book' && viewMode !== 'export') setViewMode('book');
                }
                else if (data.type === 'debug_log') {
                    setServerLogs(prev => [data.content, ...prev].slice(0, 50));
                }
            } catch (e) { console.error("WS Parse Error", e); }
        };

        socket.onclose = () => { setConnected(false); ws.current = null; };
        return () => { if (socket.readyState === WebSocket.OPEN) socket.close(); ws.current = null; };
    }, [sessionId]);

    const handleSendMessage = (text: string) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        ws.current.send(JSON.stringify({ type: 'message', content: text }));
    };

    // ... (handleMapSelect, handleManualNoteUpdate, handleRetry, handleCancel SAME AS BEFORE) ...
    // Placeholder for brevity unless requested, they are unchanged.
    const handleMapSelect = (lat: number, lng: number, placeName?: string) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'message', content: `[System: User location: ${placeName}]` }));
            setMessages(prev => [...prev, { role: 'user', content: `📍 **${placeName}**` }]);
        }
    };
    const handleManualNoteUpdate = (updated: any[]) => {
        setNotes(updated);
        if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'update_notes', content: updated }));
    };
    const handleRetry = () => { if(ws.current) { setIsGenerating(true); ws.current.send(JSON.stringify({ type: 'retry_chapter' })); } };
    const handleCancel = () => { if(ws.current) { setIsGenerating(false); ws.current.send(JSON.stringify({ type: 'cancel_generation' })); } };


    // === NEW LOGIC HANDLERS ===

    const handleNextChapter = () => {
        if (confirm("Move to the next chapter?")) {
            if (ws.current?.readyState === WebSocket.OPEN) {
                setIsAnalyzing(true);
                setIsGenerating(false);
                ws.current.send(JSON.stringify({ type: 'next_chapter' }));
                setMode('interview');
                setViewMode('notepad');
            }
        }
    };

    const handleExpandOutline = () => {
        if (!expandQuery.trim()) return;
        setIsExpanding(true);
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'expand_outline', instruction: expandQuery }));
        }
    };

    // Helper: Are we at the end?
    const isEndOfBook = outline && currentChapterIndex > outline.chapters.length;

    // === RENDER ===

    if (viewMode === 'export') {
        return <FinalizeBook manuscript={manuscript} bookTitle={bookTitle || "My Story"} onBack={() => setViewMode('book')} />;
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden font-sans">
            {/* LEFT PANEL */}
            <div className="w-[450px] shrink-0 h-full relative z-50 transition-all shadow-[5px_0_30px_0_rgba(0,0,0,0.5)] bg-[#1c1917] flex flex-col">
                <ChatInterface 
                    messages={messages} 
                    onSendMessage={handleSendMessage} 
                    connected={connected}
                    disabled={mode === 'writing' || isEndOfBook} 
                    isAnalyzing={isAnalyzing || isExpanding}
                /> 

                {/* WRITING / END OF BOOK FOOTER */}
                {(mode === 'writing' || isEndOfBook) && (
                    <div className="absolute bottom-0 left-0 right-0 bg-wood-dark/95 border-t border-white/10 p-6 backdrop-blur-md">
                        
                        {/* 1. WRITING PROGRESS */}
                        {isGenerating && (
                            <div className="flex items-center gap-3 mb-4 text-amber-500 animate-pulse">
                                <PenTool size={18} />
                                <span className="font-serif italic text-lg">Writing in progress...</span>
                            </div>
                        )}
                        {!isGenerating && !isEndOfBook && mode === 'writing' && (
                            <div className="flex items-center gap-3 mb-4 text-emerald-500">
                                <CheckCircle2 size={18} />
                                <span className="font-serif italic text-lg">Drafting Complete</span>
                            </div>
                        )}
                        {isEndOfBook && (
                            <div className="flex items-center gap-3 mb-4 text-amber-100">
                                <BookOpen size={18} />
                                <span className="font-serif italic text-lg">Book Complete</span>
                            </div>
                        )}

                        {/* 2. ACTIONS */}
                        <div className="flex flex-col gap-3">
                            {isGenerating ? (
                                <button onClick={handleCancel} className="w-full py-3 px-4 rounded bg-stone-800 text-red-400 hover:text-red-300 transition-colors border border-white/5 uppercase text-xs font-bold tracking-wider">
                                    Cancel
                                </button>
                            ) : isEndOfBook ? (
                                // END OF BOOK ACTIONS
                                <>
                                    {!showExpandInput ? (
                                        <div className="flex gap-3">
                                            <button 
                                                onClick={() => setShowExpandInput(true)}
                                                className="flex-1 py-3 px-4 rounded bg-stone-800 text-stone-300 hover:text-white transition-colors border border-white/5 uppercase text-xs font-bold tracking-wider flex items-center justify-center gap-2"
                                            >
                                                <PlusCircle size={16} /> Expand Outline
                                            </button>
                                            <button 
                                                onClick={() => setViewMode('export')}
                                                className="flex-1 py-3 px-4 rounded bg-amber-700 text-white hover:bg-amber-600 transition-colors shadow-lg uppercase text-xs font-bold tracking-wider flex items-center justify-center gap-2"
                                            >
                                                <Download size={16} /> Export
                                            </button>
                                        </div>
                                    ) : (
                                        // EXPAND INPUT
                                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
                                            <textarea 
                                                value={expandQuery}
                                                onChange={(e) => setExpandQuery(e.target.value)}
                                                placeholder="What should happens next? (e.g. 'Add chapters about my college years')"
                                                className="w-full bg-black/40 border border-white/10 rounded-md p-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 resize-none h-20"
                                            />
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setShowExpandInput(false)}
                                                    className="px-4 py-2 text-stone-400 hover:text-white text-xs font-bold uppercase"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={handleExpandOutline}
                                                    disabled={isExpanding || !expandQuery.trim()}
                                                    className="flex-1 bg-amber-700 text-white rounded-sm text-xs font-bold uppercase hover:bg-amber-600 disabled:opacity-50"
                                                >
                                                    {isExpanding ? "Thinking..." : "Generate Chapters"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                // NORMAL CHAPTER FLOW
                                <div className="flex gap-3">
                                    <button onClick={handleRetry} className="flex-1 py-3 px-4 rounded bg-stone-800 text-stone-300 hover:text-white border border-white/5 uppercase text-xs font-bold tracking-wider">
                                        Retry
                                    </button>
                                    <button onClick={handleNextChapter} className="flex-1 py-3 px-4 rounded bg-amber-700 text-white hover:bg-amber-600 shadow-lg uppercase text-xs font-bold tracking-wider flex items-center justify-center gap-2">
                                        Next Chapter <ArrowRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT PANEL: Workspace Canvas */}
            <div className="flex-1 h-full relative flex flex-col bg-wood-pattern">
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/20 via-transparent to-black/40 z-40" />

                {/* Top Nav Switcher */}
                <div className="absolute top-8 z-50 flex justify-center w-full pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md p-1.5 rounded-full flex gap-2 border border-white/10 shadow-xl pointer-events-auto">
                        <button onClick={() => setViewMode('notepad')} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'notepad' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                            <PenTool size={14} /> <span>Notes</span>
                        </button>
                        <button onClick={() => setViewMode('map')} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'map' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                            <MapIcon size={14} /> <span>Map</span>
                        </button>
                        <button onClick={() => setViewMode('book')} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'book' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                            <BookOpen size={14} /> <span>Manuscript</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center relative p-12 overflow-hidden">
                    <Notepad visible={viewMode === 'notepad'} notes={notes} outline={outline} onUpdateNote={handleManualNoteUpdate} />
                    
                    <div className={`transition-all duration-500 absolute inset-0 p-20 ${viewMode === 'map' ? 'opacity-100 z-30 scale-100' : 'opacity-0 -z-10 scale-95'}`}>
                        <div className="w-full h-full border-8 border-white shadow-2xl rounded-sm rotate-1 bg-[#e3dacb] relative">
                             <div className="absolute -top-12 left-0 right-0 text-center"><span className="bg-black/40 text-white px-4 py-1 rounded-full text-sm backdrop-blur">Click to show Biographer</span></div>
                             <MapSelector onLocationSelect={handleMapSelect} active={viewMode === 'map'} className="h-full w-full" />
                        </div>
                    </div>

                    <BookCanvas visible={viewMode === 'book'} content={manuscript} chapterTitle={bookTitle || "My Story"} isGenerating={isGenerating} />
                </div>
                
                {/* Debug & Logs (Hidden for brevity) */}
            </div>
        </div>
    );
};