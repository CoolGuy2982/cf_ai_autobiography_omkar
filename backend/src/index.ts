import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { InterviewSession } from './durable_objects/InterviewSession';

export { InterviewSession };

type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    INTERVIEW_SESSION: DurableObjectNamespace;
    CF_ACCOUNT_ID: string;
    CF_GATEWAY_ID: string;
    GEMINI_API_KEY: string;
    CF_AIG_TOKEN?: string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.get('/', (c) => {
    return c.text('Cloudflare AI Autobiography Backend is running!');
});

// WebSocket Route
app.get('/api/session/:id/connect', async (c) => {
    const id = c.req.param('id');
    const upgradeHeader = c.req.header('Upgrade');

    if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return c.text('Expected Upgrade: websocket', 426);
    }

    const idObj = c.env.INTERVIEW_SESSION.idFromName(id);
    const stub = c.env.INTERVIEW_SESSION.get(idObj);

    const url = new URL(c.req.url);
    url.pathname = "/websocket";
    url.searchParams.set("bookId", id);
    
    const request = new Request(url, c.req.raw);

    return stub.fetch(request);
});

// User Onboarding Route
app.post('/api/onboarding', async (c) => {
    try {
        const { name, dob, birthLocation } = await c.req.json();
        const id = `user_${Date.now()}`;

        await c.env.DB.prepare(
            `INSERT INTO users (id, name, dob, created_at) VALUES (?, ?, ?, ?)`
        ).bind(id, name, dob, Date.now()).run();

        if (birthLocation) {
            await c.env.DB.prepare(
                `INSERT INTO locations (id, user_id, lat, lng, label, date_start) VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(crypto.randomUUID(), id, birthLocation.lat, birthLocation.lng, 'Birthplace', dob).run();
        }

        return c.json({ success: true, userId: id });
    } catch (e) {
        console.error(e);
        return c.json({ error: 'Failed to create user', details: (e as Error).message }, 500);
    }
});

// Document Upload Route
app.post('/api/documents', async (c) => {
    try {
        const { userId, filename, text } = await c.req.json();
        if (!userId || !filename || !text) return c.json({ error: 'Missing fields' }, 400);

        const key = `documents/${userId}/${filename}`;
        await c.env.BUCKET.put(key, text);

        return c.json({ success: true, key });
    } catch (e) {
        return c.json({ error: 'Upload failed', details: (e as Error).message }, 500);
    }
});

// Helper to call Gemini via Cloudflare AI Gateway
async function callGeminiGateway(env: Bindings, systemPrompt: string, userContent: string) {
    const model = "gemini-2.5-flash"; // Using 2.5 Flash as standard
    // IMPORTANT: Using v1beta for better system_instruction support
    const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_GATEWAY_ID}/google-ai-studio/v1beta/models/${model}:generateContent`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
    };

    if (env.CF_AIG_TOKEN) {
        headers['cf-aig-authorization'] = `Bearer ${env.CF_AIG_TOKEN}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            // FIX: Must be snake_case for REST API
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: userContent }]
                }
            ]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI Gateway Error: ${errText}`);
    }

    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Start Book / Generate Outline
app.post('/api/books/start', async (c) => {
    try {
        const { userId, title } = await c.req.json();

        // 1. Fetch user documents
        const list = await c.env.BUCKET.list({ prefix: `documents/${userId}/` });
        let context = "";

        if (list && list.objects) {
            for (const object of list.objects) {
                const file = await c.env.BUCKET.get(object.key);
                if (file) {
                    const content = await file.text();
                    context += `\n--- Document: ${object.key} ---\n${content}\n`;
                }
            }
        }

        if (!context) {
            context = "User has not uploaded any documents yet. Start with a generic autobiographical structure.";
        }

        // 2. Generate Outline
        const systemPrompt = `You are an expert autobiography ghostwriter. Based on the provided documents, create a detailed book outline. 
        Return ONLY valid JSON (no markdown formatting) with this structure:
        { "title": "Book Title", "chapters": [ { "index": 1, "title": "Chapter Title", "summary": "Detailed summary of what to cover" } ] }`;

        let outlineData;
        try {
            let jsonStr = await callGeminiGateway(c.env, systemPrompt, `Here is the context:\n${context}`);
            jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
            outlineData = JSON.parse(jsonStr);
        } catch (aiErr) {
            console.error("AI Generation failed:", aiErr);
            outlineData = {
                title: title || "My Story",
                chapters: [
                    { index: 1, title: "The Beginning", summary: "Discussing birth and early childhood." },
                    { index: 2, title: "Growing Up", summary: "School years and early friends." }
                ]
            };
        }

        const outlineJson = JSON.stringify(outlineData);

        // 3. Save Book
        const bookId = crypto.randomUUID();
        await c.env.DB.prepare(
            `INSERT INTO books (id, user_id, title, outline_json) VALUES (?, ?, ?, ?)`
        ).bind(bookId, userId, outlineData.title, outlineJson).run();

        // 4. Create Chapters
        if (outlineData.chapters) {
            for (const chap of outlineData.chapters) {
                await c.env.DB.prepare(
                    `INSERT INTO chapters (id, book_id, chapter_index, title) VALUES (?, ?, ?, ?)`
                ).bind(crypto.randomUUID(), bookId, chap.index, chap.title).run();
            }
        }

        return c.json({ success: true, bookId, outline: outlineData });

    } catch (e) {
        console.error(e);
        return c.json({ error: 'Failed to start book', details: (e as Error).message }, 500);
    }
});

export default app;