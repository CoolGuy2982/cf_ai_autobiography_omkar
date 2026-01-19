import React from 'react';
import { ChatInterface } from './ChatInterface';
import { BookCanvas } from './BookCanvas';

interface WorkspaceProps {
    sessionId: string;
    bookTitle?: string;
}

export const Workspace: React.FC<WorkspaceProps> = ({ sessionId, bookTitle }) => {
    return (
        <div className="flex h-screen overflow-hidden bg-slate-100">
            {/* Left: Chat (Interviewer) */}
            <div className="w-[400px] shrink-0 h-full shadow-xl z-20">
                <ChatInterface sessionId={sessionId} />
            </div>

            {/* Right: Book (Canvas) */}
            <div className="flex-1 h-full relative">
                <BookCanvas chapterTitle={bookTitle} />
            </div>
        </div>
    );
};
