import { useState } from 'react';
import { Onboarding } from './components/Onboarding';
import { DocumentUpload } from './components/DocumentUpload';
import { Workspace } from './components/Workspace';
import { Loader2 } from 'lucide-react';

function App() {
  const [phase, setPhase] = useState<'onboarding' | 'upload' | 'creating' | 'workspace'>('onboarding');
  const [userId, setUserId] = useState<string>('');
  const [bookTitle, setBookTitle] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');

  const handleOnboardingComplete = async (data: { name: string; dob: string; birthLocation: { lat: number; lng: number } }) => {
    try {
      const res = await fetch('http://localhost:8787/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();

      if (result.success) {
        setUserId(result.userId);
        console.log("Onboarding complete, user created:", result.userId);
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
      // Start Book / Generate Outline
      const res = await fetch('http://localhost:8787/api/books/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: 'My Autobiography' })
      });
      const data = await res.json();

      if (data.success) {
        setSessionId(data.bookId); // Using bookId as sessionId for simplicity
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
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {phase === 'onboarding' && <Onboarding onComplete={handleOnboardingComplete} />}

      {phase === 'upload' && userId && (
        <DocumentUpload userId={userId} onUploadComplete={handleUploadComplete} />
      )}

      {phase === 'creating' && (
        <div className="flex flex-col items-center justify-center h-screen">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <h2 className="text-xl font-semibold">Crafting your outline...</h2>
          <p className="text-slate-500">Consulting Gemini...</p>
        </div>
      )}

      {phase === 'workspace' && sessionId && (
        <Workspace sessionId={sessionId} bookTitle={bookTitle} />
      )}
    </div>
  );
}

export default App;
