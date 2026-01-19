import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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
                await fetch('http://localhost:8787/api/documents', {
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
                    className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-primary file:text-white
                    hover:file:bg-slate-700"
                />
                <p className="mt-2 text-xs text-slate-400">{files.length} files selected</p>
            </div>

            <button
                onClick={handleUpload}
                disabled={files.length === 0 || uploading}
                className="mt-6 w-full bg-accent text-white py-3 rounded-lg font-semibold hover:bg-blue-600 disabled:opacity-50 transition-all"
            >
                {uploading ? "Processing..." : "Upload & Analyze"}
            </button>
        </div>
    );
};
