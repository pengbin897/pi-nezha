/**
 * HTTP handler for /v1/prompt - 将 AgentSession.prompt() 暴露为 REST API。
 *
 * 流式模式 (POST /v1/prompt):
 *   请求体: { "text": "...", "images": [...], "expandPromptTemplates": true/false }
 *   响应: SSE 事件流，每个事件格式为 "data: {json}\n\n"
 *
 * 同步模式 (POST /v1/prompt/sync):
 *   请求体: 同上
 *   响应: JSON { "text": "...", "toolCalls": [...], "usage": {...}, "stopReason": "..." }
 *
 * SSE 事件类型:
 *   - text_delta:    { type: "text_delta", delta: "..." }                增量文本
 *   - text_end:      { type: "text_end", content: "..." }               文本块结束
 *   - thinking_delta: { type: "thinking_delta", delta: "..." }           增量思考
 *   - thinking_end:  { type: "thinking_end", content: "..." }            思考块结束
 *   - tool_start:    { type: "tool_start", toolName, toolCallId, args }  工具调用开始
 *   - tool_end:      { type: "tool_end", toolName, toolCallId, result, isError } 工具调用结束
 *   - turn_end:      { type: "turn_end" }                                一轮结束
 *   - agent_end:     { type: "agent_end" }                               agent 完成
 *   - error:         { type: "error", message: "..." }                   错误
 *   - done:          { type: "done" }                                    流结束
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentSession } from "@mariozechner/pi-coding-agent";

interface ImageContent {
	type: "image";
	mimeType: string;
	data: string;
}

/**
 * 从 IncomingMessage 中读取并解析 JSON body。
 * 限制 body 大小为 10MB 防止内存溢出。
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
	const MAX_BODY_SIZE = 10 * 1024 * 1024;
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;

		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_SIZE) {
				req.destroy();
				reject(new Error("Request body too large (max 10MB)"));
				return;
			}
			chunks.push(chunk);
		});

		req.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf-8");
				resolve(JSON.parse(raw));
			} catch {
				reject(new Error("Invalid JSON body"));
			}
		});

		req.on("error", reject);
	});
}

interface PromptRequest {
	text: string;
	images?: ImageContent[];
	expandPromptTemplates?: boolean;
}

/**
 * 校验请求体，确保 text 字段存在且为字符串。
 */
function parsePromptBody(body: unknown): PromptRequest {
	if (!body || typeof body !== "object") {
		throw new Error("Request body must be a JSON object");
	}

	const obj = body as Record<string, unknown>;

	if (typeof obj.text !== "string" || obj.text.trim().length === 0) {
		throw new Error("'text' field is required and must be a non-empty string");
	}

	const images = Array.isArray(obj.images)
		? obj.images.map((img: unknown) => ({
				type: "image" as const,
				mimeType: String((img as Record<string, unknown>).mimeType ?? (img as Record<string, unknown>).mediaType ?? "image/png"),
				data: String((img as Record<string, unknown>).data ?? ""),
			}))
		: undefined;

	return {
		text: obj.text,
		images,
		expandPromptTemplates: typeof obj.expandPromptTemplates === "boolean" ? obj.expandPromptTemplates : undefined,
	};
}

/** 向 SSE 流写入一个事件 */
function sendSseEvent(res: ServerResponse, data: unknown): void {
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /v1/prompt — 流式 SSE 响应。
 * 订阅 AgentSession 事件，将 assistant message 相关事件转发给客户端。
 * prompt() 返回后发送 done 事件并关闭连接。
 */
export async function handlePrompt(
	session: AgentSession,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	let body: PromptRequest;
	try {
		const raw = await readJsonBody(req);
		body = parsePromptBody(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Bad request";
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: { message, type: "invalid_request_error" } }));
		return;
	}

	if (session.isStreaming) {
		res.writeHead(409, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				error: { message: "Agent is currently streaming another request", type: "conflict_error" },
			}),
		);
		return;
	}

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});

	/**
	 * 关键逻辑：订阅 AgentSession 事件，将相关事件转发为 SSE 格式
	 * message_update 包含 assistantMessageEvent，其中有 text_delta、text_end 等事件
	 * tool_execution_start/end 是工具执行事件
	 */
	const unsubscribe = session.subscribe((event) => {
		try {
			switch (event.type) {
				case "message_update": {
					// 流式 assistant message 事件：提取文本/思考的增量和结束事件
					const ame = event.assistantMessageEvent;
					if (ame.type === "text_delta") {
						sendSseEvent(res, { type: "text_delta", delta: ame.delta });
					} else if (ame.type === "text_end") {
						sendSseEvent(res, { type: "text_end", content: ame.content });
					} else if (ame.type === "thinking_delta") {
						sendSseEvent(res, { type: "thinking_delta", delta: ame.delta });
					} else if (ame.type === "thinking_end") {
						sendSseEvent(res, { type: "thinking_end", content: ame.content });
					} else if (ame.type === "toolcall_end") {
						sendSseEvent(res, {
							type: "tool_call",
							toolName: ame.toolCall.name,
							toolCallId: ame.toolCall.id,
							args: ame.toolCall.arguments,
						});
					} else if (ame.type === "error") {
						sendSseEvent(res, {
							type: "error",
							message: ame.error.stopReason === "error" ? "LLM returned an error" : "Request aborted",
						});
					}
					break;
				}
				case "tool_execution_start":
					sendSseEvent(res, {
						type: "tool_start",
						toolName: event.toolName,
						toolCallId: event.toolCallId,
						args: event.args,
					});
					break;
				case "tool_execution_end":
					sendSseEvent(res, {
						type: "tool_end",
						toolName: event.toolName,
						toolCallId: event.toolCallId,
						result: event.result,
						isError: event.isError,
					});
					break;
				case "turn_end":
					sendSseEvent(res, { type: "turn_end" });
					break;
				case "agent_end":
					sendSseEvent(res, { type: "agent_end" });
					break;
			}
		} catch (err) {
			// 忽略写入错误（客户端可能已断开）
		}
	});

	// 客户端断开时取消订阅
	req.on("close", () => {
		unsubscribe();
	});

	try {
		await session.prompt(body.text, {
			images: body.images,
			expandPromptTemplates: body.expandPromptTemplates,
		});
		sendSseEvent(res, { type: "done" });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		sendSseEvent(res, { type: "error", message });
	} finally {
		unsubscribe();
		res.end();
	}
}

/**
 * POST /v1/prompt/sync — 同步 JSON 响应。
 * 等待 prompt 执行完成后，收集所有文本内容和工具调用信息，一次性返回。
 */
export async function handlePromptSync(
	session: AgentSession,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	let body: PromptRequest;
	try {
		const raw = await readJsonBody(req);
		body = parsePromptBody(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Bad request";
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: { message, type: "invalid_request_error" } }));
		return;
	}

	if (session.isStreaming) {
		res.writeHead(409, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				error: { message: "Agent is currently streaming another request", type: "conflict_error" },
			}),
		);
		return;
	}

	const textChunks: string[] = [];
	const toolCalls: Array<{ name: string; id: string; args: unknown; result: unknown; isError: boolean }> = [];

	/**
	 * 关键逻辑：订阅 AgentSession 事件，收集文本和工具调用信息
	 */
	const unsubscribe = session.subscribe((event) => {
		switch (event.type) {
			case "message_update": {
				// 流式 assistant message 事件：收集文本增量
				const ame = event.assistantMessageEvent;
				if (ame.type === "text_delta") {
					textChunks.push(ame.delta);
				}
				break;
			}
			case "tool_execution_start":
				toolCalls.push({
					name: event.toolName,
					id: event.toolCallId,
					args: event.args,
					result: null,
					isError: false,
				});
				break;
			case "tool_execution_end": {
				const call = toolCalls.find((c) => c.id === event.toolCallId && c.name === event.toolName);
				if (call) {
					call.result = event.result;
					call.isError = event.isError;
				}
				break;
			}
		}
	});

	try {
		await session.prompt(body.text, {
			images: body.images,
			expandPromptTemplates: body.expandPromptTemplates,
		});
		const response = {
			text: textChunks.join(""),
			toolCalls: toolCalls.map((c) => ({
				toolName: c.name,
				toolCallId: c.id,
				args: c.args,
				result: c.result,
				isError: c.isError,
			})),
		};
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(response));
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		res.writeHead(500, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: { message, type: "server_error" } }));
	} finally {
		unsubscribe();
	}
}
