// frontend/src/utils/api.ts

// This defaults to localhost if the Env var isn't set (e.g. in local dev)
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export const getWsUrl = (sessionId: string) => {
    // Convert http(s) to ws(s)
    const protocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const host = API_BASE_URL.replace(/^https?:\/\//, '');
    return `${protocol}://${host}/api/session/${sessionId}/connect`;
};