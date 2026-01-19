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

            if (data.type === 'init') {
                // Check if we have history. 
                if (this.history.length === 0) {
                    // In a real app, we'd fetch docs from R2/Context here using a Context Manager.
                    // For now, we simulate a "Cold Start" with a broad opening question.
                    const opening = "Hi there! I've been looking forward to helping you write your story. To get started, could you tell me a little bit about where you grew up?";
                    this.history.push({ role: 'assistant', content: opening });
                    ws.send(JSON.stringify({ type: 'response', content: opening }));
                } else {
                    // Send history so client can rebuild UI
                    // We send them as individual messages or a bulk 'history' event. 
                    // For simplicity in this demo, we'll re-send them.
                    this.history.forEach(msg => {
                        ws.send(JSON.stringify({ type: 'response', content: msg.content, role: msg.role }));
                    });
                }
            } else if (data.type === 'message') {
                this.history.push({ role: 'user', content: data.content });

                // 1. Generate Interviewer Response (Gemini)
                const aiResponse = await this.generateResponse(this.history);

                this.history.push({ role: 'assistant', content: aiResponse });

                // 2. Send back to client
                ws.send(JSON.stringify({
                    type: 'response',
                    content: aiResponse
                }));

                // 3. Draft/Outline Update
                // Simulate occasional writing updates after every few messages
                if (this.history.length % 4 === 0) {
                    ws.send(JSON.stringify({
                        type: 'draft_update',
                        content: `\n## New Chapter Insight\n*Reflecting on the early years in ${data.content.substring(0, 15)}...*`
                    }));
                }
            }
        } catch (err) {
            console.error(err);
            ws.send(JSON.stringify({ type: 'error', content: 'Failed to process message' }));
        }
    }

    async closeOrErrorHandler(ws: WebSocket) {
        // Save state to disk so it persists across DO evictions
        await this.state.storage.put("history", this.history);
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        await this.closeOrErrorHandler(ws);
    }

    async webSocketError(ws: WebSocket, error: any) {
        await this.closeOrErrorHandler(ws);
    }

    async generateResponse(history: ThreadMessage[]): Promise<string> {
        try {
            // Using Cloudflare Workers AI
            const messages = history.map(h => ({ role: h.role, content: h.content }));

            const systemPrompt = {
                role: 'system',
                content: "You are a warm, empathetic, and skilled biographer. Your goal is to interview the user to write their autobiography. Ask insightful, open-ended questions. Follow up on interesting details. Keep the tone conversational and supportive. Do not just list questions; engage like a real person."
            };

            // Attempt 1: Gemini
            try {
                const response: any = await this.env.AI.run('@cf/google/gemini-2.0-flash-exp', {
                    messages: [systemPrompt, ...messages]
                });
                if (response && response.response) return response.response;
            } catch (innerErr) {
                console.warn("Gemini failed, trying fallback...", innerErr);
                // Attempt 2: Llama 3 (often more widely available without specific terms)
                const response: any = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                    messages: [systemPrompt, ...messages]
                });
                if (response && response.response) return response.response;
            }

            return "I'm listening. Please go on.";
        } catch (e) {
            console.error("AI Error", e);
            // Return actual error to user for debugging
            return `[System Error] I cannot think right now. Details: ${(e as Error).message}`;
        }
    }
}
