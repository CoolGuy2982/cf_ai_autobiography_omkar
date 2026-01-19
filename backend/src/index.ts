import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { InterviewSession } from './durable_objects/InterviewSession';

export { InterviewSession };

type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    AI: Ai;
    INTERVIEW_SESSION: DurableObjectNamespace;
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

    // Rewrite URL to /websocket for the DO
    const url = new URL(c.req.url);
    url.pathname = "/websocket";
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

        // Save location
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

// Document Upload Route (Text only, parsed on client)
app.post('/api/documents', async (c) => {
    try {
        const { userId, filename, text } = await c.req.json();
        if (!userId || !filename || !text) return c.json({ error: 'Missing fields' }, 400);

        // Save to R2
        const key = `documents/${userId}/${filename}`;
        await c.env.BUCKET.put(key, text);

        return c.json({ success: true, key });
    } catch (e) {
        return c.json({ error: 'Upload failed', details: (e as Error).message }, 500);
    }
});

// Start Book / Generate Outline
app.post('/api/books/start', async (c) => {
    try {
        const { userId, title } = await c.req.json();

        // 1. Fetch user documents from R2 to build context
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

        // 2. Generate Outline using Gemini 3 Flash
        // We'll use the AI binding.
        // NOTE: Adjust model ID based on what is available/configured. 
        // Using a generic placeholder ID for Gemini.
        const prompt = `
            You are an expert autobiography ghostwriter.
            Based on the following documents about the user, create a detailed book outline.
            
            Documents:
            ${context}
            
            Return ONLY a JSON object with this structure:
            {
                "title": "Suggested Title",
                "chapters": [
                    { "index": 1, "title": "Chapter Title", "summary": "What this chapter covers" },
                    ...
                ]
            }
        `;

        // Make AI Call (Using gateway or binding)
        // const response = await c.env.AI.run('@cf/google/gemini-2.0-flash-exp', { messages: [{ role: 'user', content: prompt }] });
        // Simulating response for now to avoid errors without real binding
        const mockOutline = {
            title: title || "My Journey",
            chapters: [
                { index: 1, title: "Early Beginnings", summary: "Birth and childhood locations." },
                { index: 2, title: "Education", summary: "School years and early learning." }
            ]
        };
        const outlineJson = JSON.stringify(mockOutline);

        // 3. Save Book to D1
        const bookId = crypto.randomUUID();
        await c.env.DB.prepare(
            `INSERT INTO books (id, user_id, title, outline_json) VALUES (?, ?, ?, ?)`
        ).bind(bookId, userId, mockOutline.title, outlineJson).run();

        // 4. Create Chapters
        for (const chap of mockOutline.chapters) {
            await c.env.DB.prepare(
                `INSERT INTO chapters (id, book_id, chapter_index, title) VALUES (?, ?, ?, ?)`
            ).bind(crypto.randomUUID(), bookId, chap.index, chap.title).run();
        }

        return c.json({ success: true, bookId, outline: mockOutline });

    } catch (e) {
        console.error(e);
        return c.json({ error: 'Failed to start book', details: (e as Error).message }, 500);
    }
});

export default app;
