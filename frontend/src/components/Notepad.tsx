import React, { useState, useEffect } from 'react';
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
// Page 0 = Outline
// Page 1+ = Notes (8 notes per page)
const [page, setPage] = useState(0);
// Direction tracks if we are flipping 'forward' (next) or 'back' (prev)
const [direction, setDirection] = useState<'next' | 'prev'>('next');
const [isFlipping, setIsFlipping] = useState(false);


const NOTES_PER_PAGE = 8;
const maxNotePages = Math.ceil(Math.max(notes.length, 1) / NOTES_PER_PAGE);

// Auto-flip if notes grow beyond current page
useEffect(() => {
    if (notes.length > 0) {
        const requiredPage = Math.ceil(notes.length / NOTES_PER_PAGE);
        if (page !== 0 && requiredPage > page) {
            setDirection('next');
            setPage(requiredPage);
        }
        // Initial auto-open
        if (page === 0 && notes.length > 0) {
            setDirection('next');
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
    setDirection(newPage > page ? 'next' : 'prev');
    setIsFlipping(true);
    setPage(newPage);
    // Lock interaction during the slow, realistic flip
    setTimeout(() => setIsFlipping(false), 1200); 
};

// --- ANIMATION VARIANTS ---
const pageVariants = {
    enter: (dir: 'next' | 'prev') => ({
        rotateX: dir === 'next' ? 0 : -180, // If coming from next, we start folded up (-180)
        zIndex: dir === 'next' ? 10 : 20,
        opacity: 1,
    }),
    center: {
        rotateX: 0,
        zIndex: 10,
        opacity: 1,
        transition: { 
            duration: 1.2, 
            ease: [0.645, 0.045, 0.355, 1.0] // Cubic-bezier for paper feel
        }
    },
    exit: (dir: 'next' | 'prev') => ({
        rotateX: dir === 'next' ? -180 : 0, // Flip up (-180) if going next
        zIndex: dir === 'next' ? 20 : 10, // Ensure flipping page is on top
        transition: { 
            duration: 1.2, 
            ease: [0.645, 0.045, 0.355, 1.0] 
        }
    })
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
        transition={{ duration: 0.8 }}
        className="w-full max-w-[600px] h-[80vh] relative"
    >
        {/* === 1. THE BINDING (Underneath the flipping pages when they go up) === */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-[#3a1111] to-[#250909] rounded-t-md shadow-2xl z-20 border-b-[3px] border-[#1a0505]">
            {/* Metallic Rings / Stitching Simulation */}
            <div className="absolute -bottom-3 left-0 right-0 flex justify-evenly px-4 z-30">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-4 h-8 bg-gradient-to-b from-stone-400 via-stone-200 to-stone-500 rounded-full shadow-md border border-stone-600"></div>
                ))}
            </div>

            <div className="flex items-center justify-between px-4 h-full relative z-40">
                <span className="text-[#cbaba0] font-sans text-[10px] tracking-[0.3em] font-bold uppercase drop-shadow-sm ml-2">
                    {page === 0 ? "MASTER PLAN" : `FIELD NOTES ${page}`}
                </span>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => flipPage(page - 1)}
                        className={cn(
                            "p-1.5 rounded-full transition-all duration-300",
                            page > 0 ? "text-amber-500 hover:bg-white/10 hover:scale-110" : "text-[#cbaba0] opacity-30"
                        )}
                        disabled={page === 0 || isFlipping}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button 
                        onClick={() => flipPage(page + 1)}
                        className={cn(
                            "p-1.5 rounded-full transition-all duration-300",
                            page < maxNotePages ? "text-amber-500 hover:bg-white/10 hover:scale-110" : "text-[#cbaba0] opacity-30"
                        )}
                        disabled={page >= maxNotePages || isFlipping}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>
        </div>

        {/* === 2. THE STACK (Static page underneath to provide depth) === */}
        <div className="absolute inset-x-0 top-12 bottom-0 bg-[#fbf6e1] rounded-b-sm border-r-4 border-b-4 border-stone-300/50 shadow-md z-0 flex items-center justify-center">
             {/* This just shows some faint lines to look like 'next pages' */}
             <div className="w-full h-full opacity-50 bg-[repeating-linear-gradient(transparent,transparent_31px,#a4b5cd_31px,#a4b5cd_32px)] mt-10"></div>
        </div>


        {/* === 3. THE FLIPPING PAGE === */}
        {/* Perspective container is crucial for 3D effect */}
        <div className="absolute inset-0 top-12 perspective-[2500px]">
            <AnimatePresence initial={false} mode='popLayout' custom={direction}>
                <motion.div
                    key={page}
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="absolute inset-0 origin-top h-full w-full bg-[#fbf6e1] rounded-b-sm shadow-pad"
                    style={{ transformStyle: 'preserve-3d' }} // CRITICAL: Allows front/back faces
                >
                    {/* === FRONT FACE (Content) === */}
                    <div className="absolute inset-0 backface-hidden z-10 bg-[#fbf6e1] overflow-hidden rounded-b-sm">
                        {/* Realistic Paper Texture Overlay */}
                        <div className="absolute inset-0 opacity-30 mix-blend-multiply pointer-events-none bg-[url('[https://www.transparenttextures.com/patterns/cream-paper.png](https://www.transparenttextures.com/patterns/cream-paper.png)')]"></div>
                        
                        {/* Lighting Sheen Overlay (Animates based on rotation ideally, but here simulated via CSS gradient) */}
                        <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-transparent pointer-events-none h-16"></div>

                        {/* Content Rendering */}
                        <div className="relative h-full overflow-y-auto custom-scrollbar">
                            {page === 0 ? <OutlineView outline={outline} /> : <NotesView notes={currentNotes} page={page} onEdit={handleNoteEdit} />}
                        </div>

                        {/* Add Button (Only on last page, Front side) */}
                        {page === maxNotePages && page !== 0 && (
                            <button 
                                onClick={addNote}
                                className="absolute bottom-6 right-6 p-4 bg-wood-dark text-amber-500 rounded-full shadow-lg hover:scale-110 transition-transform z-50 group"
                                title="Add Note"
                            >
                                <Plus size={24} />
                                <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                    New Note
                                </span>
                            </button>
                        )}
                    </div>

                    {/* === BACK FACE (Texture when flipped up) === */}
                    <div 
                        className="absolute inset-0 backface-hidden bg-[#e8e2c8] rounded-b-sm border-t border-black/10"
                        style={{ transform: 'rotateX(180deg)' }}
                    >
                         <div className="absolute inset-0 opacity-40 mix-blend-multiply bg-[url('[https://www.transparenttextures.com/patterns/cream-paper.png](https://www.transparenttextures.com/patterns/cream-paper.png)')]"></div>
                         <div className="absolute inset-0 flex items-center justify-center">
                            <span className="font-serif italic text-stone-400/50 text-sm rotate-180">
                                cloudfare ai autobiography • {new Date().getFullYear()}
                            </span>
                         </div>
                         {/* Shadow Gradient to simulate curvature when upside down */}
                         <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/10 to-transparent pointer-events-none"></div>
                    </div>

                    {/* === DYNAMIC SHADOW/CURL OVERLAY === */}
                    {/* As the page flips, this creates a 'glare' or shadow moving across the paper */}
                    <motion.div 
                        className="absolute inset-0 pointer-events-none z-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: [0, 0.4, 0], transition: { duration: 1.2 } }}
                        style={{ 
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(255,255,255,0.4) 50%, rgba(0,0,0,0) 100%)' 
                        }}
                    />
                </motion.div>
            </AnimatePresence>
        </div>
    </motion.div>
);


};

// --- SUBCOMPONENTS FOR CLEANLINESS ---

const OutlineView = ({ outline }: { outline: any }) => (
<div className="p-12 pt-10 pb-20">
<h2 className="font-serif text-3xl font-bold text-stone-800 border-b-2 border-stone-800/20 pb-4 mb-8">
{outline?.title || "Autobiography Plan"}
</h2>
<div className="space-y-8">
{outline ? outline.chapters.map((chap: any) => (
<div key={chap.index} className="relative pl-6 border-l-2 border-amber-600/30">
<h3 className="font-serif font-bold text-xl text-stone-900 mb-1">
Chapter {chap.index}: {chap.title}
</h3>
<p className="font-sans text-stone-600 leading-relaxed text-sm text-justify">
{chap.summary}
</p>
</div>
)) : (
<div className="flex flex-col items-center justify-center mt-20 gap-4">
<div className="w-8 h-8 border-4 border-amber-600/30 border-t-amber-600 rounded-full animate-spin"></div>
<div className="text-stone-400 italic font-serif">Consulting the Biographer...</div>
</div>
)}
</div>
</div>
);

const NotesView = ({ notes, page, onEdit }: { notes: NoteItem[], page: number, onEdit: (id: string, val: string) => void }) => (
<div className="relative min-h-full">
{/* Blue Lines Pattern */}
<div
className="absolute inset-0 pointer-events-none opacity-60"
style={{
backgroundImage: `linear-gradient(transparent 31px, #94a3b8 31px, #94a3b8 32px)`,
backgroundSize: `100% 32px`,
marginTop: '40px'
}}
/>
{/* Red Margin */}
<div className="absolute top-0 bottom-0 left-16 w-[2px] bg-[#e79292] h-full z-0 opacity-60 pointer-events-none"></div>

```
    <div className="relative z-10 p-10 pt-12 pl-20 pr-8">
        <h3 className="font-hand text-3xl text-blue-900/90 underline decoration-wavy decoration-[#e79292] mb-6 -ml-4 select-none">
            Field Notes (Pg {page})
        </h3>

        <ul className="list-none space-y-0 font-hand text-2xl text-blue-900/90 leading-[32px]">
            {notes.map((note) => (
                <motion.li 
                    key={note.id} 
                    layout 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative group min-h-[32px] flex items-baseline"
                >
                    <span className="absolute -left-6 top-[12px] w-1.5 h-1.5 bg-stone-400 rounded-full opacity-50"></span>
                    <div 
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => onEdit(note.id, e.currentTarget.textContent || "")}
                        className="w-full outline-none border-b border-transparent focus:bg-blue-50/50 px-1 -ml-1 rounded transition-colors empty:before:content-['...'] empty:before:text-slate-400 empty:before:italic"
                    >
                        {note.content}
                    </div>
                </motion.li>
            ))}
            {notes.length === 0 && (
                <li className="opacity-40 italic mt-2 text-xl">Tap + to add a thought...</li>
            )}
        </ul>
    </div>
</div>

);