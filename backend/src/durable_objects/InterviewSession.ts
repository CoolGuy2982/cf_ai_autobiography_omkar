import { DurableObject } from "cloudflare:workers";

interface Env {
    AI: any; // We'll refine this type
    DB: D1Database;
}

interface ThreadMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class InterviewSession extends DurableObject {
    state: DurableObjectState;
    env: Env;
    history: ThreadMessage[] = [];
    currentDraft: string = "";

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.state = state;
        this.env = env;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/websocket") {
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

            if (data.type === 'message') {
                // Restore history from storage if needed (naive in-memory for now, assuming object stays alive)
                // Ideally: this.history = await this.state.storage.get("history") || [];

                this.history.push({ role: 'user', content: data.content });

                // 1. Generate Interviewer Response (Gemini 3 Flash)
                const aiResponse = await this.generateResponse(this.history);

                this.history.push({ role: 'assistant', content: aiResponse });

                // 2. Send back to client
                ws.send(JSON.stringify({
                    type: 'response',
                    content: aiResponse
                }));

                // 3. Draft/Outline Update (Background or parallel)
                // We can trigger a separate AI call here to update the draft based on new info
                // await this.updateDraft(); 
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', content: 'Failed to process message' }));
        }
    }

    async closeOrErrorHandler(ws: WebSocket) {
        // Save state
        await this.state.storage.put("history", this.history);
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        await this.closeOrErrorHandler(ws);
    }

    async webSocketError(ws: WebSocket, error: any) {
        await this.closeOrErrorHandler(ws);
    }

    async generateResponse(history: ThreadMessage[]): Promise<string> {
        // Basic Gemini Integration via Cloudflare AI Gateway
        // Note: 'gemini-3-flash' ID might vary, usually it's just 'google/gemini-pro' or similar alias in Workers AI,
        // but for Gateway we use the REST API.
        // If using Workers AI binding directly:

        try {
            // Placeholder for actual AI call
            // const response = await this.env.AI.run('@cf/google/gemini-2.0-flash-exp', { messages: history });
            // return response.response;

            return "I am simulating a response for now. Gemini integration pending.";
        } catch (e) {
            console.error("AI Error", e);
            return "Sorry, I am having trouble thinking right now.";
        }
    }
}
