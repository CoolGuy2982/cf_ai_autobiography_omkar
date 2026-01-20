import { useState } from 'react';
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

  return (
    // CHANGED: Removed bg-slate-50 and text-slate-900. Added text-stone-200.
    // This allows the "body" wood texture to show through.
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