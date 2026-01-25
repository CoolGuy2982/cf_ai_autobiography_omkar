import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import { Bookmark, ChevronLeft } from 'lucide-react';
import { cn } from '../utils/cn';

interface BookCanvasProps {
    content: string;
    chapterTitle: string;
    visible: boolean;
    isGenerating?: boolean; 
}

export const BookCanvas: React.FC<BookCanvasProps> = ({ content, chapterTitle, visible, isGenerating }) => {
    // Content State
    const [pages, setPages] = useState<string[]>([]);
    
    // View State
    const [isCover, setIsCover] = useState(true);
    const [currentSpreadIndex, setCurrentSpreadIndex] = useState(-1); // -1 = Inside Cover Left
    const [bookmarkedSpreads, setBookmarkedSpreads] = useState<Set<number>>(new Set());
    
    // Animation State
    const [isFlipping, setIsFlipping] = useState(false);
    const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
    
    const targetSpreadRef = useRef(0);

    // === 1. PARSE & PAGINATE CONTENT ===
    useEffect(() => {
        if (!content) {
            setPages([]);
            return;
        }
        
        const paragraphs = content.split('\n\n');
        const generatedPages: string[] = [];
        let currentPageText = "";
        const CHARS_PER_PAGE = 480; // Optimized for 6x9 feel

        paragraphs.forEach(para => {
            // Force break on Chapter headers
            const isChapterHeader = /^(#+\s*)?Chapter\s+\d+/i.test(para);

            if (isChapterHeader) {
                if (currentPageText.trim().length > 0) {
                    generatedPages.push(currentPageText);
                    currentPageText = "";
                }
                currentPageText = para + "\n\n";
                return;
            }

            if ((currentPageText.length + para.length) > CHARS_PER_PAGE) {
                if (para.length > CHARS_PER_PAGE) {
                    // Split long paragraphs
                    if (currentPageText.length > 0) {
                        generatedPages.push(currentPageText);
                        currentPageText = "";
                    }
                    let remaining = para;
                    while (remaining.length > 0) {
                        let sliceLimit = CHARS_PER_PAGE;
                        if (remaining.length > sliceLimit) {
                            const lastPeriod = remaining.lastIndexOf('.', sliceLimit);
                            const lastSpace = remaining.lastIndexOf(' ', sliceLimit);
                            if (lastPeriod > sliceLimit * 0.7) sliceLimit = lastPeriod + 1;
                            else if (lastSpace > sliceLimit * 0.7) sliceLimit = lastSpace;
                        }
                        generatedPages.push(remaining.slice(0, sliceLimit));
                        remaining = remaining.slice(sliceLimit).trim();
                    }
                } else {
                    generatedPages.push(currentPageText);
                    currentPageText = para + "\n\n";
                }
            } else {
                currentPageText += para + "\n\n";
            }
        });

        if (currentPageText.trim().length > 0) generatedPages.push(currentPageText);
        setPages(generatedPages);
    }, [content]);

    useEffect(() => {
        // Auto-calculate target spread based on content length
        const lastSpread = Math.floor((pages.length - 1) / 2) * 2 - 1; 
        targetSpreadRef.current = Math.max(-1, lastSpread);
    }, [pages.length]);

    // === 2. AUTO-FLIP ON GENERATION ===
    useEffect(() => {
        if (!isGenerating || pages.length === 0 || isFlipping) return;

        // If we are on cover, open it
        if (isCover) {
            setIsCover(false);
            return;
        }

        const target = targetSpreadRef.current;
        if (currentSpreadIndex < target) {
            handleFlip('next');
        }
    }, [isGenerating, pages.length, currentSpreadIndex, isFlipping, isCover]);

    const handleFlip = (dir: 'next' | 'prev') => {
        if (isFlipping) return;
        
        if (dir === 'next') {
            if (isCover) {
                setIsCover(false); // Open Book
            } else {
                const nextIndex = currentSpreadIndex + 2;
                if (nextIndex < pages.length) {
                    setIsFlipping(true);
                    setFlipDirection('next');
                    setTimeout(() => {
                        setCurrentSpreadIndex(nextIndex);
                        setIsFlipping(false);
                    }, 900);
                }
            }
        } else {
            // Prev
            if (currentSpreadIndex === -1) {
                setIsCover(true); // Close Book
            } else {
                setIsFlipping(true);
                setFlipDirection('prev');
                setTimeout(() => {
                    setCurrentSpreadIndex(currentSpreadIndex - 2);
                    setIsFlipping(false);
                }, 900);
            }
        }
    };

    const toggleBookmark = () => {
        setBookmarkedSpreads(prev => {
            const next = new Set(prev);
            if (next.has(currentSpreadIndex)) next.delete(currentSpreadIndex);
            else next.add(currentSpreadIndex);
            return next;
        });
    };

    // === 3. CONTENT RENDERERS ===
    
    // Determining what is visible on the STATIC piles
    // Right Pile: If flipping next, we see the page *under* the one moving.
    const staticRightIndex = isFlipping && flipDirection === 'next' ? currentSpreadIndex + 3 : currentSpreadIndex + 1;
    const staticRightContent = pages[staticRightIndex] || "";

    // Left Pile: If flipping prev, we see the page *under* the one moving.
    const staticLeftIndex = isFlipping && flipDirection === 'prev' ? currentSpreadIndex - 2 : currentSpreadIndex;
    const staticLeftContent = pages[staticLeftIndex] || "";
    // Important: Only show left paper stack if we are past the inside cover (index >= 0)
    const showLeftStatic = staticLeftIndex >= 0;

    // Flipper Content
    const flipFrontContent = flipDirection === 'next' ? (pages[currentSpreadIndex + 1] || "") : (pages[currentSpreadIndex - 1] || "");
    const flipBackContent  = flipDirection === 'next' ? (pages[currentSpreadIndex + 2] || "") : (pages[currentSpreadIndex] || "");

    const MarkdownRenderer = ({ text }: { text: string }) => (
        <Markdown components={{ 
            p: ({children}) => <p className="mb-5 indent-6 text-justify leading-relaxed text-[1.05rem] text-[#2c1810]/90">{children}</p>,
            h1: ({children}) => {
                const titleText = String(children);
                const match = titleText.match(/Chapter\s+(\d+):?\s*(.*)/i);
                if (match) {
                    return (
                        <div className="mb-12 text-center mt-6">
                            <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500 mb-4">Chapter {match[1]}</span>
                            <h1 className="text-3xl font-serif font-bold text-[#2c1810] leading-tight">{match[2]}</h1>
                            <div className="w-8 h-[2px] bg-orange-900/10 mx-auto mt-6"></div>
                        </div>
                    );
                }
                return <h1 className="text-3xl font-serif font-bold text-center mb-8 text-[#2c1810]">{children}</h1>
            }
        }}>
            {text}
        </Markdown>
    );

    const pageFlipVariants = {
        initial: (dir: 'next' | 'prev') => ({ 
            rotateY: dir === 'next' ? 0 : -180, 
            zIndex: 50 
        }),
        animate: (dir: 'next' | 'prev') => ({ 
            rotateY: dir === 'next' ? -180 : 0, 
            transition: { duration: 0.9, ease: [0.645, 0.045, 0.355, 1.0] } 
        }),
        exit: { opacity: 0, transition: { duration: 0 } }
    };

    if (!visible) return null;

    return (
        <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative w-full h-[85vh] perspective-[2500px] flex items-center justify-center overflow-visible"
        >
            {/* 
              === THE BOOK ASSEMBLY === 
              Logic: The container is 480px wide (Single Page width).
              - CLOSED: We want the Cover centered. Since container is centered, x=0 works.
              - OPEN: We want the SPINE centered. The Spine is the LEFT edge of this container.
                Currently, the Left Edge is at (ViewportWidth - 480) / 2.
                We want Left Edge at ViewportWidth / 2.
                Difference = +240px.
                So we translate x by 240px.
            */}
            <motion.div 
                className="relative h-[90%] w-[480px]"
                animate={{ x: isCover ? 0 : 240 }} 
                transition={{ type: "spring", stiffness: 45, damping: 14, mass: 1.0 }}
            >
                
                {/* === RIGHT STATIC BLOCK (Future Pages) === */}
                <div className="absolute top-0 left-0 w-full h-full z-0">
                    <div className="relative w-full h-full bg-[#f4ecd8] rounded-r-[4px] shadow-[10px_10px_30px_rgba(0,0,0,0.3)] overflow-hidden">
                        {/* Texture */}
                        <div className="absolute inset-0 opacity-[0.06] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply pointer-events-none"></div>
                        <div className="absolute top-0 bottom-0 left-0 w-12 bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-10"></div>
                        
                        {!isCover && (
                            <>
                                <div className="p-10 pt-16 h-full font-serif text-ink/90 overflow-y-auto custom-scrollbar">
                                    <MarkdownRenderer text={staticRightContent} />
                                    <span className="sticky top-[100%] block text-center text-xs font-sans text-stone-400/50 mt-8">
                                        {staticRightIndex + 1}
                                    </span>
                                </div>
                                {/* BOOKMARK UI */}
                                <div className="absolute top-0 right-8 z-30">
                                    <AnimatePresence>
                                        {bookmarkedSpreads.has(currentSpreadIndex) && (
                                            <motion.div 
                                                initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }} 
                                                className="w-8 h-16 bg-orange-600 shadow-md flex items-end justify-center pb-2 cursor-pointer hover:bg-orange-700 transition-colors"
                                                onClick={toggleBookmark}
                                                style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)' }}
                                            />
                                        )}
                                    </AnimatePresence>
                                    {!bookmarkedSpreads.has(currentSpreadIndex) && (
                                         <Bookmark className="absolute top-6 right-0 text-stone-300 hover:text-orange-400 cursor-pointer transition-colors opacity-50 hover:opacity-100" onClick={toggleBookmark} />
                                    )}
                                </div>
                            </>
                        )}

                        {/* CLICKABLE NAVIGATION AREA (RIGHT) */}
                        {!isFlipping && !isCover && (
                            <div onClick={() => handleFlip('next')} className="absolute inset-y-0 right-0 w-16 cursor-pointer z-50 group">
                                <div className="absolute inset-y-0 right-0 w-full bg-gradient-to-l from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                        )}
                        {/* PEEL EFFECT */}
                        {!isFlipping && !isCover && currentSpreadIndex < pages.length - 1 && (
                             <div onClick={() => handleFlip('next')} className="absolute bottom-0 right-0 w-24 h-24 z-50 cursor-pointer group overflow-hidden pointer-events-none">
                                <div 
                                    className="absolute bottom-0 right-0 w-full h-full bg-gradient-to-tl from-[#dbd2c2] to-[#e3dacb] shadow-[-2px_-2px_8px_rgba(0,0,0,0.15)] transition-all duration-300 ease-out origin-bottom-right scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100" 
                                    style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}
                                />
                             </div>
                        )}
                    </div>
                    {/* Thickness */}
                    {!isCover && (
                         <div className="absolute top-1 bottom-1 -right-2 w-4 bg-[#e3dacb] border-l border-[#c4b59d] rounded-r-sm z-[-1] shadow-sm">
                            <div className="w-full h-full opacity-50 bg-[repeating-linear-gradient(transparent,transparent_1px,#d1c7b1_2px)]"></div>
                         </div>
                    )}
                </div>


                {/* === LEFT STATIC BLOCK (Past Pages) === */}
                {/* 
                   Visible ONLY when open. 
                   We hide this block if `showLeftStatic` is false (i.e. we are at the beginning).
                   This reveals the "Inside Cover" which sits behind it.
                */}
                <motion.div 
                    className="absolute top-0 left-0 w-full h-full origin-left"
                    initial={{ rotateY: -180 }}
                    animate={{ rotateY: -180 }}
                    style={{ 
                        zIndex: 10, 
                        transformStyle: 'preserve-3d', 
                        // IMPORTANT: If we are on first spread, hide this paper stack to show marbled cover
                        opacity: (!isCover && showLeftStatic) ? 1 : 0 
                    }}
                >
                    <div 
                        className="absolute inset-0 backface-hidden bg-[#f4ecd8] rounded-l-[4px] shadow-[inset_-5px_0_15px_rgba(0,0,0,0.05)] overflow-hidden" 
                        style={{ transform: 'rotateY(180deg)' }} // Content correction
                    >
                         <div className="absolute inset-0 opacity-[0.06] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply pointer-events-none"></div>
                         <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-10"></div>
                         
                         {!isCover && (
                             <div className="p-10 pt-16 h-full font-serif text-ink/90 overflow-y-auto custom-scrollbar">
                                <MarkdownRenderer text={staticLeftContent} />
                                <span className="sticky top-[100%] block text-center text-xs font-sans text-stone-400/50 mt-8">
                                    {staticLeftIndex + 1}
                                </span>
                             </div>
                         )}

                         {/* CLICKABLE NAVIGATION AREA (LEFT) */}
                         {!isFlipping && !isCover && (
                            <div onClick={() => handleFlip('prev')} className="absolute inset-y-0 left-0 w-16 cursor-pointer z-50 group">
                                <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                        )}

                        {/* PEEL EFFECT */}
                        {!isFlipping && !isCover && (
                             <div onClick={() => handleFlip('prev')} className="absolute bottom-0 left-0 w-24 h-24 z-50 cursor-pointer group overflow-hidden pointer-events-none">
                                <div 
                                    className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-tr from-[#dbd2c2] to-[#e3dacb] shadow-[-2px_-2px_8px_rgba(0,0,0,0.15)] transition-all duration-300 ease-out origin-bottom-left scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100" 
                                    style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }}
                                />
                             </div>
                        )}
                    </div>
                </motion.div>


                {/* === COVER BLOCK (Case) === */}
                {/* 
                   Rotates 0 -> -180.
                   When 0 (Closed): Acts as Front Cover.
                   When -180 (Open): Acts as Inside Cover (Marbled).
                   Z-Index Logic: When closed, z=50 (on top). When open, z=0 (behind left pages).
                */}
                <motion.div 
                    className="absolute top-0 left-0 w-full h-full origin-left"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{ 
                        rotateY: isCover ? 0 : -180,
                        zIndex: isCover ? 50 : 0
                    }}
                    transition={{ 
                        rotateY: { duration: 1.2, ease: [0.2, 0.8, 0.2, 1] },
                        zIndex: { delay: isCover ? 0 : 0.6 } // Swap z-index halfway through opening
                    }}
                >
                    {/* FRONT OF COVER */}
                    <div 
                        className="absolute inset-0 bg-[#1c1917] rounded-r-[4px] shadow-[-2px_0_10px_rgba(0,0,0,0.5)] border-l border-white/10 overflow-hidden"
                        style={{ backfaceVisibility: 'hidden' }}
                    >
                        <div className="absolute inset-0 opacity-60 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] mix-blend-overlay"></div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                             <div className="border-[1px] border-orange-500/30 p-1 w-full h-full flex flex-col items-center justify-center">
                                <div className="border-[2px] border-orange-600/20 w-full h-full flex flex-col items-center justify-center p-8">
                                    <h1 className="text-5xl font-serif font-bold text-[#e7e5e4] tracking-wide mb-6 drop-shadow-2xl">{chapterTitle}</h1>
                                    <div className="w-12 h-1 bg-orange-700/60 mb-6"></div>
                                    <p className="text-[#78716c] font-sans text-xs uppercase tracking-[0.4em]">Autobiography</p>
                                    
                                    <button 
                                        onClick={() => handleFlip('next')} 
                                        className="mt-24 px-8 py-3 border border-orange-700/50 text-orange-600 font-sans font-bold uppercase tracking-wider text-[10px] hover:bg-orange-900/20 transition-all cursor-pointer"
                                    >
                                        Open Book
                                    </button>
                                </div>
                             </div>
                        </div>
                        {/* Spine Shine */}
                        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white/20 to-transparent"></div>
                    </div>

                    {/* INSIDE OF COVER (Back Face) */}
                    {/* Only visible when Book is Open and on the first spread */}
                    <div 
                        className="absolute inset-0 bg-[#2a2320] rounded-l-[4px] shadow-[inset_-5px_0_15px_rgba(0,0,0,0.3)] overflow-hidden" 
                        style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
                        onClick={() => handleFlip('prev')} // Clicking inside cover closes book
                    >
                         {/* Marbled Texture */}
                         <div className="absolute inset-0 opacity-40 mix-blend-screen" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")` }}></div>
                         <div className="absolute top-0 bottom-0 right-0 w-12 bg-gradient-to-l from-black/40 to-transparent pointer-events-none z-10"></div>
                         
                         <div className="flex items-center justify-center h-full cursor-pointer group">
                             <div className="w-2/3 h-1/2 bg-[#f4ecd8] shadow-lg flex flex-col items-center justify-center p-8 text-center rotate-1 relative transition-transform group-hover:scale-[1.02]">
                                 <div className="absolute inset-0 border border-double border-stone-300 m-2"></div>
                                 <p className="font-serif italic text-stone-800 text-lg mb-2">Ex Libris</p>
                                 <div className="w-16 h-[1px] bg-stone-400 my-4"></div>
                                 <p className="font-serif font-bold text-xl text-stone-900 leading-tight">{chapterTitle}</p>
                             </div>
                         </div>
                    </div>
                </motion.div>


                {/* === DYNAMIC PAGE ANIMATION LAYER === */}
                <AnimatePresence custom={flipDirection}>
                    {isFlipping && (
                        <motion.div 
                            key="flipping-page"
                            custom={flipDirection} 
                            variants={pageFlipVariants} 
                            initial="initial" 
                            animate="animate" 
                            exit="exit" 
                            className="absolute top-0 left-0 w-full h-full origin-left z-50 pointer-events-none"
                            style={{ transformStyle: 'preserve-3d' }}
                        >
                            {/* FRONT (Recto) */}
                            <div 
                                className={cn("absolute inset-0 bg-[#f4ecd8] overflow-hidden", flipDirection === 'next' ? "rounded-r-[4px]" : "rounded-l-[4px]")}
                                style={{ backfaceVisibility: 'hidden' }}
                            >
                                <div className="absolute inset-0 opacity-[0.06] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply"></div>
                                <motion.div 
                                    className="absolute inset-0 z-20 pointer-events-none"
                                    initial={{ background: "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 100%)" }}
                                    animate={{ background: ["linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 100%)", "linear-gradient(90deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 100%)"] }}
                                    transition={{ duration: 0.9 }}
                                />
                                <div className="p-10 pt-16 h-full font-serif text-ink/90 overflow-hidden">
                                    <MarkdownRenderer text={flipFrontContent} />
                                </div>
                            </div>

                            {/* BACK (Verso) */}
                            <div 
                                className={cn("absolute inset-0 bg-[#f4ecd8] overflow-hidden", flipDirection === 'next' ? "rounded-l-[4px]" : "rounded-r-[4px]")}
                                style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
                            >
                                <div className="absolute inset-0 opacity-[0.06] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply"></div>
                                <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-black/10 to-transparent z-10"></div>
                                <div className="p-10 pt-16 h-full font-serif text-ink/90 overflow-hidden">
                                    <MarkdownRenderer text={flipBackContent} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </motion.div>
        </motion.div>
    );
};