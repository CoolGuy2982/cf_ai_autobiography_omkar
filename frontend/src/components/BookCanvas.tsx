import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark } from 'lucide-react';

interface BookCanvasProps {
    content: string;
    chapterTitle: string;
    visible: boolean;
}

export const BookCanvas: React.FC<BookCanvasProps> = ({ content, chapterTitle, visible }) => {
    // State for the bookmark interaction
    const [isBookmarked, setIsBookmarked] = useState(false);

    return (
        <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.9 }}
            animate={{ 
                y: visible ? 0 : 50, 
                opacity: visible ? 1 : 0,
                scale: visible ? 1 : 0.9,
                display: visible ? 'block' : 'none'
            }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} 
            className="w-full max-w-5xl h-[85vh] mx-auto relative perspective-2000"
        >
            {/* 1. The Leather Cover */}
            <div className="absolute -inset-3 bg-[#1B2235] rounded-md shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7)] z-0 border-t border-l border-[#2e3a59] border-b-4 border-r-4 border-[#111626]">
                <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] mix-blend-overlay rounded-md"></div>
            </div>

            {/* 2. Page Block Thickness */}
            <div className="absolute top-1 bottom-[-8px] left-[2px] right-[2px] bg-[#e3dacb] rounded-sm z-0">
                <div className="absolute inset-0 bg-gradient-to-r from-stone-400/30 via-transparent to-stone-400/20 rounded-sm"></div>
            </div>

            {/* 3. The Open Pages */}
            <div className="relative w-full h-full bg-[#fffefb] rounded-sm flex overflow-hidden shadow-inner z-10">
                
                {/* --- LEFT PAGE --- */}
                <div className="hidden lg:flex w-1/2 h-full relative flex-col border-r border-stone-200/50">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] opacity-20 mix-blend-multiply"></div>
                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-20 mix-blend-multiply" />

                    <div className="relative z-30 p-16 h-full flex flex-col items-center justify-center text-center select-none">
                        <div className="mb-8 opacity-60">
                            <span className="font-serif italic text-stone-500 text-lg">Part I</span>
                        </div>
                        
                        <h1 className="font-serif font-bold text-4xl text-stone-800 leading-tight mb-8 tracking-wide drop-shadow-sm">
                            {chapterTitle}
                        </h1>
                        
                        <div className="w-12 h-[3px] bg-[#1B2235]/80 rounded-full mb-8"></div>
                        
                        <p className="font-serif text-stone-500 italic max-w-xs leading-relaxed text-lg">
                            "Every life is a story waiting to be told. Let us begin at the beginning."
                        </p>
                    </div>

                    <div className="absolute bottom-8 left-0 right-0 text-center text-xs text-stone-400 font-serif italic">
                        14
                    </div>
                </div>

                {/* --- RIGHT PAGE --- */}
                <div className="w-full lg:w-1/2 h-full relative flex flex-col bg-[#fffefb]">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] opacity-20 mix-blend-multiply"></div>
                    <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-20 mix-blend-multiply" />
                    <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-transparent via-white/60 to-transparent pointer-events-none z-20 mix-blend-soft-light" />

                    {/* --- DYNAMIC BOOKMARK SYSTEM --- */}
                    <div className="absolute right-12 top-0 z-50">
                        <AnimatePresence>
                            {isBookmarked ? (
                                /* The Ribbon (Visible when Bookmarked) - CLEANED UP */
                                <motion.div
                                    key="ribbon"
                                    initial={{ y: -150 }}
                                    animate={{ y: 0 }}
                                    exit={{ y: -150 }}
                                    transition={{ type: "spring", stiffness: 120, damping: 15 }}
                                    className="w-10 h-32 bg-amber-600 relative rounded-b-md shadow-xl cursor-pointer hover:brightness-110 transition-all"
                                    onClick={() => setIsBookmarked(false)}
                                    title="Remove Bookmark"
                                >
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/fabric-of-squares.png')] opacity-30"></div>
                                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-black/20 to-transparent"></div>
                                </motion.div>
                            ) : (
                                /* The Icon (Visible when NOT Bookmarked) */
                                <motion.button
                                    key="icon"
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.3 }}
                                    onClick={() => setIsBookmarked(true)}
                                    className="mt-6 text-stone-300 hover:text-amber-600 hover:scale-110 transition-all"
                                    title="Bookmark this page"
                                >
                                    <Bookmark size={28} strokeWidth={1.5} />
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Writing Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 px-16 py-16">
                        <div className="font-serif text-[21px] leading-[1.9] text-stone-900/90 whitespace-pre-wrap drop-shadow-sm selection:bg-amber-100">
                            {content ? (
                                <>
                                    <span className="float-left text-7xl font-serif font-bold text-[#1B2235] mr-4 mt-[-8px] leading-none drop-shadow-sm">
                                        {content.charAt(0)}
                                    </span>
                                    {content.slice(1)}
                                </>
                            ) : (
                                <span className="text-stone-300 italic">The ink is wet, waiting for your words...</span>
                            )}
                        </div>
                    </div>

                    <div className="h-16 flex items-center justify-center text-stone-400 font-serif italic text-sm relative z-30">
                        15
                    </div>
                </div>
            </div>
        </motion.div>
    );
};