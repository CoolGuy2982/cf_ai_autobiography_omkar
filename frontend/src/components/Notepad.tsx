import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { cn } from '../utils/cn';

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
    // Page 0 = Outline (Master Plan)
    // Page 1+ = Notes
    const [page, setPage] = useState(0);
    const [direction, setDirection] = useState<'next' | 'prev'>('next');
    const [isFlipping, setIsFlipping] = useState(false);

    const NOTES_PER_PAGE = 8;
    const maxNotePages = Math.ceil(Math.max(notes.length, 1) / NOTES_PER_PAGE);

    // Track previous note count to detect additions
    const prevNoteCount = useRef(notes.length);
    const manualAddTriggered = useRef(false);

    // === AUTO FLIP & FOCUS LOGIC ===
    useEffect(() => {
        // If notes length increased
        if (notes.length > prevNoteCount.current) {
            const lastIndex = notes.length - 1;
            const targetPage = Math.ceil((lastIndex + 1) / NOTES_PER_PAGE);
            
            // 1. Flip to the page if we aren't there
            if (page !== targetPage && page !== 0) { // Keep 0 if viewing outline unless user wants to see notes? 
                // Actually, requirement says "auto flip to the note AI just added". 
                // We should flip even if on page 0 if it's relevant context.
                // But usually Outline is separate. Let's flip if we are in Note mode (page > 0) OR if it was a manual add.
                
                if (page > 0 || manualAddTriggered.current) {
                    setDirection('next');
                    setIsFlipping(true);
                    setPage(targetPage);
                    setTimeout(() => setIsFlipping(false), 800);
                }
            } else if (page === 0 && !manualAddTriggered.current) {
                // If AI adds a note while we look at outline, maybe just show a notification dot? 
                // For now, let's strictly follow "auto flip to the note".
                // But jumping from Outline to Notes might be jarring. 
                // Let's only jump if page > 0 (already reading notes) OR manual add.
            }

            // 2. If Manual Add, Focus the input
            if (manualAddTriggered.current) {
                // Wait for render/flip
                setTimeout(() => {
                    // We need to set the page again here just in case logic above didn't trigger (e.g. same page)
                    if (page !== targetPage) {
                        setDirection('next');
                        setPage(targetPage);
                    }
                    
                    const newNoteId = notes[lastIndex].id;
                    const el = document.getElementById(`note-input-${newNoteId}`);
                    if (el) {
                        el.focus();
                    }
                    manualAddTriggered.current = false;
                }, page !== targetPage ? 900 : 100); // Longer wait if flipping
            }
        }
        prevNoteCount.current = notes.length;
    }, [notes.length, page]);


    const handleNoteEdit = (id: string, newContent: string) => {
        const updated = notes.map(n => n.id === id ? { ...n, content: newContent } : n);
        onUpdateNote(updated);
    };

    const addNote = () => {
        manualAddTriggered.current = true; // Mark as user action
        const newNote = { id: crypto.randomUUID(), content: "" };
        onUpdateNote([...notes, newNote]);
    };

    const currentNotes = notes.slice((page - 1) * NOTES_PER_PAGE, page * NOTES_PER_PAGE);

    const flipPage = (newPage: number) => {
        if (newPage < 0 || (newPage > maxNotePages && newPage !== 0)) return;
        setDirection(newPage > page ? 'next' : 'prev');
        setIsFlipping(true);
        setPage(newPage);
        setTimeout(() => setIsFlipping(false), 800);
    };

    // --- ANIMATION VARIANTS ---
    const pageVariants = {
        enter: (dir: 'next' | 'prev') => ({
            rotateX: dir === 'next' ? 0 : -90,
            opacity: dir === 'next' ? 1 : 0,
            zIndex: dir === 'next' ? 10 : 20,
        }),
        center: {
            rotateX: 0,
            opacity: 1,
            zIndex: 20,
            transition: { duration: 0.6, ease: "easeOut" }
        },
        exit: (dir: 'next' | 'prev') => ({
            rotateX: dir === 'next' ? -90 : 0, 
            opacity: 0,
            zIndex: dir === 'next' ? 20 : 10,
            transition: { duration: 0.6, ease: "easeIn" }
        })
    };

    return (
        <motion.div 
            initial={{ x: -50, opacity: 0 }} 
            animate={{ 
                x: visible ? 0 : -50, 
                opacity: visible ? 1 : 0,
                display: visible ? 'flex' : 'none'
            }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-[550px] h-[80vh] flex flex-col relative perspective-[2000px]"
        >
            {/* === 1. THE HEADER (Leather Binding) === */}
            <div className="h-16 bg-[#1c1917] rounded-t-md shadow-xl z-30 relative flex items-center justify-between px-6 border-b border-[#3a3532] shrink-0">
                {/* Leather Texture */}
                <div className="absolute inset-0 opacity-60 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] mix-blend-overlay rounded-t-md"></div>
                
                {/* Stitching Effect */}
                <div className="absolute bottom-1 left-2 right-2 border-b-2 border-dashed border-[#44403c] opacity-50"></div>

                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#d97706] shadow-[0_0_8px_rgba(217,119,6,0.6)]"></div>
                    <span className="text-[#a8a29e] font-sans text-[10px] tracking-[0.25em] font-bold uppercase">
                        {page === 0 ? "MASTER PLAN" : `FIELD NOTES ${page}`}
                    </span>
                </div>
                
                <div className="relative z-10 flex gap-1">
                    <button 
                        onClick={() => flipPage(page - 1)}
                        disabled={page === 0 || isFlipping}
                        className="p-2 text-[#78716c] hover:text-[#d97706] disabled:opacity-20 transition-colors"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button 
                        onClick={() => flipPage(page + 1)}
                        disabled={page >= maxNotePages || isFlipping}
                        className="p-2 text-[#78716c] hover:text-[#d97706] disabled:opacity-20 transition-colors"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* === 2. THE PAPER CONTAINER === */}
            <div className="flex-1 relative bg-[#292524] rounded-b-md shadow-2xl p-2 pb-3 overflow-hidden">
                {/* Background "Stack" Depth */}
                <div className="absolute inset-x-4 bottom-1 h-2 bg-[#e5e0d3] rounded-b-sm z-0"></div>
                <div className="absolute inset-x-3 bottom-2 h-2 bg-[#ebe6d9] rounded-b-sm z-0"></div>

                {/* ANIMATING PAGE */}
                <AnimatePresence initial={false} mode='popLayout' custom={direction}>
                    <motion.div
                        key={page}
                        custom={direction}
                        variants={pageVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="absolute inset-2 top-0 bottom-3 bg-[#f5f2eb] rounded-sm shadow-inner overflow-hidden origin-top"
                        style={{ transformStyle: 'preserve-3d' }} 
                    >
                        {/* Paper Texture & Grain */}
                        <div className="absolute inset-0 opacity-20 mix-blend-multiply pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]"></div>
                        <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-transparent h-12 pointer-events-none"></div>

                        {/* === SCROLLABLE CONTENT AREA === */}
                        <div className="relative h-full w-full overflow-y-auto custom-scrollbar">
                            {page === 0 ? (
                                <OutlineView outline={outline} />
                            ) : (
                                <NotesView notes={currentNotes} page={page} onEdit={handleNoteEdit} />
                            )}
                        </div>

                        {/* Add Button (Only on last page of notes) */}
                        {page === maxNotePages && page !== 0 && (
                            <button 
                                onClick={addNote}
                                className="absolute bottom-6 right-6 p-3 bg-[#1c1917] text-[#d97706] rounded-full shadow-lg hover:scale-110 hover:bg-black transition-all z-50 group border border-[#3a3532]"
                                title="Add Note"
                            >
                                <Plus size={20} />
                            </button>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

// --- SUBCOMPONENTS ---

const OutlineView = ({ outline }: { outline: any }) => (
    <div className="p-10 pb-20">
        <div className="border-b-2 border-[#1c1917]/10 pb-4 mb-8">
            <h2 className="font-serif text-2xl font-bold text-[#1c1917] tracking-tight">
                {outline?.title || "Autobiography Structure"}
            </h2>
            <p className="text-xs font-sans text-[#78716c] mt-2 uppercase tracking-wider">
                Roadmap • {outline?.chapters?.length || 0} Chapters
            </p>
        </div>

        <div className="space-y-8">
            {outline ? outline.chapters.map((chap: any) => (
                <div key={chap.index} className="relative pl-6 border-l-2 border-[#d97706]/30 group hover:border-[#d97706] transition-colors">
                    <span className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-[#d97706] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                    <h3 className="font-serif font-bold text-lg text-[#1c1917] mb-1">
                        <span className="text-[#d97706] mr-2">0{chap.index}.</span>
                        {chap.title}
                    </h3>
                    <p className="font-sans text-[#57534e] leading-relaxed text-sm text-justify">
                        {chap.summary}
                    </p>
                </div>
            )) : (
                <div className="flex flex-col items-center justify-center mt-20 gap-4 opacity-50">
                    <div className="w-6 h-6 border-2 border-[#d97706] border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-xs font-sans uppercase tracking-widest">Loading Outline...</div>
                </div>
            )}
        </div>
    </div>
);

const NotesView = ({ notes, page, onEdit }: { notes: NoteItem[], page: number, onEdit: (id: string, val: string) => void }) => (
    <div className="relative min-h-full">
        {/* Legal Pad Lines */}
        <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
                backgroundImage: `linear-gradient(transparent 39px, #1c1917 39px, #1c1917 40px)`,
                backgroundSize: `100% 40px`,
                marginTop: '60px'
            }}
        />
        {/* Margin Line */}
        <div className="absolute top-0 bottom-0 left-12 w-[1px] bg-[#ef4444] h-full z-0 opacity-30 pointer-events-none"></div>

        <div className="relative z-10 p-8 pl-16 pr-8 pt-16">
            <ul className="list-none space-y-[8px] font-hand text-2xl text-[#1c1917]/90 leading-[40px]">
                {notes.map((note) => (
                    <motion.li 
                        key={note.id} 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative group min-h-[40px] flex items-baseline"
                    >
                        <span className="absolute -left-5 top-[14px] w-1.5 h-1.5 bg-[#78716c] rounded-full opacity-30 group-hover:opacity-100 transition-opacity"></span>
                        <div 
                            id={`note-input-${note.id}`} // Added ID for focusing
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => onEdit(note.id, e.currentTarget.textContent || "")}
                            className="w-full outline-none border-none focus:bg-[#d97706]/10 px-1 -ml-1 rounded transition-colors empty:before:content-['...'] empty:before:text-[#a8a29e] empty:before:font-sans empty:before:text-sm"
                        >
                            {note.content}
                        </div>
                    </motion.li>
                ))}
            </ul>
        </div>
    </div>
);