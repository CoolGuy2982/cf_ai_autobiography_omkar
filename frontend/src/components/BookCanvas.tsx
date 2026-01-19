import React, { useState } from 'react';
import { FileText, Save } from 'lucide-react';

interface BookCanvasProps {
    initialContent?: string;
    chapterTitle?: string;
}

export const BookCanvas: React.FC<BookCanvasProps> = ({ initialContent = "", chapterTitle = "Untitled Chapter" }) => {
    const [content, setContent] = useState(initialContent || "The story begins here...");

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Toolbar */}
            <div className="h-14 border-b border-slate-200 bg-white flex items-center px-4 justify-between shadow-sm z-10">
                <div className="flex items-center gap-2 text-slate-700 font-serif font-medium">
                    <FileText size={18} className="text-secondary" />
                    {chapterTitle}
                </div>
                <button className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-primary transition-colors">
                    <Save size={14} />
                    Auto-saved
                </button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto p-8 lg:p-12">
                <div className="max-w-3xl mx-auto bg-white min-h-[800px] shadow-sm border border-slate-200 p-12 rounded-sm">
                    <textarea
                        className="w-full h-full min-h-[600px] resize-none border-none focus:ring-0 text-lg leading-loose font-serif text-slate-800 placeholder:text-slate-300"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Wait for the AI to start drafting..."
                    />
                </div>
            </div>
        </div>
    );
};
