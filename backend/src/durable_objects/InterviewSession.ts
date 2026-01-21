import { DurableObject } from "cloudflare:workers";

interface Env {
    DB: D1Database;
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
    bookContext: any = null;
    notes: NoteItem[] = [];
    mode: 'interview' | 'writing' = 'interview';
    isProcessing: boolean = false;
    
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
                notes: NoteItem[],
                mode: 'interview' | 'writing',
                config: any
            }>(["history", "bookId", "notes", "mode", "config"]);
            
            this.history = stored.history || [];
            this.bookId = stored.bookId || "";
            this.notes = stored.notes || []; 
            this.mode = stored.mode || 'interview';
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
                
                this.broadcastLog(ws, `Init session. Loaded ${this.notes.length} notes.`);

                if (this.history.length === 0) {
                    const firstChapter = this.bookContext?.chapters?.[0];
                    const opening = `I've reviewed your outline. We are starting with **${firstChapter?.title || 'Chapter 1'}**. ${firstChapter?.summary || ''}\n\nLet's begin.`;
                    this.history.push({ role: 'assistant', content: opening });
                    ws.send(JSON.stringify({ type: 'response', content: opening, role: 'assistant' }));
                    await this.state.storage.put("history", this.history);
                } else {
                    const visibleHistory = this.history
                        .filter(m => m.content && (m.role === 'user' || m.role === 'assistant'))
                        .map(m => ({ role: m.role, content: m.content }));
                    ws.send(JSON.stringify({ type: 'history', content: visibleHistory }));
                }
            } 
            else if (data.type === 'update_notes') {
                const clientNotes = Array.isArray(data.content) ? data.content as NoteItem[] : [];
                
                // === ROBUST MERGE STRATEGY ===
                // 1. We iterate over SERVER notes. If the client has a matching ID with different content, we update.
                // 2. We find NEW notes in the client list and add them.
                // 3. We DO NOT delete notes just because they are missing from clientNotes. 
                //    (This prevents race conditions where client state is stale/empty)

                let hasChanges = false;
                
                // Update existing
                const newNotesArray = this.notes.map(serverNote => {
                    const clientVersion = clientNotes.find(n => n.id === serverNote.id);
                    if (clientVersion && clientVersion.content !== serverNote.content) {
                        hasChanges = true;
                        return { ...serverNote, content: clientVersion.content };
                    }
                    return serverNote;
                });

                // Add new from client
                const purelyNewFromClient = clientNotes.filter(cn => !this.notes.some(sn => sn.id === cn.id));
                if (purelyNewFromClient.length > 0) {
                    hasChanges = true;
                    newNotesArray.push(...purelyNewFromClient);
                    this.broadcastLog(ws, `Added ${purelyNewFromClient.length} manual notes.`);
                }

                if (hasChanges) {
                    this.notes = newNotesArray;
                    await this.state.storage.put("notes", this.notes);
                    // Bounce back the authoritative merged state
                    ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
                }
            }
            else if (data.type === 'message') {
                if (this.isProcessing) {
                    this.broadcastLog(ws, "BUSY: Ignored user message while processing.");
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
                    properties: {
                        content: { type: "STRING", description: "The content of the new note." }
                    },
                    required: ["content"]
                }
            },
            {
                name: "append_to_note",
                description: "Add details to an EXISTING note. Appends text to the end.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        note_id: { type: "STRING", description: "The ID of the note to append to." },
                        content_to_add: { type: "STRING", description: "The text to add." }
                    },
                    required: ["note_id", "content_to_add"]
                }
            },
            {
                name: "delete_note",
                description: "Remove a note completely.",
                parameters: {
                    type: "OBJECT",
                    properties: { note_id: { type: "STRING" } },
                    required: ["note_id"]
                }
            },
            {
                name: "finalize_interview",
                description: "Call this when you are ready to write the chapter.",
                parameters: { type: "OBJECT", properties: {}, required: [] }
            }
        ];

        let keepGoing = true;
        
        while (keepGoing) {
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
            2. Use 'append_to_note' to add details to existing notes.
            3. Be conversational.
            `;

            try {
                const response = await this.callGemini(systemPrompt, tools);
                const call = response.functionCalls?.[0];

                if (call) {
                    if (call.name === 'create_note') {
                        const { content } = call.args;
                        const newNote = { id: crypto.randomUUID(), content: content || "New Note" };
                        
                        // Use spread to ensure new array reference
                        this.notes = [...this.notes, newNote];
                        
                        this.broadcastLog(ws, `AI Created Note: ${newNote.id.substring(0,4)}`);
                        this.history.push({ role: 'tool', functionResponse: { name: 'create_note', response: { success: true, noteId: newNote.id } } });
                    } 
                    else if (call.name === 'append_to_note') {
                        const { note_id, content_to_add } = call.args;
                        const target = this.notes.find(n => n.id === note_id);
                        
                        if (target) {
                            const prefix = target.content.endsWith(' ') ? '' : ' ';
                            const newContent = target.content + prefix + content_to_add;
                            
                            this.notes = this.notes.map(n => n.id === note_id ? { ...n, content: newContent } : n);
                            
                            this.broadcastLog(ws, `AI Appended to: ${note_id.substring(0,4)}`);
                            this.history.push({ role: 'tool', functionResponse: { name: 'append_to_note', response: { success: true, currentContent: newContent } } });
                        } else {
                            this.broadcastLog(ws, `AI Failed Append: ${note_id} not found`);
                            this.history.push({ role: 'tool', functionResponse: { name: 'append_to_note', response: { error: "Note not found" } } });
                        }
                    }
                    else if (call.name === 'delete_note') {
                        const { note_id } = call.args;
                        this.notes = this.notes.filter(n => n.id !== note_id);
                        this.broadcastLog(ws, `AI Deleted: ${note_id}`);
                        this.history.push({ role: 'tool', functionResponse: { name: 'delete_note', response: { success: true } } });
                    }
                    else if (call.name === 'finalize_interview') {
                        keepGoing = false;
                        this.mode = 'writing';
                        await this.runWriterAgent(ws);
                        return;
                    }

                    // Save & Sync immediately
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
                ws.send(JSON.stringify({ type: 'response', content: `(System: ${e.message})`, role: 'assistant' }));
                keepGoing = false;
            }
        }
    }

    async runWriterAgent(ws: WebSocket) {
        ws.send(JSON.stringify({ type: 'response', content: "Drafting your chapter now...", role: 'assistant' }));
        const notesText = this.notes.map(n => `- ${n.content}`).join("\n");
        const prompt = `Write the autobiography chapter based on these notes:\n${notesText}\n\nWrite in first person.`;
        
        try {
            const response = await this.callGemini(prompt, undefined);
            const draft = response.text || "";
            ws.send(JSON.stringify({ type: 'draft_final', content: draft }));
            this.history.push({ role: 'assistant', content: "I've updated the manuscript." });
        } catch (e: any) {
            ws.send(JSON.stringify({ type: 'response', content: `Writing failed: ${e.message}`, role: 'assistant' }));
        }
    }

    async callGemini(systemInstruction: string, tools?: any[]) {
        const accountId = this.config.accountId;
        const gatewayId = this.config.gatewayId;
        const apiKey = this.config.geminiKey;
        
        if (!accountId || !gatewayId || !apiKey) throw new Error("Missing Credentials");

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

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`AI Gateway refused: ${resp.status} - ${errorText}`);
        }

        const data: any = await resp.json();
        const candidate = data.candidates?.[0];

        if (candidate?.finishReason === "SAFETY") {
             return { text: "Safety guardrail triggered.", functionCalls: [] };
        }

        return {
            text: candidate?.content?.parts?.[0]?.text,
            functionCalls: candidate?.content?.parts?.filter((p:any) => p.functionCall).map((p:any) => p.functionCall)
        };
    }
}