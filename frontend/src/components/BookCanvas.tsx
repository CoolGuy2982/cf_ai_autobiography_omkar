import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import Markdown from 'react-markdown';

interface BookCanvasProps {
    content: string;
    chapterTitle: string;
    visible: boolean;
}

export const BookCanvas: React.FC<BookCanvasProps> = ({ content, chapterTitle, visible }) => {
    const [pages, setPages] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [isFlipping, setIsFlipping] = useState(false);

    // Simple Pagination Logic
    useEffect(() => {
        if (!content) {
            setPages([]);
            return;
        }
        
        // Split by paragraphs
        const paragraphs = content.split('\n\n');
        const generatedPages: string[] = [];
        let currentPageText = "";
        const CHARS_PER_PAGE = 1200;

        paragraphs.forEach(para => {
            if ((currentPageText.length + para.length) > CHARS_PER_PAGE) {
                generatedPages.push(currentPageText);
                currentPageText = para + "\n\n";
            } else {
                currentPageText += para + "\n\n";
            }
        });
        if (currentPageText) generatedPages.push(currentPageText);
        
        setPages(generatedPages);
        // If content updates, stay on page unless new content pushes us forward
        if (currentPage >= generatedPages.length) setCurrentPage(Math.max(0, generatedPages.length - 1));

    }, [content]);

    const handleFlip = (dir: 'next' | 'prev') => {
        if (isFlipping) return;
        if (dir === 'next' && currentPage < pages.length - 1) {
            setIsFlipping(true);
            setCurrentPage(p => p + 1);
            setTimeout(() => setIsFlipping(false), 600);
        }
        if (dir === 'prev' && currentPage > 0) {
            setIsFlipping(true);
            setCurrentPage(p => p - 1);
            setTimeout(() => setIsFlipping(false), 600);
        }
    };

    return (
        <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.9 }}
            animate={{ 
                y: visible ? 0 : 50, 
                opacity: visible ? 1 : 0,
                scale: visible ? 1 : 0.9,
                display: visible ? 'block' : 'none'
            }}
            transition={{ duration: 0.8 }} 
            className="w-full max-w-5xl h-[85vh] mx-auto relative perspective-2000"
        >
            {/* Book Cover / Spine */}
            <div className="absolute -inset-3 bg-[#1B2235] rounded-md shadow-book z-0 border-t border-l border-[#2e3a59] border-b-4 border-r-4 border-[#111626]">
                <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] mix-blend-overlay rounded-md"></div>
            </div>

            {/* Page Block (Static Background Page) */}
            <div className="absolute top-1 bottom-1 left-2 right-2 bg-[#fffefb] rounded-sm shadow-inner z-10 flex">
                <div className="w-1/2 h-full border-r border-stone-200/50 relative">
                     {/* Left page content (Previous page if flipped) */}
                     {currentPage > 0 && (
                        <div className="p-16 h-full font-serif text-[19px] leading-[1.8] text-stone-900/40 select-none overflow-hidden">
                            <Markdown>{pages[currentPage - 1]}</Markdown>
                        </div>
                     )}
                </div>
                <div className="w-1/2 h-full relative">
                     {/* Right page content (Next page if exists) */}
                     {currentPage < pages.length - 1 && (
                        <div className="p-16 h-full font-serif text-[19px] leading-[1.8] text-stone-900/40 select-none overflow-hidden">
                            <Markdown>{pages[currentPage + 1]}</Markdown>
                        </div>
                     )}
                </div>
            </div>

            {/* FLIPPING PAGE */}
            <AnimatePresence initial={false} mode="wait">
                <motion.div 
                    key={currentPage}
                    initial={{ rotateY: -90, transformOrigin: 'left center', zIndex: 50 }}
                    animate={{ rotateY: 0, zIndex: 20 }}
                    exit={{ rotateY: -180, zIndex: 50, transition: { duration: 0.6 } }} // Flip to left
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                    className="absolute top-1 bottom-1 left-[50%] right-2 bg-[#fffefb] rounded-r-sm shadow-md overflow-hidden origin-left backface-hidden"
                    style={{ transformStyle: 'preserve-3d' }}
                >
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] opacity-20 mix-blend-multiply"></div>
                    
                    {/* Page Content */}
                    <div className="p-16 h-full flex flex-col relative z-20">
                        <div className="flex-1 overflow-hidden">
                            {pages.length > 0 ? (
                                <div className="font-serif text-[19px] leading-[1.8] text-stone-900">
                                    {currentPage === 0 && (
                                        <h1 className="text-3xl font-bold mb-6 text-center">{chapterTitle}</h1>
                                    )}
                                    <Markdown components={{
                                        p: ({children}) => <p className="mb-4 text-justify indent-8">{children}</p>
                                    }}>
                                        {pages[currentPage]}
                                    </Markdown>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-stone-400 italic">
                                    The pages are empty, waiting for the story to unfold...
                                </div>
                            )}
                        </div>
                        <div className="mt-4 text-center text-xs text-stone-400 font-serif italic">
                            Page {currentPage + 1}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Navigation Controls */}
            <div className="absolute -bottom-16 left-0 right-0 flex justify-center gap-8 text-stone-400 z-50">
                <button 
                    onClick={() => handleFlip('prev')}
                    disabled={currentPage === 0 || isFlipping}
                    className="p-3 hover:text-white disabled:opacity-30 transition-colors bg-white/5 rounded-full"
                >
                    <ChevronLeft />
                </button>
                <span className="py-3 font-serif">
                    {pages.length > 0 ? `${currentPage + 1} / ${pages.length}` : "Cover"}
                </span>
                <button 
                    onClick={() => handleFlip('next')}
                    disabled={currentPage >= pages.length - 1 || isFlipping}
                    className="p-3 hover:text-white disabled:opacity-30 transition-colors bg-white/5 rounded-full"
                >
                    <ChevronRight />
                </button>
            </div>
        </motion.div>
    );
};