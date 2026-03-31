/**
 * 配置文件加载器
 * 
 * 支持从 ${getAgentDir()}/nezha.json 或 nezha.yml 加载配置
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  Model,
} from '@mariozechner/pi-ai'
import {
  AuthStorage,
  ModelRegistry,
} from '@mariozechner/pi-coding-agent'

export interface ModelConfig {
	/** 模型提供商，如 "anthropic", "openai", "gemini" 等 */
	provider: string;
	/** 模型名称，如 "claude-3-5-sonnet-20241022" */
	model?: string;
	/** API Key（可选，优先使用环境变量） */
	apiKey?: string;
	/** API Base URL（可选） */
	baseUrl?: string;
	/** 其他提供商特定配置 */
	[key: string]: unknown;
}

export interface ProviderConfig {
	/** 模型提供商，如 "anthropic", "openai", "gemini" 等 */
	provider: string;
	/** 模型名称，如 "claude-3-5-sonnet-20241022" */
	models: string[];
	// openai-completions, anthropic-completions, gemini-completions, etc.
	api: string;
	/** API Key（可选，优先使用环境变量） */
	apiKey: string;
}

/**
 * Gateway 配置项
 * 
 * 关键逻辑：统一的 Gateway 配置结构
 * - type: Gateway 类型标识（如 "http", "dingtalk"）
 * - handler: Handler 模块路径（相对于 gateway 目录）
 * - config: Gateway 特定配置
 */
export interface GatewayConfigItem {
	/** Gateway 类型标识 */
	type: string;
	/** Handler 模块路径（相对于 gateway 目录，如 "http/handler.js", "channels/dingtalk/handler.js"） */
	handler: string;
	/** Gateway 特定配置 */
	config: Record<string, unknown>;
}

/**
 * Gateway 配置集合
 * 数组形式，支持动态注册任意 Gateway
 */
export type GatewayConfig = GatewayConfigItem[];

export interface AgentConfig {
	agentDir: string;
	models: ModelConfig[];
	sysPrompt: string;
	appendSysPrompt: string;
}

/**
 * Nezha 完整配置
 */
export interface NezhaConfig {
	agent?: AgentConfig;
	/** Gateway 配置数组（加载后已由对象形式规范为数组） */
	gateway?: GatewayConfig;
}

/**
 * 当 gateway 写成 YAML 对象（按类型名分组）时，用类型名映射到默认 Handler 模块。
 * 若某一项内显式写了 `handler`，则优先使用该路径（用于自定义 Gateway）。
 */
const GATEWAY_OBJECT_DEFAULT_HANDLERS: Record<string, string> = {
	http: "http/handler.js",
	dingtalk: "channels/dingtalk-stream/handler.js",
	feishu: "channels/feishu/handler.js",
	wechat: "channels/wechat/handler.js",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface Args {
	dev?: boolean;
	help?: boolean;
	workspace?: string;
	agent?: string;
	model?: string;
}

export function parseArgs(args: string[]): Args {
	const result: Args = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg.startsWith("-")) {
			// 错误的参数
			throw new Error(`错误的参数: ${arg}`);
		} else if (arg === "--dev") {
			result.dev = true;
		} else if (arg === "--help") {
			result.help = true;
		} else if (arg === "--workspace" && i + 1 < args.length) {
			result.workspace = args[++i];
		} else if (arg === "--agent" && i + 1 < args.length) {
			result.agent = args[++i];
		}
	}
	return result;
}

/**
 * 将 gateway 配置规范为 GatewayConfigItem[]。
 *
 * - 已为数组时：原样返回（与 nezha.example.yml 中 `gateways:` 数组一致）。
 * - 为普通对象时：按 key（如 http、dingtalk）展开为多条；`enabled: false` 的项不注册；
 *   嵌套对象中的 `handler` 会作为模块路径并从传给 Handler 的 config 中剔除。
 */
export function normalizeGatewayConfig(raw: unknown): GatewayConfig | undefined {
	if (raw === undefined || raw === null) {
		return undefined;
	}
	if (Array.isArray(raw)) {
		return raw as GatewayConfig;
	}
	if (!isPlainObject(raw)) {
		return undefined;
	}

	const items: GatewayConfigItem[] = [];

	for (const [type, rawConfig] of Object.entries(raw)) {
		if (!isPlainObject(rawConfig)) {
			continue;
		}
		const cfg: Record<string, unknown> = { ...rawConfig };

		// 与 nezha.yml 约定一致：仅当显式为 false 时跳过该 Gateway
		if (cfg.enabled === false) {
			continue;
		}

		const handlerOverride =
			typeof cfg.handler === "string" ? cfg.handler : undefined;
		if (handlerOverride !== undefined) {
			delete cfg.handler;
		}

		// `enabled` 只参与是否加载，不传给各 Gateway Handler
		delete cfg.enabled;

		const handler = handlerOverride ?? GATEWAY_OBJECT_DEFAULT_HANDLERS[type];
		if (!handler) {
			console.warn(
				`[nezha] 未知的 gateway 类型 "${type}"；请使用内置类型 (${Object.keys(
					GATEWAY_OBJECT_DEFAULT_HANDLERS,
				).join(", ")}) 或在配置块中设置 handler 字段。`,
			);
			continue;
		}

		items.push({
			type,
			handler,
			config: cfg,
		});
	}

	return items;
}

/**
 * 解析 JSON/YAML 后统一规范化：合并 `gateway` 与兼容键名 `gateways`，并去掉重复字段。
 */
function normalizeLoadedNezhaConfig(raw: Record<string, unknown>): NezhaConfig {
	const gatewayRaw = raw.gateway;
	const { gateway: _gw, ...rest } = raw;
	const out = { ...rest } as NezhaConfig;

	if (gatewayRaw === undefined) {
		return out;
	}

	const normalized = normalizeGatewayConfig(gatewayRaw);
	if (normalized === undefined) {
		throw new Error(
			'无效的 gateway 配置：需要为 { type, handler, config }[] 数组，或为按类型名分组的对象（如 nezha.yml 中的 http、dingtalk）。',
		);
	}
	out.gateway = normalized;
	return out;
}

/**
 * 从指定目录加载 Nezha 配置文件
 * 
 * @param configDir - 配置目录路径（通常是 getAgentDir()）
 * @returns 解析后的配置对象，如果文件不存在则返回 null
 * @throws 如果配置文件格式错误
 */
export function loadNezhaConfig(configDir: string): NezhaConfig | null {
	// 优先尝试加载 nezha.json
	const jsonPath = join(configDir, "nezha.json");
	if (existsSync(jsonPath)) {
		try {			
			const content = readFileSync(jsonPath, "utf-8");
			// 替换环境变量的实际值
			const replacedContent = content.replace(/\${([^}]+)}/g, (match, p1) => {
				const envVar = process.env[p1];
				return envVar !== undefined ? envVar : match;
			});
			const config = JSON.parse(replacedContent) as Record<string, unknown>;
			return normalizeLoadedNezhaConfig(config);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to parse ${jsonPath}: ${message}`);
		}
	}

	// 尝试加载 nezha.yml 或 nezha.yaml
	const ymlPath = join(configDir, "nezha.yml");
	const yamlPath = join(configDir, "nezha.yaml");
	
	for (const path of [ymlPath, yamlPath]) {
		if (existsSync(path)) {
			try {
				const content = readFileSync(path, "utf-8");
				const replacedContent = content.replace(/\${([^}]+)}/g, (match, p1) => {
					const envVar = process.env[p1];
					return envVar !== undefined ? envVar : match;
				});
				const loaded = yaml.load(replacedContent);
				const config = (loaded ?? {}) as Record<string, unknown>;
				return normalizeLoadedNezhaConfig(config);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to parse ${path}: ${message}`);
			}
		}
	}

	// 没有找到配置文件
	return null;
}

/**
 * 验证配置文件的必需字段
 * 
 * @param config - 配置对象
 * @throws 如果缺少必需字段
 */
export function validateNezhaConfig(config: NezhaConfig): void {

}

/**
 * 获取配置值，不再从环境变量读取
 * 
 * @param configValue - 配置文件中的值
 * @returns 配置值
 */
export function getConfigValue(configValue?: string): string | undefined {
	return configValue;
}


