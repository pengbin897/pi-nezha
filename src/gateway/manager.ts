/**
 * Gateway Handler 接口
 * 定义了统一的生命周期方法
 */
export interface GatewayHandler {
	/** Gateway 名称（如 "http", "dingtalk", "feishu"） */
	readonly name: string;
	
	/**
	 * 启动 Gateway
	 * @throws 如果启动失败
	 */
	startup(): Promise<void>;
	
	/**
	 * 停止 Gateway 并回收资源
	 */
	shutdown(): Promise<void>;
}


/**
 * Gateway 管理器
 * 负责管理所有 Gateway Handler 的生命周期
 */
export class GatewayManager {
	private handlers: GatewayHandler[] = [];
	private isStarted = false;

	/**
	 * 注册一个 Gateway Handler
	 * @param handler - Gateway Handler 实例
	 */
	register(handler: GatewayHandler): void {
		if (this.isStarted) {
			throw new Error("Cannot register handlers after GatewayManager has started");
		}
		this.handlers.push(handler);
	}

	/**
	 * 启动所有已注册的 Gateway Handler
	 * @throws 如果任何 Handler 启动失败，会回滚已启动的 Handler
	 */
	async startup(): Promise<void> {
		if (this.isStarted) {
			throw new Error("GatewayManager is already started");
		}

		const startedHandlers: GatewayHandler[] = [];

		try {
			// 按顺序启动每个 Handler
			for (const handler of this.handlers) {
				await handler.startup();
				startedHandlers.push(handler);
			}

			this.isStarted = true;
		} catch (error) {
			// 启动失败，回滚已启动的 Handler
			for (const handler of startedHandlers) {
				try {
					await handler.shutdown();
				} catch (shutdownError) {
					// 记录但忽略 shutdown 错误，避免掩盖原始错误
					console.error(`Failed to shutdown ${handler.name} during rollback:`, shutdownError);
				}
			}
			throw error;
		}
	}

	/**
	 * 停止所有 Gateway Handler 并回收资源
	 * 即使某些 Handler shutdown 失败，也会继续尝试停止其他 Handler
	 */
	async shutdown(): Promise<void> {
		if (!this.isStarted) {
			return;
		}

		const errors: Array<{ handler: string; error: unknown }> = [];

		// 按相反顺序停止（后进先出）
		for (const handler of [...this.handlers].reverse()) {
			try {
				await handler.shutdown();
			} catch (error) {
				errors.push({ handler: handler.name, error });
			}
		}

		this.isStarted = false;

		// 如果有错误，抛出汇总错误
		if (errors.length > 0) {
			const errorMessages = errors.map(
				({ handler, error }) => `${handler}: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw new Error(`Failed to shutdown some gateways:\n${errorMessages.join("\n")}`);
		}
	}

	/**
	 * 获取所有已注册的 Handler 名称
	 */
	getHandlerNames(): string[] {
		return this.handlers.map((h) => h.name);
	}

	/**
	 * 获取已注册的 Handler 数量
	 */
	get handlerCount(): number {
		return this.handlers.length;
	}
}
