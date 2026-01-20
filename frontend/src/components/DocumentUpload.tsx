import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { API_BASE_URL } from '../utils/api';
import { FileText, Upload, CheckCircle } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface DocumentUploadProps {
    userId: string;
    onUploadComplete: () => void;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ userId, onUploadComplete }) => {
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState<File[]>([]);

    const extractText = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
        }
        return fullText;
    };

    const handleUpload = async () => {
        setUploading(true);
        try {
            for (const file of files) {
                const text = await extractText(file);
                await fetch(`${API_BASE_URL}/api/documents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, filename: file.name, text })
                });
            }
            onUploadComplete();
        } catch (e) {
            console.error(e);
            alert("Failed to upload/parse documents.");
        } finally {
            setUploading(false);
        }
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative z-10">
            <div className="w-full max-w-lg bg-[#f0eadd] p-10 rounded-sm shadow-card border-t border-white/40 relative transform rotate-1">
                {/* Folder Tab Visual */}
                <div className="absolute -top-3 left-0 w-1/3 h-4 bg-[#e6dfcf] rounded-t-sm border-t border-white/20"></div>

                <div className="relative z-10 text-ink text-center">
                    <div className="mb-8">
                        <h2 className="text-2xl font-serif font-bold text-wood-dark">The Archives</h2>
                        <p className="text-stone-500 mt-2 text-sm">Provide context for the AI biographer (Resumes, Journals, etc).</p>
                    </div>

                    <div 
                        onClick={() => document.getElementById('file-input-visible')?.click()}
                        className="border-2 border-dashed border-stone-300 bg-white/40 rounded-sm p-10 cursor-pointer hover:bg-white/60 hover:border-accent transition-all group"
                    >
                        <input
                            type="file"
                            multiple
                            accept=".pdf"
                            onChange={onFileChange}
                            className="hidden"
                            id="file-input-visible"
                        />
                        
                        {files.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 text-stone-400 group-hover:text-accent">
                                <Upload size={32} />
                                <span className="text-sm font-medium uppercase tracking-wider">Drop PDFs here</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 text-wood-dark">
                                <FileText size={32} className="text-accent" />
                                <span className="text-lg font-serif italic">{files.length} files selected</span>
                            </div>
                        )}
                    </div>

                    {uploading && (
                        <div className="mt-6 w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-accent h-full animate-pulse w-full origin-left" />
                        </div>
                    )}

                    <div className="flex gap-4 mt-10">
                        <button
                            onClick={handleUpload}
                            disabled={files.length === 0 || uploading}
                            className="flex-1 py-3 bg-wood-dark text-[#f0eadd] rounded-sm font-sans font-medium uppercase tracking-wider text-xs hover:bg-accent disabled:opacity-50 transition-colors shadow-lg"
                        >
                            {uploading ? 'Analyzing...' : 'Analyze & Begin'}
                        </button>
                        <button
                            onClick={onUploadComplete}
                            className="px-6 py-3 text-stone-400 hover:text-wood-dark font-sans text-xs font-bold uppercase tracking-wider transition-colors"
                        >
                            Skip
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};