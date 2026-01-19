import { DurableObject } from "cloudflare:workers";

interface Env {
    DB: D1Database;
    CF_ACCOUNT_ID: string;
    CF_GATEWAY_ID: string;
    GEMINI_API_KEY: string;
    CF_AIG_TOKEN?: string;
}

interface ThreadMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class InterviewSession extends DurableObject {
    state: DurableObjectState;
    env: Env;
    history: ThreadMessage[] = [];
    bookId: string = "";
    bookContext: any = null;

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.state = state;
        this.env = env;
        
        this.state.blockConcurrencyWhile(async () => {
            const stored = await this.state.storage.get<{ history: ThreadMessage[], bookId: string }>(["history", "bookId"]);
            if (stored.history) this.history = stored.history;
            if (stored.bookId) this.bookId = stored.bookId;
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

            const upgradeHeader = request.headers.get("Upgrade");
            if (!upgradeHeader || upgradeHeader !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }

            const webSocketPair = new WebSocketPair();
            const [client, server] = Object.values(webSocketPair);

            this.state.acceptWebSocket(server);

            return new Response(null, {
                status: 101,
                webSocket: client,
            });
        }

        return new Response("Not found", { status: 404 });
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        const text = typeof message === "string" ? message : new TextDecoder().decode(message);

        try {
            const data = JSON.parse(text);

            if (data.type === 'init') {
                if (this.history.length === 0) {
                    let opening = "I'm ready to help you write your story. Where should we begin?";
                    
                    if (this.bookId) {
                        try {
                            const book = await this.env.DB.prepare("SELECT outline_json FROM books WHERE id = ?")
                                .bind(this.bookId).first();
                            
                            if (book && book.outline_json) {
                                this.bookContext = JSON.parse(book.outline_json as string);
                                const firstChapter = this.bookContext.chapters[0];
                                opening = `Hi! I've reviewed your documents and prepared an outline. Let's start with **${firstChapter.title}**. ${firstChapter.summary}. \n\nWhat is your earliest memory related to this?`;
                            }
                        } catch (e) {
                            console.error("Failed to load book context", e);
                        }
                    }

                    this.history.push({ role: 'assistant', content: opening });
                    ws.send(JSON.stringify({ type: 'response', content: opening }));
                } else {
                    this.history.forEach(msg => {
                        ws.send(JSON.stringify({ type: 'response', content: msg.content, role: msg.role }));
                    });
                }
            } else if (data.type === 'message') {
                this.history.push({ role: 'user', content: data.content });

                // 1. Generate Response
                const aiResponse = await this.generateResponse(this.history);
                this.history.push({ role: 'assistant', content: aiResponse });

                ws.send(JSON.stringify({ type: 'response', content: aiResponse }));

                // 2. Draft Update
                if (this.history.length % 3 === 0) {
                   await this.generateDraftUpdate(ws);
                }

                await this.state.storage.put("history", this.history);
            }
        } catch (err) {
            console.error(err);
            ws.send(JSON.stringify({ type: 'error', content: 'Failed to process message' }));
        }
    }

    // Helper: Call AI Gateway
    async callGemini(messages: ThreadMessage[], systemInstruction?: string) {
        const model = "gemini-2.5-flash"; // Standardizing on 2.0-flash
        // FIX: Using v1beta
        const url = `https://gateway.ai.cloudflare.com/v1/${this.env.CF_ACCOUNT_ID}/${this.env.CF_GATEWAY_ID}/google-ai-studio/v1beta/models/${model}:generateContent`;

        const geminiContents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        const body: any = { contents: geminiContents };
        
        // FIX: snake_case for REST API
        if (systemInstruction) {
            body.system_instruction = { parts: [{ text: systemInstruction }] };
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.env.GEMINI_API_KEY
        };

        if (this.env.CF_AIG_TOKEN) {
            headers['cf-aig-authorization'] = `Bearer ${this.env.CF_AIG_TOKEN}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`AI Gateway Error: ${txt}`);
        }

        const data: any = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    async generateResponse(history: ThreadMessage[]): Promise<string> {
        try {
            let systemContent = "You are a warm, empathetic biographer interviewing the user for their autobiography. Ask one question at a time. Be curious and conversational.";
            if (this.bookContext) {
                const currentChapter = this.bookContext.chapters[0];
                systemContent += `\nCurrent Goal: Interview user about Chapter 1: "${currentChapter.title}" - ${currentChapter.summary}. Stick to this topic until exhausted.`;
            }

            return await this.callGemini(history, systemContent);
        } catch (e) {
            console.error("AI Error", e);
            return "I'm listening. Please go on.";
        }
    }

    async generateDraftUpdate(ws: WebSocket) {
        try {
             const recentChat = this.history.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");
             const prompt = `Based on this interview snippet, write a paragraph of autobiography in the first person:\n${recentChat}`;
             
             const text = await this.callGemini([{ role: 'user', content: prompt }]);

             if (text) {
                ws.send(JSON.stringify({
                    type: 'draft_update',
                    content: `\n${text}\n`
                }));
            }
        } catch (e) {
            console.error("Drafting failed", e);
        }
    }
}