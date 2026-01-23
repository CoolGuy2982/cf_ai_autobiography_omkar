import { DurableObject } from "cloudflare:workers";

interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    CF_ACCOUNT_ID: string;
    CF_GATEWAY_ID: string;
    GEMINI_API_KEY: string;
    CF_AIG_TOKEN?: string;
}

interface ThreadMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content?: string;
    functionCall?: any;
    functionResponse?: any;
}

interface NoteItem {
    id: string;
    content: string;
}

export class InterviewSession extends DurableObject {
    state: DurableObjectState;
    env: Env;
    history: ThreadMessage[] = [];
    bookId: string = "";
    userId: string = "";
    bookContext: any = null; // The Outline
    notes: NoteItem[] = [];
    mode: 'interview' | 'writing' = 'interview';
    isProcessing: boolean = false;
    
    // We track the current draft content in memory during generation
    currentDraft: string = ""; 
    
    // Controller to cancel generation streams
    abortController: AbortController | null = null;
    
    config = {
        accountId: "",
        gatewayId: "",
        geminiKey: "",
        aigToken: ""
    };

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.state = state;
        this.env = env;
        
        this.config.accountId = env.CF_ACCOUNT_ID;
        this.config.gatewayId = env.CF_GATEWAY_ID;
        this.config.geminiKey = env.GEMINI_API_KEY;
        this.config.aigToken = env.CF_AIG_TOKEN || "";

        this.state.blockConcurrencyWhile(async () => {
            const stored = await this.state.storage.get<{ 
                history: ThreadMessage[], 
                bookId: string, 
                userId: string,
                notes: NoteItem[],
                mode: 'interview' | 'writing',
                currentDraft: string,
                config: any
            }>(["history", "bookId", "userId", "notes", "mode", "currentDraft", "config"]);
            
            this.history = stored.history || [];
            this.bookId = stored.bookId || "";
            this.userId = stored.userId || "";
            this.notes = stored.notes || []; 
            this.mode = stored.mode || 'interview';
            this.currentDraft = stored.currentDraft || "";
            if (stored.config) this.config = { ...this.config, ...stored.config };
        });
    }

    // Helper to send logs to the frontend
    broadcastLog(ws: WebSocket, message: string) {
        try {
            ws.send(JSON.stringify({ type: 'debug_log', content: `[Server] ${message}` }));
        } catch (e) { /* ignore */ }
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/websocket") {
            const queryBookId = url.searchParams.get("bookId");
            if (queryBookId) {
                this.bookId = queryBookId;
                await this.state.storage.put("bookId", this.bookId);
                
                // Lazy load userId if missing
                if (!this.userId) {
                    const book = await this.env.DB.prepare("SELECT user_id FROM books WHERE id = ?").bind(this.bookId).first();
                    if (book) {
                        this.userId = book.user_id as string;
                        await this.state.storage.put("userId", this.userId);
                    }
                }
            }

            const accId = url.searchParams.get("cf_account_id");
            const gwId = url.searchParams.get("cf_gateway_id");
            const gKey = url.searchParams.get("gemini_key");
            const aigTok = url.searchParams.get("cf_aig_token");

            if (accId) this.config.accountId = accId;
            if (gwId) this.config.gatewayId = gwId;
            if (gKey) this.config.geminiKey = gKey;
            if (aigTok) this.config.aigToken = aigTok;

            await this.state.storage.put("config", this.config);

            const upgradeHeader = request.headers.get("Upgrade");
            if (!upgradeHeader || upgradeHeader !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }

            const pair = new WebSocketPair();
            this.state.acceptWebSocket(pair[1]);

            return new Response(null, { status: 101, webSocket: pair[0] });
        }
        return new Response("Not found", { status: 404 });
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        const text = typeof message === "string" ? message : new TextDecoder().decode(message);
        try {
            const data = JSON.parse(text);

            if (data.type === 'init') {
                if (!this.bookContext) await this.loadBookContext();
                
                // Send current state
                ws.send(JSON.stringify({ type: 'outline', content: this.bookContext }));
                ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
                ws.send(JSON.stringify({ type: 'mode_sync', content: this.mode }));
                
                // If we have a draft in progress or done, send it
                if (this.currentDraft) {
                     ws.send(JSON.stringify({ type: 'draft_chunk', content: this.currentDraft, reset: true }));
                }

                if (this.history.length === 0 && this.mode === 'interview') {
                    const firstChapter = this.bookContext?.chapters?.[0];
                    const opening = `I've reviewed your outline. We are starting with **${firstChapter?.title || 'Chapter 1'}**. ${firstChapter?.summary || ''}\n\nLet's begin.`;
                    this.history.push({ role: 'assistant', content: opening });
                    await this.state.storage.put("history", this.history);
                    ws.send(JSON.stringify({ type: 'response', content: opening, role: 'assistant' }));
                } else {
                    const visibleHistory = this.history
                        .filter(m => m.content && (m.role === 'user' || m.role === 'assistant'))
                        .map(m => ({ role: m.role, content: m.content }));
                    ws.send(JSON.stringify({ type: 'history', content: visibleHistory }));
                }
            } 
            else if (data.type === 'update_notes') {
                const clientNotes = Array.isArray(data.content) ? data.content as NoteItem[] : [];
                this.notes = clientNotes;
                await this.state.storage.put("notes", this.notes);
                ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
            }
            else if (data.type === 'retry_chapter') {
                this.broadcastLog(ws, "Retrying chapter generation...");
                this.currentDraft = "";
                await this.state.storage.put("currentDraft", "");
                ws.send(JSON.stringify({ type: 'draft_chunk', content: "", reset: true }));
                await this.runWriterAgent(ws);
            }
            else if (data.type === 'cancel_generation') {
                this.broadcastLog(ws, "Cancelling generation...");
                if (this.abortController) {
                    this.abortController.abort();
                    this.abortController = null;
                }
                // Revert to interview mode
                this.mode = 'interview';
                await this.state.storage.put("mode", this.mode);
                ws.send(JSON.stringify({ type: 'mode_sync', content: this.mode }));
                ws.send(JSON.stringify({ type: 'debug_log', content: "Generation Cancelled. You can continue interviewing." }));
            }
            else if (data.type === 'next_chapter') {
                await this.resetForNextChapter(ws);
            }
            else if (data.type === 'message') {
                if (this.isProcessing || this.mode === 'writing') {
                    return; 
                }

                this.history.push({ role: 'user', content: data.content });
                await this.state.storage.put("history", this.history);
                await this.processTurn(ws);
            }
        } catch (err) {
            console.error("WS Error", err);
        }
    }

    async loadBookContext() {
        if (!this.bookId) return;
        const book = await this.env.DB.prepare("SELECT outline_json FROM books WHERE id = ?").bind(this.bookId).first();
        if (book && book.outline_json) {
            this.bookContext = JSON.parse(book.outline_json as string);
        }
    }

    async processTurn(ws: WebSocket) {
        this.isProcessing = true;
        try {
            await this.runInterviewerAgent(ws);
            await this.state.storage.put("history", this.history);
            await this.state.storage.put("notes", this.notes);
        } finally {
            this.isProcessing = false;
        }
    }

    async runInterviewerAgent(ws: WebSocket) {
        const tools = [
            {
                name: "create_note",
                description: "Create a new note card for a NEW topic.",
                parameters: {
                    type: "OBJECT",
                    properties: { content: { type: "STRING" } },
                    required: ["content"]
                }
            },
            {
                name: "append_to_note",
                description: "Add details to an EXISTING note.",
                parameters: {
                    type: "OBJECT",
                    properties: { note_id: { type: "STRING" }, content_to_add: { type: "STRING" } },
                    required: ["note_id", "content_to_add"]
                }
            },
            {
                name: "finalize_interview",
                description: "Call this when you have enough info to write the chapter.",
                parameters: { type: "OBJECT", properties: {}, required: [] }
            }
        ];

        let keepGoing = true;
        let turns = 0;
        
        while (keepGoing && turns < 5) {
            turns++;
            const currentNotesContext = this.notes.length > 0 
                ? JSON.stringify(this.notes.map(n => ({ id: n.id, content: n.content })))
                : "[(No notes yet)]";

            const systemPrompt = `
            You are an expert biographer.
            GOAL: Interview the user to gather material for their autobiography chapter.
            
            === CURRENT NOTEPAD ===
            ${currentNotesContext}
            =======================
            
            RULES:
            1. Use 'create_note' for brand new topics.
            2. Use 'append_to_note' to add details.
            3. Be conversational.
            `;

            try {
                const response = await this.callGemini(systemPrompt, tools);
                const call = response.functionCalls?.[0];

                if (call) {
                    if (call.name === 'create_note') {
                        const { content } = call.args;
                        const newNote = { id: crypto.randomUUID(), content: content || "New Note" };
                        this.notes = [...this.notes, newNote];
                        this.history.push({ role: 'tool', functionResponse: { name: 'create_note', response: { success: true, noteId: newNote.id } } });
                    } 
                    else if (call.name === 'append_to_note') {
                        const { note_id, content_to_add } = call.args;
                        const target = this.notes.find(n => n.id === note_id);
                        if (target) {
                            const newContent = target.content + " " + content_to_add;
                            this.notes = this.notes.map(n => n.id === note_id ? { ...n, content: newContent } : n);
                            this.history.push({ role: 'tool', functionResponse: { name: 'append_to_note', response: { success: true } } });
                        } else {
                            this.history.push({ role: 'tool', functionResponse: { name: 'append_to_note', response: { error: "Note not found" } } });
                        }
                    }
                    else if (call.name === 'finalize_interview') {
                        keepGoing = false;
                        this.mode = 'writing';
                        await this.state.storage.put("mode", this.mode);
                        ws.send(JSON.stringify({ type: 'mode_sync', content: this.mode }));
                        
                        await this.runWriterAgent(ws);
                        return;
                    }

                    await this.state.storage.put("notes", this.notes);
                    ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
                    
                } else {
                    const text = response.text || "I'm thinking...";
                    this.history.push({ role: 'assistant', content: text });
                    ws.send(JSON.stringify({ type: 'response', content: text, role: 'assistant' }));
                    keepGoing = false;
                }
            } catch (e: any) {
                console.error("Agent Error:", e);
                keepGoing = false;
            }
        }
    }

    // --- CONTEXT GATHERING FOR WRITER ---
    async gatherFullContext(): Promise<string> {
        let context = "";

        try {
            // 1. User Bio & Location
            if (this.userId) {
                const user = await this.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(this.userId).first();
                const loc = await this.env.DB.prepare("SELECT * FROM locations WHERE user_id = ?").bind(this.userId).first();
                
                context += `\n# SUBJECT BIO\nName: ${user?.name || "Unknown"}\nDOB: ${user?.dob || "Unknown"}\n`;
                if (loc) context += `Birth/Primary Location: ${loc.label} (${loc.lat}, ${loc.lng})\n`;
            }

            // 2. Uploaded Documents (Full Text)
            if (this.userId) {
                context += `\n# UPLOADED DOCUMENTS (Background Context)\n`;
                const list = await this.env.BUCKET.list({ prefix: `documents/${this.userId}/` });
                if (list && list.objects.length > 0) {
                    for (const object of list.objects) {
                        const file = await this.env.BUCKET.get(object.key);
                        if (file) {
                            context += `\n## File: ${object.key}\n${await file.text()}\n`;
                        }
                    }
                } else {
                    context += "(No documents uploaded)\n";
                }
            }

            // 3. Interview Notes
            context += `\n# INTERVIEW NOTES (Latest Findings)\n`;
            if (this.notes.length > 0) {
                this.notes.forEach(n => {
                    context += `- ${n.content}\n`;
                });
            } else {
                context += "(No notes taken)\n";
            }

            // 4. Interview Transcript
            context += `\n# INTERVIEW TRANSCRIPT (Raw)\n`;
            this.history.forEach(m => {
                if (m.content && (m.role === 'user' || m.role === 'assistant')) {
                    context += `${m.role.toUpperCase()}: ${m.content}\n`;
                }
            });

        } catch (e: any) {
            console.error("Context Gather Error:", e);
            context += `\n[System Error gathering context: ${e.message}]\n`;
        }

        return context;
    }

    async runWriterAgent(ws: WebSocket) {
        this.broadcastLog(ws, "Gathering full context (DB + R2)...");
        const fullContext = await this.gatherFullContext();
        
        const systemPrompt = `
        You are a world-class biographer. 
        Your task is to write the next chapter of the autobiography based on the gathered materials below.
        
        ${fullContext}
        
        === WRITING INSTRUCTIONS ===
        1. Write in First Person (I).
        2. Use sensory details and a strong narrative voice suitable for the subject.
        3. Incorporate specific facts from the uploaded documents and the interview.
        4. Output formatted Markdown.
        5. Do not include meta-commentary like "Here is the chapter". Just start writing the title and the text.
        6. Use the specific location and dates provided in the context if available.
        `;

        this.broadcastLog(ws, "Starting Generation Stream...");
        this.currentDraft = ""; // Reset draft
        ws.send(JSON.stringify({ type: 'draft_chunk', content: "", reset: true }));

        try {
            await this.streamGemini(systemPrompt, ws);
            this.broadcastLog(ws, "Generation Complete.");
            // Save final draft to state
            await this.state.storage.put("currentDraft", this.currentDraft);
        } catch (e: any) {
            if (e.name === 'AbortError') {
                this.broadcastLog(ws, "Generation Aborted by User.");
            } else {
                console.error("Writer Error", e);
                this.broadcastLog(ws, `Writer Error: ${e.message}`);
            }
        }
    }

    async resetForNextChapter(ws: WebSocket) {
        this.broadcastLog(ws, "Archiving chapter and resetting for next...");

        // 1. (Optional) In a full app, you would insert `this.currentDraft` into `chapters` DB table here.
        // For now, we just proceed to clear the workspace.
        
        // 2. Clear Ephemeral Session Data
        // We KEEP: bookId, userId, bookContext (Outline), config
        // We CLEAR: history (convo), notes (specific to chapter), currentDraft
        this.history = []; 
        this.notes = [];   
        this.mode = 'interview'; 
        this.currentDraft = "";

        await this.state.storage.put("history", this.history);
        await this.state.storage.put("notes", this.notes);
        await this.state.storage.put("mode", this.mode);
        await this.state.storage.put("currentDraft", this.currentDraft);

        // 3. Notify Frontend
        ws.send(JSON.stringify({ type: 'init' })); // Force frontend state refresh
        
        // 4. Start new interview with greeting
        // Determine next chapter from outline
        // (Simple logic: just assume we are moving forward linearly or ask generic)
        const greeting = "I've saved that chapter. We are now ready for the next phase of your life. Based on your outline, what should we discuss next?";
        
        this.history.push({ role: 'assistant', content: greeting });
        await this.state.storage.put("history", this.history);
        ws.send(JSON.stringify({ type: 'response', content: greeting, role: 'assistant' }));
    }

    // --- STREAMING GEMINI IMPLEMENTATION ---
    async streamGemini(prompt: string, ws: WebSocket) {
        const accountId = this.config.accountId;
        const gatewayId = this.config.gatewayId;
        const apiKey = this.config.geminiKey;
        const model = "gemini-2.5-flash";

        // Create AbortController for cancellation
        this.abortController = new AbortController();

        // Use streamGenerateContent endpoint
        const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-ai-studio/v1beta/models/${model}:streamGenerateContent?alt=sse`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
                ...(this.config.aigToken ? { 'cf-aig-authorization': `Bearer ${this.config.aigToken}` } : {})
            },
            body: JSON.stringify({
                // Inject the prompt as the USER message, effectively containing the System Context
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            }),
            signal: this.abortController.signal
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split("\n");
                // Keep the last incomplete line in the buffer
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonStr = line.slice(6).trim();
                        if (jsonStr === "[DONE]") return;
                        
                        try {
                            const data = JSON.parse(jsonStr);
                            const textChunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (textChunk) {
                                this.currentDraft += textChunk;
                                // Stream to client
                                ws.send(JSON.stringify({ type: 'draft_chunk', content: textChunk, reset: false }));
                            }
                        } catch (e) {
                            // ignore parsing errors on intermediate chunks
                        }
                    }
                }
            }
        } finally {
            this.abortController = null; 
        }
    }

    // Standard Non-Streaming Call (for Interviewer)
    async callGemini(systemInstruction: string, tools?: any[]) {
        const accountId = this.config.accountId;
        const gatewayId = this.config.gatewayId;
        const apiKey = this.config.geminiKey;
        const model = "gemini-2.5-flash";
        
        const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-ai-studio/v1beta/models/${model}:generateContent`;
        
        const contents = this.history.map(m => {
            if(m.role === 'tool') return { role: 'function', parts: [{ functionResponse: m.functionResponse }] };
            if(m.functionCall) return { role: 'model', parts: [{ functionCall: m.functionCall }] };
            return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
        });

        const body: any = { contents, system_instruction: { parts: [{ text: systemInstruction }] } };
        if (tools) body.tools = [{ function_declarations: tools }];

        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
                ...(this.config.aigToken ? { 'cf-aig-authorization': `Bearer ${this.config.aigToken}` } : {})
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) throw new Error(`AI Error: ${resp.status}`);
        const data: any = await resp.json();
        
        return {
            text: data.candidates?.[0]?.content?.parts?.[0]?.text,
            functionCalls: data.candidates?.[0]?.content?.parts?.filter((p:any) => p.functionCall).map((p:any) => p.functionCall)
        };
    }
}