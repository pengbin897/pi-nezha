/**
 * HTTP Gateway Handler
 * 
 * 将 HTTP server 适配为统一的 GatewayHandler 接口
 */
import { createServer } from "node:http"
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import chalk from "chalk";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { GatewayHandler } from "../manager.js";
import { handlePrompt, handlePromptSync } from "./controller.js";

/**
 * HTTP Gateway 配置
 */
interface HttpGatewayConfig {
	/** 监听端口（默认 3000） */
	port?: number;
	/** 监听地址（默认 127.0.0.1） */
	host?: string;
}

/**
 * HTTP Gateway Handler 实现
 */
class HttpGatewayHandler implements GatewayHandler {
	readonly name = "http";
	private server: Server | null = null;

	constructor(
		private readonly session: AgentSession,
		private readonly config: HttpGatewayConfig,
	) {}

	async startup(): Promise<void> {
		const port = this.config.port ?? 3000;
		const host = this.config.host ?? "127.0.0.1";

		this.server = startHttpServer(this.session, { port, host });
		console.log(chalk.green(`✓ HTTP Gateway started on http://${host}:${port}`));
	}

	async shutdown(): Promise<void> {
		if (!this.server) {
			return;
		}

		await new Promise<void>((resolve, reject) => {
			this.server!.close((err) => {
				if (err) {
					reject(err);
				} else {
					console.log(chalk.dim("HTTP Gateway stopped"));
					resolve();
				}
			});
		});

		this.server = null;
	}
}

/**
 * 创建 HTTP Gateway Handler
 * 
 * 导出函数供 factory 动态加载使用
 */
export async function create(
	session: AgentSession,
	config: Record<string, unknown>,
): Promise<GatewayHandler> {
	return new HttpGatewayHandler(session, config as HttpGatewayConfig);
}


export interface HttpServerOptions {
	port?: number;
	/** Bind address (default: "127.0.0.1" - localhost only for security) */
	host?: string;
}

/**
 * 启动 HTTP server，将 AgentSession 的 prompt 能力暴露为 REST API。
 * 返回 Server 实例以便调用方可以执行 graceful shutdown。
 */
export function startHttpServer(session: AgentSession, options: HttpServerOptions = {}): Server {
	const port = options.port ?? 3000;
	const host = options.host ?? "127.0.0.1";

	const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
		// CORS 头 - 允许本地开发工具调用
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		const url = new URL(req.url ?? "/", `http://${host}:${port}`);
		const pathname = url.pathname;

		try {
			if (req.method === "GET" && pathname === "/health") {
				respondJson(res, 200, { status: "ok", timestamp: Date.now() });
			} else if (req.method === "GET" && pathname === "/v1/status") {
				respondJson(res, 200, {
					model: session.model ? { provider: session.model.provider, id: session.model.id } : null,
					thinkingLevel: session.thinkingLevel,
					isStreaming: session.isStreaming,
					sessionId: session.sessionId,
					sessionName: session.sessionName ?? null,
				});
			} else if (req.method === "POST" && pathname === "/v1/prompt") {
				// SSE 流式返回 agent 事件
				await handlePrompt(session, req, res);
			} else if (req.method === "POST" && pathname === "/v1/prompt/sync") {
				// 同步等待完整响应后返回 JSON
				await handlePromptSync(session, req, res);
			} else {
				respondJson(res, 404, {
					error: { message: "Not Found", type: "invalid_request_error" },
				});
			}
		} catch (err) {
			console.error("[HTTP] Unhandled error:", err);
			if (!res.headersSent) {
				respondJson(res, 500, {
					error: { message: "Internal Server Error", type: "server_error" },
				});
			}
		}
	});

	server.listen(port, host, () => {
		console.log(`[HTTP] Agent API listening on http://${host}:${port}`);
		console.log(`[HTTP] Endpoints:`);
		console.log(`[HTTP]   POST /v1/prompt       - Stream prompt response (SSE)`);
		console.log(`[HTTP]   POST /v1/prompt/sync  - Sync prompt response (JSON)`);
		console.log(`[HTTP]   GET  /v1/status       - Agent status`);
		console.log(`[HTTP]   GET  /health          - Health check`);
	});

	return server;
}

/** 发送 JSON 响应的辅助函数 */
function respondJson(res: ServerResponse, statusCode: number, body: unknown): void {
	const json = JSON.stringify(body);
	res.writeHead(statusCode, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(json),
	});
	res.end(json);
}
