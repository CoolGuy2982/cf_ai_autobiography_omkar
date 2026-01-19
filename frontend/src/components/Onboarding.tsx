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
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-lg bg-white p-8 rounded-2xl shadow-xl border border-slate-100"
            >
                {step === 1 && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold text-primary">Tell us about yourself.</h1>
                        <p className="text-secondary">Let's start with the basics to begin your story.</p>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">Full Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-accent focus:outline-none transition-all"
                                placeholder="Jane Doe"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">Date of Birth</label>
                            <input
                                type="date"
                                value={dob}
                                onChange={(e) => setDob(e.target.value)}
                                className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-accent focus:outline-none transition-all"
                            />
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-bold text-primary">Where did it begin?</h1>
                        <p className="text-secondary">Pin your birthplace on the map.</p>
                        <MapSelector onLocationSelect={(lat, lng) => setLocation({ lat, lng })} />
                        {location && <p className="text-sm text-green-600 font-medium">Location selected!</p>}
                    </div>
                )}

                <button
                    onClick={handleNext}
                    disabled={(step === 1 && (!name || !dob)) || (step === 2 && !location)}
                    className="mt-8 w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {step === 1 ? "Next" : "Start My Journey"}
                </button>
            </motion.div>
        </div>
    );
};
