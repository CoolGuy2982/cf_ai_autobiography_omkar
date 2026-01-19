import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { API_BASE_URL } from '../utils/api';

// Set PDF worker
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
                // Send to Backend
                await fetch(`${API_BASE_URL}/api/documents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        filename: file.name,
                        text
                    })
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
        <div className="p-8 bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full mx-auto mt-10">
            <h2 className="text-2xl font-bold text-primary mb-4">Upload Context</h2>
            <p className="text-secondary mb-6">Upload up to 10 PDFs (Resumes, Journals, etc) to give the AI context.</p>

            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors">
                <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={onFileChange}
                    className="hidden"
                    id="file-input-visible"
                />
                <p className="text-sm text-slate-500">
                    {files.length > 0 ? `${files.length} files selected` : 'Drag & drop or Click to select'}
                </p>
                {uploading && (
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-4">
                        <div className="bg-primary h-full transition-all duration-300 animate-pulse" style={{ width: `100%` }} />
                    </div>
                )}
            </div>

            <div className="flex gap-4 mt-6">
                <button
                    onClick={() => document.getElementById('file-input')?.click()}
                    disabled={uploading}
                    className="flex-1 px-6 py-2 bg-primary text-white rounded-full hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                    {uploading ? 'Processing...' : 'Select PDF'}
                </button>
                <button
                    onClick={handleUpload}
                    disabled={files.length === 0 || uploading}
                    className="flex-1 px-6 py-2 bg-accent text-white rounded-full hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                    Upload & Analyze
                </button>
                <button
                    onClick={onUploadComplete}
                    className="px-6 py-2 bg-slate-200 text-slate-700 rounded-full hover:bg-slate-300 transition-colors"
                >
                    Skip
                </button>
            </div>
            <input
                id="file-input"
                type="file"
                multiple
                accept=".pdf"
                className="hidden"
                onChange={onFileChange}
            />
        </div>
    );
};