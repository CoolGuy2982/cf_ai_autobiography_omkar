import React, { useState } from 'react';
import { ChatInterface } from './ChatInterface';
import { BookCanvas } from './BookCanvas';
import { Notepad } from './Notepad';
import { PenTool, BookOpen } from 'lucide-react';

interface WorkspaceProps {
    sessionId: string;
    bookTitle?: string;
}

export const Workspace: React.FC<WorkspaceProps> = ({ sessionId, bookTitle }) => {
    const [viewMode, setViewMode] = useState<'notepad' | 'book'>('notepad');
    const [bookContent, setBookContent] = useState('');
    const [notes, setNotes] = useState<string[]>([]);

    const handleDraftUpdate = (newText: string) => {
        setBookContent(prev => prev + newText);
        const snippet = newText.slice(0, 40) + "...";
        setNotes(prev => [...prev, `Drafting: "${snippet}"`]);
        if (bookContent.length === 0 && newText.length > 0) {
           setViewMode('book');
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden">
            
            {/* LEFT: The Chat Pane - WIDENED to 500px */}
            <div className="w-[500px] shrink-0 h-full relative z-50 transition-all duration-300">
                <ChatInterface sessionId={sessionId} onDraftUpdate={handleDraftUpdate} />
            </div>

            {/* RIGHT: The Studio Stage */}
            <div className="flex-1 h-full relative flex flex-col">
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/20 via-transparent to-black/40 z-40" />

                <div className="absolute top-8 left-0 right-0 z-50 flex justify-center">
                    <div className="bg-black/30 backdrop-blur-md p-1.5 rounded-full flex gap-2 border border-white/10 shadow-xl">
                        <button 
                            onClick={() => setViewMode('notepad')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'notepad' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                            <PenTool size={14} />
                            <span>Notes</span>
                        </button>
                        <button 
                            onClick={() => setViewMode('book')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'book' ? 'bg-white text-stone-900 shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                            <BookOpen size={14} />
                            <span>Manuscript</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center relative p-12">
                    <Notepad visible={viewMode === 'notepad'} notes={notes} />
                    <BookCanvas 
                        visible={viewMode === 'book'} 
                        content={bookContent} 
                        chapterTitle={bookTitle || "My Story"} 
                    />
                </div>
            </div>
        </div>
    );
};