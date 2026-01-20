import React, { useState } from 'react';
import { MapSelector } from './MapSelector';
import { motion } from 'framer-motion';

interface OnboardingProps {
    onComplete: (data: { name: string; dob: string; birthLocation: { lat: number; lng: number } }) => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [dob, setDob] = useState('');
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

    const handleNext = () => {
        if (step === 1 && name && dob) setStep(2);
        else if (step === 2 && location) {
            onComplete({ name, dob, birthLocation: location });
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative z-10">
            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full max-w-lg bg-paper p-10 rounded-sm shadow-card border-t border-white/50 relative"
            >
                {/* Decorative Paper Texture */}
                <div className="absolute inset-0 bg-wood-pattern opacity-10 pointer-events-none mix-blend-multiply"></div>
                
                <div className="relative z-10 text-ink">
                    {step === 1 && (
                        <div className="space-y-8 text-center">
                            <div>
                                <h1 className="text-4xl font-serif font-bold text-wood-dark mb-2">The Prologue</h1>
                                <p className="text-stone-500 font-sans">Every story begins with a name.</p>
                            </div>

                            <div className="space-y-4 text-left">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase tracking-widest text-stone-400">Full Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-transparent border-b-2 border-stone-200 py-2 text-xl font-serif text-wood-dark focus:border-accent focus:outline-none transition-colors placeholder:text-stone-300"
                                        placeholder="Jane Doe"
                                    />
                                </div>

                                <div className="space-y-1 pt-2">
                                    <label className="text-xs font-bold uppercase tracking-widest text-stone-400">Date of Birth</label>
                                    <input
                                        type="date"
                                        value={dob}
                                        onChange={(e) => setDob(e.target.value)}
                                        className="w-full bg-transparent border-b-2 border-stone-200 py-2 text-xl font-serif text-wood-dark focus:border-accent focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 text-center">
                            <div>
                                <h1 className="text-3xl font-serif font-bold text-wood-dark">The Setting</h1>
                                <p className="text-stone-500">Pin where your story began.</p>
                            </div>
                            <div className="border-4 border-white shadow-inner rounded-lg overflow-hidden">
                                <MapSelector onLocationSelect={(lat, lng) => setLocation({ lat, lng })} />
                            </div>
                            {location && <p className="text-sm text-accent font-medium font-serif italic">Location marked.</p>}
                        </div>
                    )}

                    <button
                        onClick={handleNext}
                        disabled={(step === 1 && (!name || !dob)) || (step === 2 && !location)}
                        className="mt-10 w-full bg-wood-dark text-paper py-3 rounded-sm font-sans font-medium hover:bg-accent disabled:opacity-30 disabled:hover:bg-wood-dark transition-all uppercase tracking-wider text-xs shadow-lg"
                    >
                        {step === 1 ? "Turn Page" : "Begin Journey"}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};