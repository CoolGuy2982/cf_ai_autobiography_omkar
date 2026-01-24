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
    bookContext: any = null;
    notes: NoteItem[] = [];
    mode: 'interview' | 'writing' = 'interview';
    isProcessing: boolean = false;
    currentDraft: string = "";
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
                await this.loadBookContext();
                ws.send(JSON.stringify({ type: 'outline', content: this.bookContext }));
                ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
                ws.send(JSON.stringify({ type: 'mode_sync', content: this.mode }));

                if (this.currentDraft) {
                     ws.send(JSON.stringify({ type: 'draft_chunk', content: this.currentDraft, reset: true }));
                }

                if (this.history.length === 0 && this.mode === 'interview') {
                    const contextSnippet = await this.gatherFullContext(ws);
                    const firstChapter = this.bookContext?.chapters?.[0];
                    const opening = `Hello! I've reviewed your documents and I see we're starting with **${firstChapter?.title || 'Chapter 1'}**. ${firstChapter?.summary || ''}\n\nTo begin, could you tell me a bit more about this time in your life?`;
                    
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
            // === NEW: Granular Patch to prevent overwriting AI notes ===
            else if (data.type === 'patch_note') {
                const { id, content } = data;
                this.notes = this.notes.map(n => n.id === id ? { ...n, content } : n);
                await this.state.storage.put("notes", this.notes);
                // We don't broadcast sync here necessarily to avoid cursors jumping, 
                // but in this simple app we can.
                // ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
            }
            // Fallback for full updates (e.g. deletions or adds)
            else if (data.type === 'update_notes') {
                const clientNotes = Array.isArray(data.content) ? data.content as NoteItem[] : [];
                // Simple merge strategy: if server has more notes, keep server's extra ones
                // (This prevents user from deleting AI notes just by having an old state)
                if (this.notes.length > clientNotes.length) {
                    // Check if the missing ones are very recent? 
                    // For now, let's just accept the client's state if it's an explicit delete action,
                    // but usually clients should use patch.
                    this.notes = clientNotes; 
                } else {
                    this.notes = clientNotes;
                }
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
                this.mode = 'interview';
                await this.state.storage.put("mode", this.mode);
                ws.send(JSON.stringify({ type: 'mode_sync', content: this.mode }));
                ws.send(JSON.stringify({ type: 'debug_log', content: "Generation Cancelled. You can continue interviewing." }));
            }
            else if (data.type === 'next_chapter') {
                await this.resetForNextChapter(ws);
            }
            else if (data.type === 'message') {
                if (this.isProcessing || this.mode === 'writing') return;
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
        const book = await this.env.DB.prepare("SELECT outline_json, user_id FROM books WHERE id = ?").bind(this.bookId).first();
        if (book) {
            if (book.outline_json) this.bookContext = JSON.parse(book.outline_json as string);
            if (!this.userId && book.user_id) {
                this.userId = book.user_id as string;
                await this.state.storage.put("userId", this.userId);
            }
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
                description: "Create a new note card for a NEW topic/fact mentioned by the user.",
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
        
        const backgroundContext = await this.gatherFullContext(ws);

        while (keepGoing && turns < 5) {
            turns++;
            
            const currentNotesContext = this.notes.length > 0 
                ? JSON.stringify(this.notes.map(n => ({ id: n.id, content: n.content })))
                : "[(No notes yet)]";

            const systemPrompt = `
            You are an expert biographer. 
            === SUBJECT IDENTITY ===
            ${backgroundContext}
            === CURRENT NOTES ===
            ${currentNotesContext}
            =======================
            GOAL: Interview the user for the current chapter.
            RULES:
            1. Use 'create_note' for new facts.
            2. Use 'append_to_note' to elaborate.
            3. Call 'finalize_interview' when ready to write.
            `;

            try {
                const response = await this.callGemini(systemPrompt, tools);
                
                // === FIX: Handle MULTIPLE tool calls in one turn ===
                const calls = response.functionCalls || []; 

                if (calls.length > 0) {
                    for (const call of calls) {
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
                    }

                    // Save state after ALL calls processed
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

    async gatherFullContext(ws?: WebSocket): Promise<string> {
        if (!this.userId) return "User ID not found.";
        let context = "";
        try {
            const user = await this.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(this.userId).first();
            const locations = await this.env.DB.prepare("SELECT * FROM locations WHERE user_id = ?").bind(this.userId).all();
            
            context += `Name: ${user?.name || "Unknown"}, DOB: ${user?.dob || "Unknown"}\n`;
            if (locations.results && locations.results.length > 0) {
                context += `Locations: ${locations.results.map((l:any) => l.label).join(", ")}\n`;
            }

            const list = await this.env.BUCKET.list({ prefix: `documents/${this.userId}/` });
            if (list && list.objects.length > 0) {
                context += `\n[DOCUMENTS]\n`;
                for (const object of list.objects) {
                    const file = await this.env.BUCKET.get(object.key);
                    if (file) context += `--- ${object.key} ---\n${(await file.text()).slice(0, 30000)}\n`;
                }
            }
            return context;
        } catch (e: any) {
            return `Error gathering context: ${e.message}`;
        }
    }

    // ... runWriterAgent, resetForNextChapter, streamGemini, callGemini (Same as previous) ...
    // Include the rest of the file methods here as they were in the previous correct version
    async runWriterAgent(ws: WebSocket) {
        this.broadcastLog(ws, "Writing chapter...");
        const fullContext = await this.gatherFullContext(ws);
        const systemPrompt = `You are a biographer. Write the next chapter in First Person (I) based on:\n${fullContext}\nNotes: ${JSON.stringify(this.notes)}`;
        
        this.currentDraft = ""; 
        ws.send(JSON.stringify({ type: 'draft_chunk', content: "", reset: true }));

        try {
            await this.streamGemini(systemPrompt, ws);
            await this.state.storage.put("currentDraft", this.currentDraft);
        } catch (e: any) {
            this.broadcastLog(ws, `Writer Error: ${e.message}`);
        }
    }

    async resetForNextChapter(ws: WebSocket) {
        this.history = [];
        this.notes = [];   
        this.mode = 'interview'; 
        this.currentDraft = "";
        await this.state.storage.put("history", this.history);
        await this.state.storage.put("notes", this.notes);
        await this.state.storage.put("mode", this.mode);
        await this.state.storage.put("currentDraft", this.currentDraft);
        ws.send(JSON.stringify({ type: 'init' }));
    }

    async streamGemini(prompt: string, ws: WebSocket) {
        // ... (standard streaming implementation)
        const accountId = this.config.accountId;
        const gatewayId = this.config.gatewayId;
        const apiKey = this.config.geminiKey;
        const model = "gemini-2.5-flash";
        this.abortController = new AbortController();
        const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-ai-studio/v1beta/models/${model}:streamGenerateContent?alt=sse`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, ...(this.config.aigToken ? { 'cf-aig-authorization': `Bearer ${this.config.aigToken}` } : {}) },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
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
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
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
                                ws.send(JSON.stringify({ type: 'draft_chunk', content: textChunk, reset: false }));
                            }
                        } catch (e) {}
                    }
                }
            }
        } finally { this.abortController = null; }
    }

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
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, ...(this.config.aigToken ? { 'cf-aig-authorization': `Bearer ${this.config.aigToken}` } : {}) },
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