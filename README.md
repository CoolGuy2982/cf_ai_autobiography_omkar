# Cloudflare AI Autobiography

An AI-powered autobiography writer that interviews you and drafts your life story using **Gemini 3 Flash** on Cloudflare Workers.

## Features
- **Interactive Onboarding**: Pin your birth location on a 3D-like map.
- **Document Analysis**: Upload PDFs (Resumes, Journals) to give the AI context.
- **Real-time Interview**: Chat with an AI interviewer (Gemini 3 Flash) that remembers context.
- **Live Drafting**: Watch as the AI writes your book chapter-by-chapter in real-time.
- **Tech Stack**: Cloudflare Workers, Durable Objects, D1, R2, React + Vite.

## Setup & Running

### Prerequisites
- Node.js & npm
- Cloudflare Wrangler CLI (`npm i -g wrangler`)

### 1. Backend
```bash
cd backend
npm install
npm run dev
# Starts server at http://localhost:8787
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# Starts app at http://localhost:5173
```

## Deployment
```bash
# Backend
cd backend
npx wrangler deploy

# Frontend
cd frontend
npm run build
npx wrangler pages deploy dist
```

## Architecture
- **Frontend**: React, TailwindCSS, Leaflet.
- **Backend API**: Hono on Cloudflare Workers.
- **Storage**: R2 for PDF text, D1 for relational data.
- **State**: Durable Objects (`InterviewSession`) for WebSocket chat state.
- **AI**: Gemini 3 Flash via Cloudflare AI Gateway.
