import React, { useState } from 'react';
import { FileText, Save } from 'lucide-react';

interface BookCanvasProps {
    initialContent?: string;
    chapterTitle?: string;
}

export const BookCanvas: React.FC<BookCanvasProps> = ({ initialContent = "", chapterTitle = "Untitled Chapter" }) => {
    const [content, setContent] = useState(initialContent || "The story begins here...");

    return (
        <div className="flex flex-col h-full bg-[#f5f5f7]"> {/* Apple-like light gray background */}
            {/* Toolbar - Glassmorphism */}
            <div className="h-14 border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 px-6 flex items-center justify-between z-20 transition-all duration-300">
                <div className="flex items-center gap-3 text-slate-800">
                    <div className="p-1.5 bg-secondary/10 rounded-lg text-secondary">
                        <FileText size={16} />
                    </div>
                    <span className="font-medium tracking-tight text-sm">{chapterTitle}</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-400 font-medium tracking-wide uppercase">
                        {content.split(/\s+/).filter(w => w.length > 0).length} words
                    </span>
                    <button className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-primary transition-colors px-3 py-1.5 rounded-full hover:bg-slate-100">
                        <Save size={14} />
                        <span className="uppercase tracking-wider">Saved</span>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto relative custom-scrollbar">
                <div className="max-w-[700px] mx-auto my-12 relative px-4 sm:px-0">
                    {/* Paper Sheet */}
                    <div className="bg-white min-h-[850px] shadow-[0_2px_40px_-12px_rgba(0,0,0,0.1)] rounded-sm p-16 transition-shadow duration-500 hover:shadow-[0_8px_60px_-12px_rgba(0,0,0,0.12)]">
                        <textarea
                            className="w-full h-full min-h-[700px] resize-none border-none focus:ring-0 text-[17px] leading-[1.8] font-serif text-slate-800 placeholder:text-slate-300 selection:bg-secondary/20 outline-none"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Your story begins here..."
                            spellCheck={false}
                            style={{ fontFamily: '"New York", "Georgia", "Times New Roman", serif' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
