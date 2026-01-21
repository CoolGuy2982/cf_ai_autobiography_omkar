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
    // Page 0 = Outline
    // Page 1+ = Notes (8 notes per page)
    const [page, setPage] = useState(0);
    const [isFlipping, setIsFlipping] = useState(false);
    
    const NOTES_PER_PAGE = 8;
    const maxNotePages = Math.ceil(Math.max(notes.length, 1) / NOTES_PER_PAGE);

    // Auto-flip if notes grow beyond current page
    useEffect(() => {
        if (notes.length > 0) {
            const requiredPage = Math.ceil(notes.length / NOTES_PER_PAGE);
            if (page !== 0 && requiredPage > page) {
                setPage(requiredPage);
            }
            // Initial auto-open
            if (page === 0 && notes.length > 0) {
                setPage(1);
            }
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

    const currentNotes = notes.slice((page - 1) * NOTES_PER_PAGE, page * NOTES_PER_PAGE);

    const flipPage = (newPage: number) => {
        if (newPage < 0 || (newPage > maxNotePages && newPage !== 0)) return;
        setIsFlipping(true);
        setPage(newPage);
        setTimeout(() => setIsFlipping(false), 600);
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
            transition={{ duration: 0.6 }}
            className="w-full max-w-[600px] h-[80vh] relative perspective-1000"
        >
            {/* The Leather Binding Header */}
            <div className="relative z-50 h-14 bg-[#4a1818] rounded-t-lg shadow-md flex items-center justify-between px-4 border-b-[3px] border-[#2d0e0e]">
                <div className="absolute bottom-2 left-2 right-2 border-b border-dashed border-white/20 pointer-events-none"></div>
                <span className="text-[#cbaba0] font-sans text-[10px] tracking-[0.3em] font-bold uppercase drop-shadow-sm ml-4">
                    Case File: {page === 0 ? "MASTER PLAN" : `FIELD NOTES (PG ${page})`}
                </span>
                <div className="flex gap-2 relative z-50">
                    <button 
                        onClick={() => flipPage(page - 1)}
                        className={`p-1 rounded hover:bg-white/10 transition-colors ${page > 0 ? 'text-amber-500' : 'text-[#cbaba0] opacity-50'}`}
                        disabled={page === 0 || isFlipping}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button 
                        onClick={() => flipPage(page + 1)}
                        className={`p-1 rounded hover:bg-white/10 transition-colors ${page < maxNotePages ? 'text-amber-500' : 'text-[#cbaba0] opacity-50'}`}
                        disabled={page >= maxNotePages || isFlipping}
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* The 3D Book Container */}
            <div className="w-full h-full relative perspective-2000">
                <AnimatePresence initial={false} mode='popLayout'>
                    <motion.div
                        key={page}
                        initial={{ rotateY: -90, transformOrigin: "left center", opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        exit={{ rotateY: 90, opacity: 0, transition: { duration: 0.3 } }}
                        transition={{ duration: 0.6, type: "spring", stiffness: 60 }}
                        className="absolute inset-0 bg-[#fbf6e1] shadow-pad origin-left rounded-b-sm overflow-hidden backface-hidden"
                        style={{ transformStyle: 'preserve-3d' }}
                    >
                        {page === 0 ? (
                            /* === PAGE 0: OUTLINE === */
                            <div className="absolute inset-0 z-20 bg-[#f4f1ea] p-12 pt-10 h-full overflow-y-auto custom-scrollbar">
                                <div className="absolute inset-0 opacity-40 mix-blend-multiply pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]"></div>
                                <h2 className="font-serif text-3xl font-bold text-stone-800 border-b-2 border-stone-800/20 pb-4 mb-8">
                                    {outline?.title || "Autobiography Plan"}
                                </h2>
                                <div className="space-y-8">
                                    {outline ? outline.chapters.map((chap) => (
                                        <div key={chap.index} className="relative pl-6 border-l-2 border-amber-600/30">
                                            <h3 className="font-serif font-bold text-xl text-stone-900 mb-1">
                                                Chapter {chap.index}: {chap.title}
                                            </h3>
                                            <p className="font-sans text-stone-600 leading-relaxed text-sm">
                                                {chap.summary}
                                            </p>
                                        </div>
                                    )) : (
                                        <div className="text-stone-400 italic font-serif text-center mt-20">Generating outline...</div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* === PAGE 1+: NOTES === */
                            <div className="absolute inset-0 z-10 bg-[#fbf6e1]">
                                {/* Blue Lines */}
                                <div 
                                    className="absolute inset-0 pointer-events-none opacity-80"
                                    style={{
                                        backgroundImage: `linear-gradient(transparent 31px, #a4b5cd 32px)`,
                                        backgroundSize: `100% 32px`,
                                        marginTop: '40px' 
                                    }}
                                />
                                {/* Red Margin */}
                                <div className="absolute top-0 bottom-0 left-16 w-[2px] bg-[#e79292] h-full z-10 opacity-80 pointer-events-none"></div>

                                <div className="relative z-20 h-full p-10 pt-12 pl-20 pr-8">
                                    <h3 className="font-hand text-3xl text-blue-900/90 underline decoration-wavy decoration-[#e79292] mb-6 -ml-4">
                                        Field Notes (Pg {page})
                                    </h3>

                                    <ul className="list-none space-y-0 font-hand text-2xl text-blue-900/90 leading-[32px]">
                                        {currentNotes.map((note) => (
                                            <motion.li 
                                                key={note.id} 
                                                layout 
                                                className="relative group min-h-[32px] flex items-baseline"
                                            >
                                                <span className="absolute -left-6 top-[12px] w-1.5 h-1.5 bg-stone-400 rounded-full opacity-50"></span>
                                                <div 
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={(e) => handleNoteEdit(note.id, e.currentTarget.textContent || "")}
                                                    className="w-full outline-none border-b border-transparent focus:bg-blue-50/30 px-1 -ml-1 rounded"
                                                >
                                                    {note.content}
                                                </div>
                                            </motion.li>
                                        ))}
                                        {currentNotes.length === 0 && (
                                            <li className="opacity-40 italic mt-2">No notes on this page.</li>
                                        )}
                                    </ul>

                                    {/* Add Button only on last page */}
                                    {page === maxNotePages && (
                                        <button 
                                            onClick={addNote}
                                            className="mt-6 text-xl text-stone-400 hover:text-amber-600 transition-colors flex items-center gap-2 font-hand"
                                        >
                                            <span>+</span> <span>Jot down thought</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
            
            {/* Fake Page Stack Effect on the Right */}
            <div className="absolute top-2 bottom-2 right-[-10px] w-[10px] bg-[#dcdcdc] rounded-r-sm z-0 border-l border-black/10"></div>
        </motion.div>
    );
};