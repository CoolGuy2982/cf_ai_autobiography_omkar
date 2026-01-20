import React from 'react';
import { motion } from 'framer-motion';

interface NotepadProps {
    notes: string[];
    visible: boolean;
}

export const Notepad: React.FC<NotepadProps> = ({ notes, visible }) => {
    // Line height configuration for perfect alignment
    const LINE_HEIGHT = 32;

    return (
        <motion.div 
            // FIX: We add 'rotate: -1' here. Framer Motion now manages the rotation 
            // combined with the Y/Scale transforms, preventing the overwrite.
            initial={{ y: 50, opacity: 0, rotate: -1 }} 
            animate={{ 
                y: visible ? 0 : 50, 
                opacity: visible ? 1 : 0,
                scale: visible ? 1 : 0.95,
                rotate: -1, 
                display: visible ? 'block' : 'none'
            }}
            transition={{ duration: 0.6, ease: "circOut" }}
            className="w-full max-w-[600px] mx-auto h-[80vh] relative perspective-1000 origin-top"
        >
            {/* The Leather Binding (Top) */}
            <div className="relative z-20 h-14 bg-[#4a1818] rounded-t-lg shadow-md flex items-center justify-center border-b-[3px] border-[#2d0e0e]">
                {/* Stitching effect */}
                <div className="absolute bottom-2 left-2 right-2 border-b border-dashed border-white/20"></div>
                <span className="text-[#cbaba0] font-sans text-[10px] tracking-[0.3em] font-bold uppercase drop-shadow-sm">
                    Legal Pad
                </span>
            </div>

            {/* The Paper Block */}
            <div className="w-full h-full bg-[#fbf6e1] shadow-pad relative overflow-hidden rounded-b-sm">
                
                {/* CSS Pattern for Blue Lines */}
                <div 
                    className="absolute inset-0 pointer-events-none opacity-80"
                    style={{
                        backgroundImage: `linear-gradient(transparent ${LINE_HEIGHT - 1}px, #a4b5cd ${LINE_HEIGHT}px)`,
                        backgroundSize: `100% ${LINE_HEIGHT}px`,
                        marginTop: '40px' 
                    }}
                />

                {/* Red Vertical Margin Line */}
                <div className="absolute top-0 bottom-0 left-16 w-[2px] bg-[#e79292] h-full z-10 opacity-80"></div>
                
                {/* Content Area */}
                <div className="relative z-10 h-full p-0">
                    
                    {/* Header */}
                    <div className="pl-20 pr-8 pt-[42px]">
                        <h3 
                            className="font-hand text-3xl text-ink/90 underline decoration-wavy decoration-[#e79292] -rotate-1 origin-left"
                            style={{ marginBottom: '10px' }}
                        >
                            Notes & Thoughts
                        </h3>
                    </div>

                    {/* Handwriting Text Area */}
                    <div 
                        className="pl-20 pr-8 font-hand text-2xl text-blue-900/90"
                        style={{ 
                            lineHeight: `${LINE_HEIGHT}px`,
                        }}
                    >
                        {notes.length === 0 && (
                            <p className="opacity-40 italic">Waiting for interview to begin...</p>
                        )}

                        <ul className="list-disc pl-4">
                            {notes.map((note, i) => (
                                <motion.li 
                                    key={i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    {note}
                                </motion.li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};