import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import { Bookmark } from 'lucide-react';
import { cn } from '../utils/cn';

interface BookCanvasProps {
    content: string;
    chapterTitle: string;
    visible: boolean;
    isGenerating?: boolean; 
}

export const BookCanvas: React.FC<BookCanvasProps> = ({ content, chapterTitle, visible, isGenerating }) => {
    const [pages, setPages] = useState<string[]>([]);
    const [currentSpreadIndex, setCurrentSpreadIndex] = useState(-1);
    const [bookmarkedSpreads, setBookmarkedSpreads] = useState<Set<number>>(new Set());
    const [isFlipping, setIsFlipping] = useState(false);
    const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
    
    // We use a ref to track the "true" target so we can read it inside the timeout closure
    const targetSpreadRef = useRef(0);

    // === PAGINATION LOGIC ===
    useEffect(() => {
        if (!content) {
            setPages([]);
            return;
        }
        
        const paragraphs = content.split('\n\n');
        const generatedPages: string[] = [];
        let currentPageText = "";
        const CHARS_PER_PAGE = 550; 

        paragraphs.forEach(para => {
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

    // Update the Ref whenever pages change so we know where the end is
    useEffect(() => {
        const lastSpread = Math.floor((pages.length - 1) / 2) * 2;
        targetSpreadRef.current = Math.max(0, lastSpread);
    }, [pages.length]);

    // === AUTO-FLIP ON GENERATION (FIXED) ===
    useEffect(() => {
        if (!isGenerating || pages.length === 0) return;

        const target = targetSpreadRef.current;

        // If we are currently viewing an earlier spread, flip forward
        if (currentSpreadIndex < target && !isFlipping) {
            setFlipDirection('next');
            setIsFlipping(true);
            
            setTimeout(() => {
                // MAGIC FIX: Read from the ref to get the *latest* target, 
                // skipping intermediate pages if the stream was fast.
                setCurrentSpreadIndex(targetSpreadRef.current);
                setIsFlipping(false);
            }, 900); 
        }
    }, [isGenerating, pages.length, currentSpreadIndex, isFlipping]);


    const handleFlip = (dir: 'next' | 'prev') => {
        if (isFlipping) return;
        
        if (dir === 'next') {
            const nextIndex = currentSpreadIndex === -1 ? 0 : currentSpreadIndex + 2;
            if (nextIndex < pages.length) {
                setIsFlipping(true);
                setFlipDirection('next');
                setTimeout(() => {
                    setCurrentSpreadIndex(nextIndex);
                    setIsFlipping(false);
                }, 900);
            }
        }
        
        if (dir === 'prev') {
            if (currentSpreadIndex >= 0) {
                setIsFlipping(true);
                setFlipDirection('prev');
                setTimeout(() => {
                    setCurrentSpreadIndex(p => p === 0 ? -1 : p - 2);
                    setIsFlipping(false);
                }, 900);
            }
        }
    };

    const toggleBookmark = () => {
        if (currentSpreadIndex === -1) return; 
        setBookmarkedSpreads(prev => {
            const next = new Set(prev);
            if (next.has(currentSpreadIndex)) next.delete(currentSpreadIndex);
            else next.add(currentSpreadIndex);
            return next;
        });
    };

    const isCurrentBookmarked = bookmarkedSpreads.has(currentSpreadIndex);

    const MarkdownRenderer = ({ text }: { text: string }) => (
        <Markdown components={{ 
            p: ({children}) => <p className="mb-6 indent-8 text-justify">{children}</p>,
            h1: ({children}) => {
                const titleText = String(children);
                const match = titleText.match(/Chapter\s+(\d+):?\s*(.*)/i);
                if (match) {
                    return (
                        <div className="mb-10 text-center mt-4">
                            <span className="block font-sans text-xs font-bold uppercase tracking-[0.3em] text-stone-500 mb-2">Chapter {match[1]}</span>
                            <h1 className="text-3xl font-serif font-bold text-[#2c1810] leading-tight">{match[2]}</h1>
                            <div className="w-8 h-[2px] bg-orange-800/20 mx-auto mt-6"></div>
                        </div>
                    );
                }
                return <h1 className="text-3xl font-serif font-bold text-center mb-8 text-[#2c1810]">{children}</h1>
            }
        }}>
            {text}
        </Markdown>
    );

    const pageVariants = {
        initial: (dir: 'next' | 'prev') => ({ rotateY: dir === 'next' ? 0 : -180, zIndex: 50 }),
        animate: (dir: 'next' | 'prev') => ({ rotateY: dir === 'next' ? -180 : 0, transition: { duration: 0.9, ease: [0.645, 0.045, 0.355, 1.0] } }),
        exit: { opacity: 0 }
    };

    if (!visible) return null;

    const isCover = currentSpreadIndex === -1;
    const leftPageContent = pages[currentSpreadIndex] || "";
    const rightPageContent = pages[currentSpreadIndex + 1] || "";
    const nextSpreadLeft = pages[currentSpreadIndex + 2] || "";

    return (
        <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="relative w-full h-[85vh] perspective-[2500px] flex items-center justify-center overflow-visible"
        >
            <motion.div 
                className="relative h-[90%] flex transition-all duration-1000 ease-in-out shadow-[0_30px_60px_-10px_rgba(0,0,0,0.7)]"
                initial={false}
                animate={{ width: isCover ? 480 : 960, rotateX: isCover ? 0 : 5 }}
            >
                <div className={cn("absolute bg-[#1a0f0a] rounded-[6px] -z-20 transform translate-y-3 translate-x-2 shadow-2xl transition-all duration-1000", isCover ? "-inset-1" : "-inset-2")}>
                      <div className="absolute inset-0 opacity-50 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] mix-blend-overlay rounded-[6px]"></div>
                </div>
                <div className="absolute top-1 bottom-1 -right-3 w-5 bg-[#e3dacb] border-l border-[#c4b59d] -z-10 rounded-r-sm shadow-[inset_-2px_0_5px_rgba(0,0,0,0.1)]">
                    <div className="w-full h-full opacity-50 bg-[repeating-linear-gradient(transparent,transparent_1px,#d1c7b1_2px)]"></div>
                </div>

                {/* LEFT SIDE */}
                <div className={cn("h-full relative overflow-hidden transition-all duration-1000 origin-right bg-[#f4ecd8] border-r border-[#dcd1b9] rounded-l-[3px]", isCover ? "w-0 opacity-0 border-none" : "w-1/2 opacity-100")}>
                    <div className="absolute inset-0 opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply pointer-events-none"></div>
                    <div className="absolute top-0 bottom-0 right-0 w-20 bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-10"></div>
                    <div className="relative z-30 p-12 pt-16 pb-20 h-full font-serif text-[1.15rem] leading-[1.9] text-ink/90 select-none overflow-y-auto custom-scrollbar pointer-events-auto">
                        <MarkdownRenderer text={leftPageContent} />
                        <span className="sticky top-[100%] block text-center text-xs font-sans text-stone-400/50 mt-8">{currentSpreadIndex + 1}</span>
                    </div>
                    {!isFlipping && !isCover && (
                        <div onClick={() => handleFlip('prev')} className="absolute top-0 bottom-0 left-0 w-24 z-50 cursor-pointer group flex items-end justify-start pl-6 pb-8">
                            <span className="font-serif italic text-stone-400/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform -translate-x-2 group-hover:translate-x-0">Previous Page</span>
                        </div>
                    )}
                </div>

                {/* RIGHT SIDE */}
                <div className={cn("h-full relative overflow-hidden bg-[#f4ecd8] rounded-r-[3px] transition-all duration-1000", isCover ? "w-full rounded-[4px]" : "w-1/2")}>
                    {isCover ? (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-12 bg-[#1c1917] overflow-hidden rounded-[4px] shadow-inner">
                            <div className="absolute inset-0 opacity-60 mix-blend-overlay pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E")` }}></div>
                            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>
                            <div className="relative z-10 border-[1px] border-orange-500/30 p-1 w-full h-full flex flex-col items-center justify-center">
                                <div className="border-[2px] border-orange-600/20 w-full h-full flex flex-col items-center justify-center p-8">
                                    <h1 className="text-5xl font-serif font-bold text-[#e7e5e4] tracking-wide mb-6 drop-shadow-2xl">{chapterTitle}</h1>
                                    <div className="w-12 h-1 bg-orange-700/60 mb-6"></div>
                                    <p className="text-[#78716c] font-sans text-xs uppercase tracking-[0.4em]">Autobiography</p>
                                    <button onClick={() => handleFlip('next')} className="mt-24 group relative px-8 py-3 bg-transparent border border-orange-700/50 text-orange-600 font-sans font-bold uppercase tracking-wider text-[10px] hover:bg-orange-900/20 transition-all cursor-pointer">
                                        Open Book
                                        <div className="absolute inset-0 border border-orange-500/20 scale-105 opacity-0 group-hover:opacity-100 transition-all"></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="absolute inset-0 opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply pointer-events-none"></div>
                            <div className="absolute top-0 bottom-0 left-0 w-20 bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-10"></div>
                            {!isCurrentBookmarked && (
                                <div className="absolute top-6 right-6 z-40">
                                    <button onClick={toggleBookmark} className="text-stone-400 hover:text-orange-600 transition-colors duration-300" title="Bookmark this page">
                                        <Bookmark size={22} strokeWidth={1.5} />
                                    </button>
                                </div>
                            )}
                            <AnimatePresence>
                                {isCurrentBookmarked && (
                                    <motion.div initial={{ height: 0 }} animate={{ height: 140 }} exit={{ height: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} onClick={toggleBookmark} className="absolute top-0 right-8 w-8 bg-orange-600 shadow-md z-40 origin-top cursor-pointer hover:bg-orange-700 transition-colors" title="Remove Bookmark">
                                        <div className="absolute -bottom-3 left-0 right-0 h-3 bg-orange-600 group-hover:bg-orange-700 transition-colors" style={{ clipPath: 'polygon(0 0, 50% 100%, 100% 0)' }} />
                                        <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10 pointer-events-none"></div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div className="relative z-30 p-12 pt-16 pb-20 h-full font-serif text-[1.15rem] leading-[1.9] text-ink/90 select-none group overflow-y-auto custom-scrollbar pointer-events-auto">
                                <MarkdownRenderer text={isFlipping && flipDirection === 'next' ? nextSpreadLeft : rightPageContent} />
                                <span className="sticky top-[100%] block text-center text-xs font-sans text-stone-400/50 mt-8">{currentSpreadIndex + 2}</span>
                            </div>
                            {!isFlipping && currentSpreadIndex < pages.length - 2 && (
                                <div onClick={() => handleFlip('next')} className="absolute bottom-0 right-0 w-32 h-32 z-50 cursor-pointer group overflow-hidden">
                                    <div className="absolute bottom-0 right-0 w-full h-full bg-gradient-to-tl from-[#dbd2c2] to-[#e3dacb] shadow-[-3px_-3px_10px_rgba(0,0,0,0.15)] transition-all duration-300 ease-out origin-bottom-right scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}>
                                        <div className="absolute bottom-6 right-6 text-[#8a3c3c] font-sans text-[11px] font-bold uppercase tracking-widest -rotate-45">Next</div>
                                    </div>
                                    <div className="absolute bottom-0 right-0 w-20 h-20 bg-transparent"></div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <AnimatePresence custom={flipDirection} mode="popLayout">
                    {isFlipping && (
                        <motion.div key={currentSpreadIndex} custom={flipDirection} variants={pageVariants} initial="initial" animate="animate" exit="exit" className="absolute top-0 bottom-0 left-1/2 w-1/2 h-full bg-[#f4ecd8] origin-left z-40 rounded-r-[3px] backface-visible" style={{ transformStyle: 'preserve-3d' }}>
                            <div className={cn("absolute inset-0 backface-hidden z-20 overflow-hidden", isCover && flipDirection === 'next' ? "bg-[#1c1917]" : "bg-[#f4ecd8] rounded-r-[3px]")}>
                                {isCover && flipDirection === 'next' ? (
                                    <div className="w-full h-full bg-[#1c1917] relative">
                                        <div className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E")` }}></div>
                                        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white/10 to-transparent"></div>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                                            <div className="border-[1px] border-orange-500/30 p-1 w-full h-full flex flex-col items-center justify-center">
                                                <div className="border-[2px] border-orange-600/20 w-full h-full flex flex-col items-center justify-center p-8">
                                                     <h1 className="text-5xl font-serif font-bold text-[#e7e5e4] tracking-wide mb-6 drop-shadow-2xl">{chapterTitle}</h1>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="absolute inset-0 opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply"></div>
                                        <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-black/10 to-transparent"></div>
                                        <div className="p-12 pt-16 h-full font-serif text-[1.15rem] leading-[1.9] text-ink/90 overflow-hidden">
                                            <MarkdownRenderer text={flipDirection === 'next' ? rightPageContent : leftPageContent} />
                                        </div>
                                    </>
                                )}
                                <motion.div className="absolute inset-0 pointer-events-none z-30" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.4, 0], background: ["linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 100%)", "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)", "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.2) 100%)"] }} transition={{ duration: 0.9 }} />
                            </div>
                            <div className="absolute inset-0 backface-hidden z-10 bg-[#f0e6d2] rounded-l-[3px] overflow-hidden" style={{ transform: 'rotateY(180deg)' }}>
                                <div className="absolute inset-0 opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply"></div>
                                <div className="absolute top-0 bottom-0 right-20 bg-gradient-to-l from-black/10 to-transparent"></div>
                                <div className="p-12 pt-16 h-full font-serif text-[1.15rem] leading-[1.9] text-ink/90 select-none overflow-hidden">
                                    <MarkdownRenderer text={flipDirection === 'next' ? pages[currentSpreadIndex + 2] : pages[currentSpreadIndex - 1]} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
};