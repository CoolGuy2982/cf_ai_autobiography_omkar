/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"DM Sans"', 'sans-serif'],
                serif: ['"Crimson Pro"', 'serif'],
                hand: ['"Caveat"', 'cursive'],
            },
            colors: {
                // RESTORED: Standard UI colors for existing components
                primary: '#d97706',   // Amber 600 (Matches Accent)
                secondary: '#44403c', // Stone 700
                
                // The Studio Palette
                ink: '#1c1917',       
                paper: '#f5f2eb', 
                'paper-yellow': '#fefce8',
                
                // Wood / Desk Environment
                wood: '#2a2320',       // Deep Mahogany
                'wood-dark': '#0f0c0a', // Almost black shadow
                
                accent: '#d97706',    
            },
            boxShadow: {
                'book': '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0,0,0,0.4)',
                'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                'pad': '0 10px 30px -5px rgba(0,0,0,0.4)',
                'card': '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            },
            backgroundImage: {
                'lined-paper': "repeating-linear-gradient(transparent, transparent 31px, #94a3b8 31px, #94a3b8 32px)",
                // A subtle wood grain pattern generated via CSS
                'wood-pattern': "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E\")",
            }
        },
    },
    plugins: [],
}