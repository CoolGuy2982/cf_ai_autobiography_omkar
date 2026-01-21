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
            
            if (stored.history) this.history = stored.history;
            if (stored.bookId) this.bookId = stored.bookId;
            if (stored.notes) this.notes = stored.notes;
            if (stored.mode) this.mode = stored.mode;
            if (stored.config) this.config = { ...this.config, ...stored.config };
        });
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
                
                // Sync State
                ws.send(JSON.stringify({ type: 'outline', content: this.bookContext }));
                ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));

                if (this.history.length === 0) {
                    const firstChapter = this.bookContext?.chapters?.[0];
                    const opening = `I've reviewed your outline. We are starting with **${firstChapter?.title || 'Chapter 1'}**. ${firstChapter?.summary || ''}\n\nLet's begin.`;
                    this.history.push({ role: 'assistant', content: opening });
                    ws.send(JSON.stringify({ type: 'response', content: opening, role: 'assistant' }));
                } else {
                    const visibleHistory = this.history
                        .filter(m => m.content && (m.role === 'user' || m.role === 'assistant'))
                        .map(m => ({ role: m.role, content: m.content }));
                    ws.send(JSON.stringify({ type: 'history', content: visibleHistory }));
                }
            } 
            else if (data.type === 'update_notes') {
                // User manual update
                this.notes = data.content;
                await this.state.storage.put("notes", this.notes);
            }
            else if (data.type === 'message') {
                this.history.push({ role: 'user', content: data.content });
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
        if (this.mode === 'interview') {
            await this.runInterviewerAgent(ws);
        } else {
            await this.runInterviewerAgent(ws); 
        }
        await this.state.storage.put("history", this.history);
        await this.state.storage.put("notes", this.notes);
    }

    async runInterviewerAgent(ws: WebSocket) {
        const tools = [
            {
                name: "manage_notepad",
                description: "Manage the user's notepad. You can add new notes, update existing ones to fix errors/add details, or delete irrelevant ones.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: { type: "STRING", enum: ["create", "update", "delete"], description: "The action to perform" },
                        note_content: { type: "STRING", description: "The text content (required for create/update)" },
                        note_id: { type: "STRING", description: "The exact ID of the note (required for update/delete)" }
                    },
                    required: ["action"]
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
            // FIX: Generate the System Prompt INSIDE the loop.
            // This ensures the AI sees the latest notes (including IDs) every single step.
            const currentNotesContext = this.notes.length > 0 
                ? JSON.stringify(this.notes.map(n => ({ id: n.id, content: n.content })))
                : "No notes yet.";

            const systemPrompt = `
            You are an expert biographer.
            GOAL: Interview the user to gather material for their autobiography chapter.
            
            CURRENT NOTEPAD STATE (JSON):
            ${currentNotesContext}
            
            RULES:
            1. Use 'manage_notepad' to record new facts.
            2. If you see an existing note that needs detail, use 'update' with its ID. DO NOT create duplicates.
            3. Be conversational.
            4. Call 'finalize_interview' when ready.
            `;

            try {
                const response = await this.callGemini(systemPrompt, tools);
                const call = response.functionCalls?.[0];

                if (call) {
                    if (call.name === 'manage_notepad') {
                        const { action, note_content, note_id } = call.args;

                        if (action === 'create') {
                            const newNote = { id: crypto.randomUUID(), content: note_content || "New Note" };
                            this.notes.push(newNote);
                        } 
                        else if (action === 'update' && note_id) {
                            this.notes = this.notes.map(n => n.id === note_id ? { ...n, content: note_content } : n);
                        }
                        else if (action === 'delete' && note_id) {
                            this.notes = this.notes.filter(n => n.id !== note_id);
                        }

                        // Save & Sync immediately
                        await this.state.storage.put("notes", this.notes);
                        ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
                        
                        this.history.push({ role: 'tool', functionResponse: { name: 'manage_notepad', response: { success: true } } });
                    } 
                    else if (call.name === 'finalize_interview') {
                        keepGoing = false;
                        this.mode = 'writing';
                        await this.runWriterAgent(ws);
                        return;
                    }
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
        
        if (!accountId || !gatewayId || !apiKey) {
            throw new Error("Missing Credentials");
        }

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
             return { text: "I cannot continue this topic due to safety guidelines.", functionCalls: [] };
        }

        return {
            text: candidate?.content?.parts?.[0]?.text,
            functionCalls: candidate?.content?.parts?.filter((p:any) => p.functionCall).map((p:any) => p.functionCall)
        };
    }
}