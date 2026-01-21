import { useState, useEffect } from 'react';
import { Onboarding } from './components/Onboarding';
import { DocumentUpload } from './components/DocumentUpload';
import { Workspace } from './components/Workspace';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL } from './utils/api';

function App() {
  const [phase, setPhase] = useState<'onboarding' | 'upload' | 'creating' | 'workspace'>('onboarding');
  const [userId, setUserId] = useState<string>('');
  const [bookTitle, setBookTitle] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState(true);

  // Restore state from LocalStorage on mount
  useEffect(() => {
    const savedPhase = localStorage.getItem('cf_ai_phase');
    const savedUserId = localStorage.getItem('cf_ai_userId');
    const savedSessionId = localStorage.getItem('cf_ai_sessionId');
    const savedTitle = localStorage.getItem('cf_ai_title');

    if (savedPhase && savedUserId) {
        setUserId(savedUserId);
        if (savedSessionId) setSessionId(savedSessionId);
        if (savedTitle) setBookTitle(savedTitle);
        // Cast to valid phase type
        setPhase(savedPhase as any);
    }
    setIsRestoring(false);
  }, []);

  // Persist state changes
  useEffect(() => {
    if (!isRestoring) {
        localStorage.setItem('cf_ai_phase', phase);
        if (userId) localStorage.setItem('cf_ai_userId', userId);
        if (sessionId) localStorage.setItem('cf_ai_sessionId', sessionId);
        if (bookTitle) localStorage.setItem('cf_ai_title', bookTitle);
    }
  }, [phase, userId, sessionId, bookTitle, isRestoring]);

  const handleOnboardingComplete = async (data: { name: string; dob: string; birthLocation: { lat: number; lng: number } }) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();

      if (result.success) {
        setUserId(result.userId);
        setPhase('upload');
      } else {
        alert("Failed to create user: " + (result.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      alert("Critial error creating user.");
    }
  };

  const handleUploadComplete = async () => {
    setPhase('creating');
    try {
      const res = await fetch(`${API_BASE_URL}/api/books/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: 'My Autobiography' })
      });
      const data = await res.json();

      if (data.success) {
        setSessionId(data.bookId); 
        setBookTitle(data.outline.title);
        setPhase('workspace');
      } else {
        alert("Failed to create book: " + data.error);
        setPhase('upload');
      }
    } catch (e) {
      console.error(e);
      alert("Critial error starting book.");
      setPhase('upload');
    }
  };

  if (isRestoring) return <div className="min-h-screen bg-wood-dark flex items-center justify-center text-stone-400">Restoring session...</div>;

  return (
    <div className="min-h-screen font-sans text-stone-200 selection:bg-accent/30">
      {phase === 'onboarding' && <Onboarding onComplete={handleOnboardingComplete} />}

      {phase === 'upload' && userId && (
        <DocumentUpload userId={userId} onUploadComplete={handleUploadComplete} />
      )}

      {phase === 'creating' && (
        <div className="flex flex-col items-center justify-center h-screen relative z-10">
          <Loader2 className="w-12 h-12 animate-spin text-accent mb-6" />
          <h2 className="text-2xl font-serif font-bold text-stone-200">Crafting your outline...</h2>
          <p className="text-stone-400 mt-2 font-sans">The biographer is reviewing your documents.</p>
        </div>
      )}

      {phase === 'workspace' && sessionId && (
        <Workspace sessionId={sessionId} bookTitle={bookTitle} />
      )}
    </div>
  );
}

export default App;