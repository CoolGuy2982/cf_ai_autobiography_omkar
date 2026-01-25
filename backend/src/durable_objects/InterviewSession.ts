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
    
    currentDraft: string = "";       
    fullManuscript: string = "";     
    currentChapterIndex: number = 1; 

    isProcessing: boolean = false;
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
            await this.ensureStateLoaded();
        });
    }

    async ensureStateLoaded() {
        const storedMap = await this.state.storage.get([
            "history", "bookId", "userId", "notes", "mode", 
            "currentDraft", "fullManuscript", "currentChapterIndex", 
            "config", "bookContext"
        ]);
        
        this.history = (storedMap.get("history") as ThreadMessage[]) || [];
        this.bookId = (storedMap.get("bookId") as string) || "";
        this.userId = (storedMap.get("userId") as string) || "";
        this.notes = (storedMap.get("notes") as NoteItem[]) || [];
        this.mode = (storedMap.get("mode") as 'interview' | 'writing') || 'interview';
        this.currentDraft = (storedMap.get("currentDraft") as string) || "";
        this.fullManuscript = (storedMap.get("fullManuscript") as string) || "";
        this.currentChapterIndex = (storedMap.get("currentChapterIndex") as number) || 1;
        this.bookContext = (storedMap.get("bookContext") as any) || null;
        
        const storedConfig = storedMap.get("config") as any;
        if (storedConfig) this.config = { ...this.config, ...storedConfig };
    }

    broadcast(message: any) {
        const data = JSON.stringify(message);
        this.state.getWebSockets().forEach(ws => {
            try { ws.send(data); } catch (e) {}
        });
    }

    broadcastLog(message: string) {
        this.broadcast({ type: 'debug_log', content: `[Server] ${message}` });
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
                await this.ensureStateLoaded();
                await this.refreshBookContext();

                ws.send(JSON.stringify({ type: 'outline', content: this.bookContext }));
                ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
                ws.send(JSON.stringify({ type: 'mode_sync', content: this.mode }));
                
                // IMPORTANT: Send current index so frontend knows if we are at the end
                ws.send(JSON.stringify({ type: 'chapter_index_sync', content: this.currentChapterIndex }));

                const totalText = this.fullManuscript + (this.fullManuscript && this.currentDraft ? "\n\n" : "") + this.currentDraft;
                if (totalText) {
                    ws.send(JSON.stringify({ type: 'draft_chunk', content: totalText, reset: true }));
                }

                if (this.mode === 'writing' && this.currentDraft.length > 0 && !this.isProcessing) {
                     ws.send(JSON.stringify({ type: 'draft_complete' }));
                }

                if (this.history.length === 0 && this.mode === 'interview') {
                    const contextSnippet = await this.gatherFullContext(ws);
                    const currentChapter = this.bookContext?.chapters?.find((c: any) => c.index === this.currentChapterIndex);
                    
                    if (currentChapter) {
                        const opening = `Hello! We are working on **Chapter ${this.currentChapterIndex}: ${currentChapter?.title || 'Untitled'}**. ${currentChapter?.summary || ''}\n\n${this.currentChapterIndex === 1 ? "To begin, tell me about how this part of your life started?" : "Ready to move on to this next phase?"}`;
                        this.history.push({ role: 'assistant', content: opening });
                        await this.state.storage.put("history", this.history);
                        ws.send(JSON.stringify({ type: 'response', content: opening, role: 'assistant' }));
                    }
                } else {
                    const visibleHistory = this.history
                        .filter(m => m.content && (m.role === 'user' || m.role === 'assistant'))
                        .map(m => ({ role: m.role, content: m.content }));
                    ws.send(JSON.stringify({ type: 'history', content: visibleHistory }));
                }
            } 
            else if (data.type === 'expand_outline') {
                // === NEW: Handle Outline Expansion ===
                const { instruction } = data;
                await this.runOutlineExpander(instruction);
            }
            else if (data.type === 'patch_note') {
                const { id, content } = data;
                this.notes = this.notes.map(n => n.id === id ? { ...n, content } : n);
                await this.state.storage.put("notes", this.notes);
            }
            else if (data.type === 'update_notes') {
                const clientNotes = Array.isArray(data.content) ? data.content as NoteItem[] : [];
                if (clientNotes.length > 0) {
                    this.notes = clientNotes;
                    await this.state.storage.put("notes", this.notes);
                    ws.send(JSON.stringify({ type: 'notes_sync', content: this.notes }));
                }
            }
            else if (data.type === 'retry_chapter') {
                this.currentDraft = "";
                await this.state.storage.put("currentDraft", "");
                this.broadcast({ type: 'draft_chunk', content: this.fullManuscript + (this.fullManuscript ? "\n\n" : ""), reset: true });
                await this.runWriterAgent();
            }
            else if (data.type === 'cancel_generation') {
                if (this.abortController) {
                    this.abortController.abort();
                    this.abortController = null;
                }
                this.mode = 'interview';
                await this.state.storage.put("mode", this.mode);
                this.broadcast({ type: 'mode_sync', content: this.mode });
            }
            else if (data.type === 'next_chapter') {
                await this.resetForNextChapter();
            }
            else if (data.type === 'message') {
                if (this.isProcessing || this.mode === 'writing') return;
                this.history.push({ role: 'user', content: data.content });
                await this.state.storage.put("history", this.history);
                await this.processTurn(ws);
            }
        } catch (err: any) {
            console.error("WS Error", err);
        }
    }

    // ... (refreshBookContext, processTurn, runInterviewerAgent, gatherFullContext SAME AS BEFORE) ... 
    // I will explicitly include them for completeness in the final file artifact if requested, 
    // but here I focus on the NEW function:

    async refreshBookContext() {
        if (!this.bookId) return;
        const book = await this.env.DB.prepare("SELECT outline_json, user_id FROM books WHERE id = ?").bind(this.bookId).first();
        if (book) {
            if (book.outline_json) {
                this.bookContext = JSON.parse(book.outline_json as string);
                await this.state.storage.put("bookContext", this.bookContext);
            }
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
        } finally {
            this.isProcessing = false;
        }
    }

    async runInterviewerAgent(ws: WebSocket) {
        // ... (Same tools as before)
        const tools = [
            { name: "create_note", description: "Create a new note.", parameters: { type: "OBJECT", properties: { content: { type: "STRING" } }, required: ["content"] } },
            { name: "finalize_interview", description: "End interview.", parameters: { type: "OBJECT", properties: {}, required: [] } }
        ];

        let keepGoing = true;
        let turns = 0;
        const backgroundContext = await this.gatherFullContext(ws);

        while (keepGoing && turns < 5) {
            turns++;
            const storedNotes = await this.state.storage.get<NoteItem[]>("notes");
            if (storedNotes) this.notes = storedNotes;
            const currentNotesContext = this.notes.length > 0 ? JSON.stringify(this.notes) : "[(No notes yet)]";
            const currentChapter = this.bookContext?.chapters?.find((c: any) => c.index === this.currentChapterIndex);

            const systemPrompt = `You are an expert biographer.
            === BOOK CONTEXT ===
            Chapter ${this.currentChapterIndex}: ${currentChapter?.title || "Untitled"}
            Plan: ${currentChapter?.summary || "N/A"}
            === SUBJECT ===
            ${backgroundContext}
            === NOTES ===
            ${currentNotesContext}
            GOAL: Interview the user for details on this chapter. Use 'create_note' for facts. Call 'finalize_interview' when ready.`;

            try {
                const response = await this.callGemini(systemPrompt, tools);
                const calls = response.functionCalls || []; 

                if (calls.length > 0) {
                    for (const call of calls) {
                        if (call.name === 'create_note') {
                            const { content } = call.args;
                            const newNote = { id: crypto.randomUUID(), content: content || "New Note" };
                            this.notes = [...this.notes, newNote];
                            await this.state.storage.put("notes", this.notes);
                            this.history.push({ role: 'tool', functionResponse: { name: 'create_note', response: { success: true } } });
                        } 
                        else if (call.name === 'finalize_interview') {
                            keepGoing = false;
                            this.mode = 'writing';
                            await this.state.storage.put("mode", this.mode);
                            this.broadcast({ type: 'mode_sync', content: this.mode });
                            // Trigger background write
                            await this.runWriterAgent();
                            return;
                        }
                    }
                    await this.state.storage.put("history", this.history);
                    this.broadcast({ type: 'notes_sync', content: this.notes });
                } else {
                    const text = response.text || "...";
                    this.history.push({ role: 'assistant', content: text });
                    await this.state.storage.put("history", this.history);
                    this.broadcast({ type: 'response', content: text, role: 'assistant' });
                    keepGoing = false;
                }
            } catch (e: any) { keepGoing = false; }
        }
    }

    async gatherFullContext(ws?: WebSocket): Promise<string> {
        if (!this.userId) return "User ID not found.";
        let context = "";
        try {
            const user = await this.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(this.userId).first();
            context += `Name: ${user?.name}, DOB: ${user?.dob}\n`;
            const list = await this.env.BUCKET.list({ prefix: `documents/${this.userId}/` });
            if (list) {
                for (const object of list.objects) {
                    const file = await this.env.BUCKET.get(object.key);
                    if (file) context += `--- Doc ---\n${(await file.text()).slice(0, 30000)}\n`;
                }
            }
            return context;
        } catch (e) { return ""; }
    }

    // === NEW: EXPAND OUTLINE AGENT ===
    async runOutlineExpander(userInstruction: string) {
        this.broadcastLog("Expanding outline...");
        
        const tools = [{
            name: "append_chapters",
            description: "Appends new chapters to the book.",
            parameters: {
                type: "OBJECT",
                properties: {
                    new_chapters: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: { title: { type: "STRING" }, summary: { type: "STRING" } },
                            required: ["title", "summary"]
                        }
                    }
                },
                required: ["new_chapters"]
            }
        }];

        const currentOutlineStr = JSON.stringify(this.bookContext?.chapters || []);
        const nextIndex = (this.bookContext?.chapters?.length || 0) + 1;

        const systemPrompt = `You are a helpful editor.
        === CURRENT OUTLINE ===
        ${currentOutlineStr}
        
        === USER REQUEST ===
        "${userInstruction}"
        
        TASK: Generate NEW chapters to continue the story, starting at index ${nextIndex}.
        Use the 'append_chapters' tool to return them.
        `;

        try {
            const response = await this.callGemini(systemPrompt, tools);
            const calls = response.functionCalls || [];
            
            for (const call of calls) {
                if (call.name === 'append_chapters') {
                    const { new_chapters } = call.args;
                    if (new_chapters && Array.isArray(new_chapters)) {
                        // Add IDs and Indices
                        let currentIndex = nextIndex;
                        const formattedChapters = new_chapters.map((c: any) => ({
                            index: currentIndex++,
                            title: c.title,
                            summary: c.summary
                        }));
                        
                        // Update State
                        this.bookContext.chapters = [...this.bookContext.chapters, ...formattedChapters];
                        await this.state.storage.put("bookContext", this.bookContext);
                        
                        // Save to DB
                        await this.env.DB.prepare("UPDATE books SET outline_json = ? WHERE id = ?")
                            .bind(JSON.stringify(this.bookContext), this.bookId).run();

                        // Notify Frontend
                        this.broadcast({ type: 'outline', content: this.bookContext });
                        this.broadcastLog(`Added ${formattedChapters.length} new chapters.`);
                    }
                }
            }
        } catch (e: any) {
            this.broadcastLog(`Expansion Error: ${e.message}`);
        }
    }

    async runWriterAgent() {
        // ... (Same as before)
        this.broadcastLog("Writing chapter...");
        const fullContext = await this.gatherFullContext();
        const currentChapter = this.bookContext?.chapters?.find((c: any) => c.index === this.currentChapterIndex);
        const systemPrompt = `You are a biographer. Write Chapter ${this.currentChapterIndex}: "${currentChapter?.title}".
        Source: ${fullContext}. Notes: ${JSON.stringify(this.notes)}.
        Format: Start with "# Chapter ${this.currentChapterIndex}: ${currentChapter?.title}" then newline.
        First Person (I). Emotional. Narrative.`;
        
        this.currentDraft = "";
        this.broadcast({ type: 'draft_chunk', content: this.fullManuscript + (this.fullManuscript ? "\n\n" : ""), reset: true });

        try {
            await this.streamGemini(systemPrompt);
            await this.state.storage.put("currentDraft", this.currentDraft);
        } catch (e: any) { this.broadcastLog(e.message); } 
        finally { this.broadcast({ type: 'draft_complete' }); }
    }

    async resetForNextChapter() {
        // ... (Save to DB, update indices)
        const chapterId = crypto.randomUUID();
        const currentChapter = this.bookContext?.chapters?.find((c: any) => c.index === this.currentChapterIndex);
        const title = currentChapter?.title || `Chapter ${this.currentChapterIndex}`;

        await this.env.DB.prepare(`INSERT INTO chapters (id, book_id, chapter_index, title, content, status) VALUES (?, ?, ?, ?, ?, ?)`).bind(chapterId, this.bookId, this.currentChapterIndex, title, this.currentDraft, 'completed').run();

        this.fullManuscript += (this.fullManuscript ? "\n\n" : "") + this.currentDraft;
        this.currentDraft = "";
        this.currentChapterIndex += 1; // Increment Index

        this.history = [];
        this.notes = [];   
        this.mode = 'interview'; 
        
        await this.state.storage.put("history", this.history);
        await this.state.storage.put("notes", this.notes);
        await this.state.storage.put("mode", this.mode);
        await this.state.storage.put("currentDraft", this.currentDraft);
        await this.state.storage.put("fullManuscript", this.fullManuscript);
        await this.state.storage.put("currentChapterIndex", this.currentChapterIndex);
        
        // Broadcast new index so frontend knows if we are at the end
        this.broadcast({ type: 'chapter_index_sync', content: this.currentChapterIndex });
        this.broadcast({ type: 'init' });
    }

    async streamGemini(prompt: string) {
        // ... (Standard stream implementation)
        const response = await fetch(`https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gatewayId}/google-ai-studio/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.geminiKey, ...(this.config.aigToken ? { 'cf-aig-authorization': `Bearer ${this.config.aigToken}` } : {}) },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
        });
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;
        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for(const line of lines) {
                if(line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.slice(6));
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                        if(text) {
                            this.currentDraft += text;
                            this.broadcast({ type: 'draft_chunk', content: text, reset: false });
                        }
                    } catch(e) {}
                }
            }
        }
    }

    async callGemini(systemInstruction: string, tools?: any[]) {
        // ... (Standard call implementation)
        const url = `https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gatewayId}/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent`;
        const body: any = { 
            contents: this.history.map(m => ({ 
                role: m.role === 'assistant' ? 'model' : m.role === 'tool' ? 'function' : 'user', 
                parts: m.functionResponse ? [{functionResponse: m.functionResponse}] : m.functionCall ? [{functionCall: m.functionCall}] : [{text: m.content}] 
            })), 
            system_instruction: { parts: [{ text: systemInstruction }] } 
        };
        if (tools) body.tools = [{ function_declarations: tools }];
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.geminiKey, ...(this.config.aigToken ? { 'cf-aig-authorization': `Bearer ${this.config.aigToken}` } : {}) },
            body: JSON.stringify(body)
        });
        const data: any = await resp.json();
        return {
            text: data.candidates?.[0]?.content?.parts?.[0]?.text,
            functionCalls: data.candidates?.[0]?.content?.parts?.filter((p:any) => p.functionCall).map((p:any) => p.functionCall)
        };
    }
}