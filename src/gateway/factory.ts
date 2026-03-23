/**
 * Gateway 工厂 - 动态加载器
 * 
 * 负责根据配置动态加载和创建 Gateway Handler
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { GatewayHandler } from "./manager.js";
import type { NezhaConfig, GatewayConfigItem } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Gateway Handler 工厂函数接口
 * 每个 Gateway Handler 模块导出一个 create 函数
 */
export interface GatewayHandlerFactory {
	/**
	 * 创建 Gateway Handler
	 * @param session - AgentSession 实例
	 * @param config - Gateway 特定的配置
	 * @returns Handler 实例
	 */
	create(session: AgentSession, config: Record<string, unknown>): Promise<GatewayHandler>;
}

/**
 * 动态加载 Gateway Handler 模块
 * 
 * @param handlerPath - Handler 模块路径（相对于 gateway 目录）
 * @returns Gateway Handler 工厂
 */
async function loadGatewayHandlerModule(handlerPath: string): Promise<GatewayHandlerFactory> {
	// 构建绝对路径
	const absolutePath = join(__dirname, handlerPath);
	
	try {
		// 动态导入模块
		const module = await import(absolutePath);
		
		// 检查模块是否导出 create 函数
		if (!module.create || typeof module.create !== "function") {
			throw new Error(`Gateway handler module "${handlerPath}" must export a "create" function`);
		}
		
		return module as GatewayHandlerFactory;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to load gateway handler "${handlerPath}": ${message}`);
	}
}

/**
 * 根据配置创建所有 Gateway Handler
 * 
 * 关键逻辑：从配置文件动态加载 Gateway Handler
 * - 遍历配置数组
 * - 动态导入每个 Handler 模块
 * - 调用 create 函数创建实例
 * 
 * @param session - AgentSession 实例
 * @param config - Nezha 配置对象
 * @returns 创建的 Handler 数组
 */
export async function createGatewayHandlers(
	session: AgentSession,
	config: NezhaConfig,
): Promise<GatewayHandler[]> {
	const gateways = config.gateway ?? [];
	const handlers: GatewayHandler[] = [];

	for (const gatewayConfig of gateways) {
		try {
			// 动态加载 Handler 模块
			const factory = await loadGatewayHandlerModule(gatewayConfig.handler);
			
			// 创建 Handler 实例
			const handler = await factory.create(session, gatewayConfig.config);
			
			handlers.push(handler);
			
			console.log(`✓ Loaded gateway: ${gatewayConfig.type} (${gatewayConfig.handler})`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`✗ Failed to load gateway "${gatewayConfig.type}": ${message}`);
			// 继续加载其他 Gateway，不中断整个流程
		}
	}

	return handlers;
}
