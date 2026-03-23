/**
 * DingTalk Gateway Handler
 * 
 * 将钉钉机器人适配为统一的 GatewayHandler 接口
 */

import type { AgentSession, AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import axios from "axios";
import chalk from "chalk";
import type { GatewayHandler } from "../../manager.js";
import { DWClient, DWClientDownStream } from "./client.js";
import { TOPIC_ROBOT, RobotMessage } from "./constants.js";

/**
 * 钉钉 Gateway 配置
 */
interface DingtalkGatewayConfig {
	/** 应用 Client ID（必需） */
	clientId: string;
	/** 应用 Client Secret（必需） */
	clientSecret: string;
	/** 是否开启调试日志（默认 false） */
	debug?: boolean;
	/** 是否启用心跳保活（默认 true） */
	keepAlive?: boolean;
	/** 断线是否自动重连（默认 true） */
	autoReconnect?: boolean;
}

/**
 * 钉钉 Gateway Handler 实现
 */
class DingtalkGatewayHandler implements GatewayHandler {
	readonly name = "dingtalk";
	private client: DWClient | null = null;
	private isProcessing = false;

	constructor(
		private readonly session: AgentSession,
		private readonly config: DingtalkGatewayConfig,
	) {}

	async startup(): Promise<void> {
		// 验证必需配置
		if (!this.config.clientId || !this.config.clientSecret) {
			throw new Error(
				"DingTalk Gateway requires clientId and clientSecret in configuration",
			);
		}

		// 创建钉钉客户端
		this.client = new DWClient({
			clientId: this.config.clientId,
			clientSecret: this.config.clientSecret,
			debug: this.config.debug ?? false,
			keepAlive: this.config.keepAlive ?? true,
		});

		// 配置自动重连
		this.client.config.autoReconnect = this.config.autoReconnect ?? true;

		// 注册机器人消息回调
		this.client.registerCallbackListener(TOPIC_ROBOT, async (res: DWClientDownStream) => {
			await this.handleRobotMessage(res);
		});

		await this.client.connect();

		console.log(chalk.green("✓ DingTalk Gateway started"));
	}

	private async handleRobotMessage(res: DWClientDownStream): Promise<void> {
		if (!this.client) {
			return;
		}

		if (this.isProcessing) {
			this.client.printDebug("上一条消息正在处理中，忽略新消息");
			return;
		}

		this.isProcessing = true;
		this.client.printDebug("收到钉钉机器人消息");

		const { text, senderStaffId, sessionWebhook } = JSON.parse(
			res.data
		) as RobotMessage;

		const userInput = text?.content?.trim();
		if (!userInput) {
			this.isProcessing = false;
			return;
		}

		const textChunks: string[] = [];

		const unsubscribe = this.session.subscribe((event: AgentSessionEvent) => {
			if (event.type === "message_update") {
				const ame = event.assistantMessageEvent;
				if (ame.type === "text_delta") {
					textChunks.push(ame.delta);
				}
			}
		});

		try {
			await this.session.prompt(userInput, {
				source: "rpc",
			});

			const responseText = textChunks.join("");
			this.client.printDebug(`Agent 响应: ${responseText}`);

			if (responseText) {
				const accessToken = await this.client.getAccessToken();
				const result = await axios({
					url: sessionWebhook,
					method: "POST",
					responseType: "json",
					data: {
						at: {
							atUserIds: [senderStaffId],
							isAtAll: false,
						},
						text: {
							content: responseText,
						},
						msgtype: "text",
					},
					headers: {
						"x-acs-dingtalk-access-token": accessToken,
					},
				});

				if (result?.data) {
					this.client.socketCallBackResponse(res.headers.messageId, result.data);
				}
			}
		} catch (err) {
			this.client.printDebug(`处理消息失败: ${err}`);
			console.error("[DingTalk] 处理消息时出错:", err);
		} finally {
			unsubscribe();
			this.isProcessing = false;
		}
	}

	async shutdown(): Promise<void> {
		if (!this.client) {
			return;
		}

		this.client.disconnect();
		this.client = null;

		console.log(chalk.dim("DingTalk Gateway stopped"));
	}
}

/**
 * 创建钉钉 Gateway Handler
 * 
 * 导出函数供 factory 动态加载使用
 */
export async function create(
	session: AgentSession,
	config: Record<string, unknown>,
): Promise<GatewayHandler> {
	return new DingtalkGatewayHandler(session, config as unknown as DingtalkGatewayConfig);
}
