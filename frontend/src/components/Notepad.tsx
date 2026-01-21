import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface NoteItem {
    id: string;
    content: string;
}

interface Chapter {
    index: number;
    title: string;
    summary: string;
}

interface NotepadProps {
    notes: NoteItem[];
    outline: { title: string; chapters: Chapter[] } | null;
    visible: boolean;
    onUpdateNote: (updatedNotes: NoteItem[]) => void;
}

export const Notepad: React.FC<NotepadProps> = ({ notes, outline, visible, onUpdateNote }) => {
    // Page 0 = Outline, Page 1 = Live Notes
    const [page, setPage] = useState(0);

    // CSS Config from your original file
    const LINE_HEIGHT = 32;

    // Auto-flip to notes if the interview has started (notes exist) and user hasn't manually flipped back
    useEffect(() => {
        if (notes.length > 0 && page === 0) {
            setPage(1);
        }
    }, [notes.length]);

    const handleNoteEdit = (id: string, newContent: string) => {
        const updated = notes.map(n => n.id === id ? { ...n, content: newContent } : n);
        onUpdateNote(updated);
    };

    const addNote = () => {
        const newNote = { id: crypto.randomUUID(), content: "" };
        onUpdateNote([...notes, newNote]);
    };

    return (
        <motion.div 
            initial={{ y: 50, opacity: 0, rotate: -1 }} 
            animate={{ 
                y: visible ? 0 : 50, 
                opacity: visible ? 1 : 0,
                scale: visible ? 1 : 0.95,
                rotate: -1, 
                display: visible ? 'block' : 'none'
            }}
            transition={{ duration: 0.6, ease: "circOut" }}
            className="w-full max-w-[600px] mx-auto h-[80vh] relative perspective-1000 origin-top"
        >
            {/* 1. The Leather Binding (Top) - PRESERVED */}
            <div className="relative z-30 h-14 bg-[#4a1818] rounded-t-lg shadow-md flex items-center justify-between px-4 border-b-[3px] border-[#2d0e0e]">
                {/* Stitching effect */}
                <div className="absolute bottom-2 left-2 right-2 border-b border-dashed border-white/20 pointer-events-none"></div>
                
                <span className="text-[#cbaba0] font-sans text-[10px] tracking-[0.3em] font-bold uppercase drop-shadow-sm ml-4">
                    Case File: {page === 0 ? "MASTER PLAN" : "FIELD NOTES"}
                </span>

                {/* Pagination Controls */}
                <div className="flex gap-2 relative z-40">
                    <button 
                        onClick={() => setPage(0)}
                        className={`p-1 rounded hover:bg-white/10 transition-colors ${page === 0 ? 'text-amber-500' : 'text-[#cbaba0]'}`}
                        disabled={page === 0}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button 
                        onClick={() => setPage(1)}
                        className={`p-1 rounded hover:bg-white/10 transition-colors ${page === 1 ? 'text-amber-500' : 'text-[#cbaba0]'}`}
                        disabled={page === 1}
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* 2. The Paper Block Wrapper */}
            <div className="w-full h-full bg-[#fbf6e1] shadow-pad relative overflow-hidden rounded-b-sm">
                
                <AnimatePresence mode="wait">
                    {page === 0 ? (
                        /* ================== PAGE 1: THE OUTLINE ================== */
                        <motion.div 
                            key="outline"
                            initial={{ x: -300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -300, opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="absolute inset-0 z-20 bg-[#f4f1ea]" // Slightly different paper color for "typed" feel
                        >
                             {/* Paper Texture Overlay */}
                             <div className="absolute inset-0 opacity-40 mix-blend-multiply pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]"></div>

                            <div className="p-12 pt-16 h-full overflow-y-auto custom-scrollbar">
                                <h2 className="font-serif text-3xl font-bold text-stone-800 border-b-2 border-stone-800/20 pb-4 mb-8">
                                    {outline?.title || "Autobiography Plan"}
                                </h2>
                                
                                <div className="space-y-8">
                                    {outline ? outline.chapters.map((chap) => (
                                        <div key={chap.index} className="relative pl-6 border-l-2 border-amber-600/30">
                                            <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[#f4f1ea] border-2 border-amber-600/50"></span>
                                            <h3 className="font-serif font-bold text-xl text-stone-900 mb-1">
                                                Chapter {chap.index}: {chap.title}
                                            </h3>
                                            <p className="font-sans text-stone-600 leading-relaxed text-sm">
                                                {chap.summary}
                                            </p>
                                        </div>
                                    )) : (
                                        <div className="flex flex-col items-center justify-center h-40 text-stone-400 italic font-serif">
                                            <p>Generating outline...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        /* ================== PAGE 2: LIVE NOTES (Your Original Design) ================== */
                        <motion.div 
                            key="notes"
                            initial={{ x: 300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 300, opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="absolute inset-0 z-10 bg-[#fbf6e1]"
                        >
                            {/* CSS Pattern for Blue Lines */}
                            <div 
                                className="absolute inset-0 pointer-events-none opacity-80"
                                style={{
                                    backgroundImage: `linear-gradient(transparent ${LINE_HEIGHT - 1}px, #a4b5cd ${LINE_HEIGHT}px)`,
                                    backgroundSize: `100% ${LINE_HEIGHT}px`,
                                    marginTop: '40px' 
                                }}
                            />

                            {/* Red Vertical Margin Line */}
                            <div className="absolute top-0 bottom-0 left-16 w-[2px] bg-[#e79292] h-full z-10 opacity-80 pointer-events-none"></div>

                            {/* Handwriting Text Area */}
                            <div className="relative z-20 h-full overflow-y-auto custom-scrollbar pt-[42px] pb-10">
                                <div 
                                    className="pl-20 pr-8 font-hand text-2xl text-blue-900/90"
                                    style={{ lineHeight: `${LINE_HEIGHT}px` }}
                                >
                                    <h3 className="underline decoration-wavy decoration-[#e79292] mb-2 -ml-2 text-3xl">
                                        Interview Notes
                                    </h3>

                                    <ul className="list-none space-y-0">
                                        {notes.map((note) => (
                                            <motion.li 
                                                key={note.id}
                                                layout
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="relative group min-h-[32px] flex items-baseline"
                                            >
                                                {/* Bullet Point */}
                                                <span className="absolute -left-6 top-[12px] w-1.5 h-1.5 bg-stone-400 rounded-full opacity-50"></span>
                                                
                                                {/* Editable Note */}
                                                <div 
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={(e) => handleNoteEdit(note.id, e.currentTarget.textContent || "")}
                                                    className="w-full outline-none border-b border-transparent focus:bg-blue-50/30 focus:border-blue-200/50 px-1 -ml-1 rounded transition-colors"
                                                >
                                                    {note.content}
                                                </div>
                                            </motion.li>
                                        ))}
                                        {/* Empty State */}
                                        {notes.length === 0 && (
                                            <li className="opacity-40 italic mt-2">
                                                (Waiting for interview to begin...)
                                            </li>
                                        )}
                                    </ul>

                                    <button 
                                        onClick={addNote}
                                        className="mt-6 text-xl text-stone-400 hover:text-amber-600 transition-colors flex items-center gap-2"
                                    >
                                        <span>+</span> <span className="text-lg">Jot down thought</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};