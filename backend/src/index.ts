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

app.get('/', (c) => c.text('Cloudflare AI Autobiography Backend is running!'));

// ==========================================
// WebSocket Route (Connects to Durable Object)
// ==========================================
app.get('/api/session/:id/connect', async (c) => {
    const id = c.req.param('id');
    const upgradeHeader = c.req.header('Upgrade');

    if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return c.text('Expected Upgrade: websocket', 426);
    }

    const idObj = c.env.INTERVIEW_SESSION.idFromName(id);
    const stub = c.env.INTERVIEW_SESSION.get(idObj);

    // Pass credentials to DO via URL params
    const url = new URL(c.req.url);
    url.pathname = "/websocket";
    url.searchParams.set("bookId", id);
    url.searchParams.set("cf_account_id", c.env.CF_ACCOUNT_ID || "");
    url.searchParams.set("cf_gateway_id", c.env.CF_GATEWAY_ID || "");
    url.searchParams.set("gemini_key", c.env.GEMINI_API_KEY || "");
    if (c.env.CF_AIG_TOKEN) {
        url.searchParams.set("cf_aig_token", c.env.CF_AIG_TOKEN);
    }
    
    return stub.fetch(new Request(url, c.req.raw));
});

// ==========================================
// User Onboarding
// ==========================================
app.post('/api/onboarding', async (c) => {
    try {
        const { name, dob, birthLocation } = await c.req.json();
        const id = `user_${Date.now()}`;
        
        await c.env.DB.prepare(`INSERT INTO users (id, name, dob, created_at) VALUES (?, ?, ?, ?)`).bind(id, name, dob, Date.now()).run();

        if (birthLocation) {
            // CRITICAL: Ensure 'label' (City Name) is saved. 
            // Fallback to 'Birthplace' only if label is missing.
            await c.env.DB.prepare(`INSERT INTO locations (id, user_id, lat, lng, label, date_start) VALUES (?, ?, ?, ?, ?, ?)`).bind(
                crypto.randomUUID(), 
                id, 
                birthLocation.lat, 
                birthLocation.lng, 
                birthLocation.label || 'Birthplace', 
                dob
            ).run();
        }

        return c.json({ success: true, userId: id });
    } catch (e) {
        console.error(e);
        return c.json({ error: 'Failed to create user', details: (e as Error).message }, 500);
    }
});

// ==========================================
// Document Upload
// ==========================================
app.post('/api/documents', async (c) => {
    try {
        const { userId, filename, text } = await c.req.json();
        const key = `documents/${userId}/${filename}`;
        await c.env.BUCKET.put(key, text);
        return c.json({ success: true, key });
    } catch (e) {
        return c.json({ error: 'Upload failed', details: (e as Error).message }, 500);
    }
});

// ==========================================
// Start Book / Generate Outline
// ==========================================
app.post('/api/books/start', async (c) => {
    try {
        const { userId, title } = await c.req.json();

        // 1. Fetch Context
        const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
        const list = await c.env.BUCKET.list({ prefix: `documents/${userId}/` });
     
        let docContext = "";
        if (list && list.objects) {
            for (const object of list.objects) {
                const file = await c.env.BUCKET.get(object.key);
                if (file) docContext += `\n--- Document: ${object.key} ---\n${await file.text()}\n`;
            }
        }
        if (!docContext) docContext = "User has not uploaded any documents yet.";

        // 2. Define Tool
        const saveOutlineTool = {
            name: "save_outline",
            description: "Saves the structured outline.",
            parameters: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    chapters: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                index: { type: "INTEGER" },
                                title: { type: "STRING" },
                                summary: { type: "STRING" }
                            },
                            required: ["index", "title", "summary"]
                        }
                    }
                },
                required: ["title", "chapters"]
            }
        };

        // 3. Call AI
        const systemPrompt = `You are an expert biographer.
        User: ${user?.name}, Born: ${user?.dob}. Create an outline. You MUST call 'save_outline'.`;
        const userContent = `Documents:\n${docContext}`;

        const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${c.env.CF_ACCOUNT_ID}/${c.env.CF_GATEWAY_ID}/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent`;
        const response = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': c.env.GEMINI_API_KEY,
                ...(c.env.CF_AIG_TOKEN ? { 'cf-aig-authorization': `Bearer ${c.env.CF_AIG_TOKEN}` } : {})
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userContent }] }],
                tools: [{ function_declarations: [saveOutlineTool] }],
                tool_config: { function_calling_config: { mode: "ANY" } }
            })
        });

        if (!response.ok) throw new Error(await response.text());

        const data: any = await response.json();
        const args = data.candidates?.[0]?.content?.parts?.[0]?.functionCall?.args;
        
        // Fallback
        const outlineData = args || { title: title || "My Story", chapters: [{ index: 1, title: "Introduction", summary: "The beginning." }] };

        // 4. Save
        const bookId = crypto.randomUUID();
        await c.env.DB.prepare(`INSERT INTO books (id, user_id, title, outline_json) VALUES (?, ?, ?, ?)`).bind(bookId, userId, outlineData.title, JSON.stringify(outlineData)).run();

        return c.json({ success: true, bookId, outline: outlineData });

    } catch (e) {
        console.error(e);
        return c.json({ error: (e as Error).message }, 500);
    }
});

export default app;