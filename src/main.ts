#!/usr/bin/env node
import { join } from "node:path";
import { homedir } from "os";
import chalk from "chalk";
import cron from "node-cron";
import {
	createAgentSession,
	InteractiveMode,
	SettingsManager,
	AuthStorage,
	ModelRegistry,
	LoadExtensionsResult,
	
	type CreateAgentSessionOptions,
	DefaultResourceLoader,
} from "@mariozechner/pi-coding-agent";
import { loadNezhaConfig, parseArgs } from "./config.js";
import { GatewayManager } from "./gateway/manager.js";
import { createGatewayHandlers } from "./gateway/factory.js";


function reportSettingsErrors(settingsManager: SettingsManager, context: string): void {
	const errors = settingsManager.drainErrors();
	for (const { scope, error } of errors) {
		console.error(chalk.yellow(`Warning (${context}, ${scope} settings): ${error.message}`));
		if (error.stack) {
			console.error(chalk.dim(error.stack));
		}
	}
}

async function startCronTasks(): Promise<void> {
	const cronTask = cron.schedule('0 0 * * *', async () => {
		console.log('定时任务执行');
	});
	await cronTask.start();
}

export async function main(args: string[]) {
	/**
	 * 关键逻辑：从配置文件加载 Nezha 配置
	 * 配置文件位于 ${agentDir}/nezha.json 或 nezha.yml
	 */
	// const config = loadNezhaConfig(agentDir);

// 	if (!config) {
// 		console.error(chalk.red(`No configuration file found in ${agentDir}`));
// 		console.error(chalk.yellow("\nCreate a nezha.json or nezha.yml file with the following structure:"));
// 		console.error(chalk.dim(`{
//   "agent": {
//     "models": {
//       "provider": "anthropic"
//     }
//   },
//   "gateways": {
//     "http": {
//       "enabled": true,
//       "port": 3000
//     }
//   }
// }`));
// 		console.error(chalk.yellow(`\nOr set environment variables and run without config file.`));
// 		process.exit(1);
// 	}

// 	// 验证配置
// 	try {
// 		validateNezhaConfig(config);
// 	} catch (error) {
// 		const message = error instanceof Error ? error.message : String(error);
// 		console.error(chalk.red(`Invalid configuration: ${message}`));
// 		process.exit(1);
// 	}

// 	/**
// 	 * 关键逻辑：根据配置创建 AgentSession
// 	 * 环境变量优先于配置文件
// 	 */
// 	const sessionOptions: CreateAgentSessionOptions = {
// 		workspacePath: config.agent.workspacePath,
// 		agentDir: config.agent.agentDir,
// 		// 其他选项可以从 config.agent 中提取
// 		...config.agent,
// 	};

	const parsedArgs = parseArgs(args);
	// 生产运行默认工作目录为 ~/nezha-workspace， agent目录为 ~/nezha-workspace/agent
	let cwd: string = join(homedir(), "nezha-workspace");
	let agentDir: string = join(cwd, "agent");

	if (parsedArgs.dev) {
		console.info(chalk.cyan("Running in development mode"));
		cwd = process.cwd();
		agentDir = cwd;
	} else {
		console.info(chalk.cyan("Running in production mode"));
		if (parsedArgs.workspace) {
			cwd = parsedArgs.workspace;
		}
	}
	const nezhaConfig = loadNezhaConfig(cwd);
	agentDir = nezhaConfig?.agent?.agentDir ?? join(cwd, "agent");
	
	const settingsManager = SettingsManager.create(cwd, agentDir);
	reportSettingsErrors(settingsManager, "startup");
	const authStorage = AuthStorage.create();
	const modelRegistry = new ModelRegistry(authStorage, join(agentDir, "models.json"));

	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		// additionalExtensionPaths: firstPass.extensions,
		additionalSkillPaths: [join(cwd, "skills")],
		// additionalPromptTemplatePaths: firstPass.promptTemplates,
		// additionalThemePaths: firstPass.themes,
		// noExtensions: firstPass.noExtensions,
		// noSkills: firstPass.noSkills,
		// noPromptTemplates: firstPass.noPromptTemplates,
		// noThemes: firstPass.noThemes,
		// systemPrompt: firstPass.systemPrompt,
		// appendSystemPrompt: firstPass.appendSystemPrompt,
	});
	await resourceLoader.reload();

	const extensionsResult: LoadExtensionsResult = resourceLoader.getExtensions();
	for (const { path, error } of extensionsResult.errors) {
		console.error(chalk.red(`Failed to load extension "${path}": ${error}`));
	}

	// Apply pending provider registrations from extensions immediately
	// so they're available for model resolution before AgentSession is created
	for (const { name, config } of extensionsResult.runtime.pendingProviderRegistrations) {
		modelRegistry.registerProvider(name, config);
	}
	extensionsResult.runtime.pendingProviderRegistrations = [];

	const extensionFlags = new Map<string, { type: "boolean" | "string" }>();
	for (const ext of extensionsResult.extensions) {
		for (const [name, flag] of ext.flags) {
			extensionFlags.set(name, { type: flag.type });
		}
	}

	const { session, modelFallbackMessage } = await createAgentSession({
		cwd,
		agentDir,
		modelRegistry,
		resourceLoader
	});
	if (!session) {
		console.error(chalk.red("No models available."));
		console.error(chalk.yellow("\nSet an API key environment variable:"));
		console.error("  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.");
		console.error(chalk.yellow(`\nOr configure models.provider and models.apiKey in ${agentDir}/nezha.json`));
		process.exit(1);
	}

	/**
	 * 关键逻辑：统一的 Gateway 管理
	 * 1. 从配置文件加载 Gateway 配置数组
	 * 2. 动态加载并创建所有 Gateway Handler
	 * 3. 使用 GatewayManager 统一管理启动和停止
	 * 4. 若有 Gateway 启用，则进入常驻状态；否则进入交互模式
	 */
	if (!nezhaConfig) {
		console.error(chalk.red(`No configuration file found in ${cwd}`));
		console.error(chalk.yellow(`\nCreate a nezha.json or nezha.yml file. See nezha.example.json for reference.`));
		process.exit(1);
	}
	if (!nezhaConfig.gateway || nezhaConfig.gateway.length === 0) {
		console.info(chalk.cyan(`No gateways configured in ${cwd}/nezha.json(nezha.yml)`));
		console.info(chalk.cyan(`\nAdd at least one gateway to the "gateways" array.`));
	} else {
		console.info(chalk.cyan(`load nezha config: ${nezhaConfig}`));
		const gatewayManager = new GatewayManager();
		
		// 动态加载并创建所有 Gateway Handler
		console.log(chalk.cyan(`Loading ${nezhaConfig.gateway.length} gateway(s)...`));
		const handlers = await createGatewayHandlers(session, nezhaConfig);

		// 注册所有 Handler
		for (const handler of handlers) {
			gatewayManager.register(handler);
		}

		// 如果有 Gateway 启用，进入 Gateway 模式
		if (gatewayManager.handlerCount > 0) {
			console.log(chalk.cyan(`Starting ${gatewayManager.handlerCount} gateway(s): ${gatewayManager.getHandlerNames().join(", ")}`));

			try {
				// 启动所有 Gateway
				await gatewayManager.startup();

				console.log(chalk.green("All gateways started successfully"));
				console.log(chalk.dim("Running in gateway mode. Press Ctrl+C to stop."));

				/**
				 * 关键逻辑：注册统一的 shutdown 处理
				 * 确保进程退出时回收所有资源
				 */
				let stopping = false;
				const shutdown = async () => {
					if (stopping) return;
					stopping = true;
					console.log(chalk.dim("\nShutting down gateways..."));

					try {
						await gatewayManager.shutdown();
						console.log(chalk.green("All gateways stopped"));
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						console.error(chalk.yellow(`Shutdown errors: ${message}`));
					}
				};

				process.on("SIGINT", () => {
					void shutdown().finally(() => process.exit(0));
				});
				process.on("SIGTERM", () => {
					void shutdown().finally(() => process.exit(0));
				});

			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(chalk.red(`Failed to start gateways: ${message}`));
				process.exit(1);
			}
		}
	}
	// 启动定时任务
	await startCronTasks();

	// 同时启动交互模式
	const mode = new InteractiveMode(session);
	await mode.run();
}


import dotenv from 'dotenv';
dotenv.config();

main(process.argv.slice(2));
