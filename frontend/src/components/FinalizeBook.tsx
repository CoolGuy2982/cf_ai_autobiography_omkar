import React from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import Markdown from 'react-markdown';

interface FinalizeBookProps {
    manuscript: string;
    bookTitle: string;
    onBack: () => void;
}

export const FinalizeBook: React.FC<FinalizeBookProps> = ({ manuscript, bookTitle, onBack }) => {
    
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-[#f5f2eb] text-[#1c1917] font-serif relative overflow-auto">
            {/* Navigation Header (Hidden on Print) */}
            <div className="fixed top-0 left-0 right-0 h-16 bg-[#1c1917] text-[#f5f2eb] flex items-center justify-between px-8 z-50 print:hidden shadow-md">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 hover:text-[#d97706] transition-colors font-sans text-sm font-bold uppercase tracking-wider"
                >
                    <ArrowLeft size={18} /> Back to Studio
                </button>
                <h1 className="font-serif font-bold text-xl">{bookTitle}</h1>
                <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-[#d97706] text-white px-6 py-2 rounded-sm hover:bg-[#b45309] transition-colors font-sans text-xs font-bold uppercase tracking-wider shadow-lg"
                >
                    <Download size={16} /> Export PDF
                </button>
            </div>

            {/* Book Content (Printable Area) */}
            <div className="max-w-3xl mx-auto pt-32 pb-32 px-12 print:p-0 print:max-w-none">
                {/* Title Page */}
                <div className="min-h-[80vh] flex flex-col justify-center items-center text-center mb-24 print:break-after-page print:min-h-screen print:justify-center">
                    <h1 className="text-6xl font-bold mb-8 leading-tight">{bookTitle}</h1>
                    <div className="w-24 h-1 bg-[#d97706] mb-8"></div>
                    <p className="text-xl italic text-[#57534e]">An Autobiography</p>
                </div>

                {/* Chapters */}
                <div className="prose prose-lg prose-stone max-w-none leading-relaxed text-justify">
                    <Markdown components={{
                        h1: ({children}) => {
                            const text = String(children);
                            const match = text.match(/Chapter\s+(\d+):?\s*(.*)/i);
                            if (match) {
                                return (
                                    <div className="break-before-page mt-24 mb-12 text-center">
                                        <span className="block font-sans text-sm font-bold uppercase tracking-[0.3em] text-[#78716c] mb-4">
                                            Chapter {match[1]}
                                        </span>
                                        <h2 className="text-4xl font-bold text-[#1c1917] leading-tight">
                                            {match[2]}
                                        </h2>
                                    </div>
                                );
                            }
                            return <h2 className="text-3xl font-bold mt-16 mb-8 text-center">{children}</h2>;
                        },
                        p: ({children}) => <p className="mb-6 indent-8">{children}</p>
                    }}>
                        {manuscript}
                    </Markdown>
                </div>
                
                <div className="mt-32 text-center text-sm text-[#78716c] italic print:hidden">
                    — End of Manuscript —
                </div>
            </div>

            {/* Print Styles */}
            <style>{`
                @media print {
                    @page { margin: 2cm; }
                    body { background: white; }
                    .print\\:hidden { display: none !important; }
                    .print\\:break-after-page { break-after: page; }
                    .print\\:min-h-screen { min-height: 100vh; }
                }
            `}</style>
        </div>
    );
};