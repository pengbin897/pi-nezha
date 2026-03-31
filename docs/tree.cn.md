# 会话树导航

`/tree` 命令提供会话历史的基于树的导航。

## 概述

会话存储为树结构，每个条目都有 `id` 和 `parentId`。"叶子"指针跟踪当前位置。`/tree` 让你导航到任何点，并可选择总结你离开的分支。

### 与 `/fork` 的比较

| 功能 | `/fork` | `/tree` |
|---------|---------|---------|
| 视图 | 用户消息的平面列表 | 完整树结构 |
| 操作 | 提取路径到**新会话文件** | 在**同一会话**中更改叶子 |
| 摘要 | 从不 | 可选（提示用户） |
| 事件 | `session_before_fork` / `session_fork` | `session_before_tree` / `session_tree` |

## 树 UI

```
├─ user: "你好，你能帮助..."
│  └─ assistant: "当然！我可以..."
│     ├─ user: "让我们尝试方法 A..."
│     │  └─ assistant: "对于方法 A..."
│     │     └─ [压缩：12k 令牌]
│     │        └─ user: "那成功了..."  ← 活动
│     └─ user: "实际上，方法 B..."
│        └─ assistant: "对于方法 B..."
```

### 控制

| 键 | 操作 |
|-----|--------|
| ↑/↓ | 导航（深度优先顺序） |
| Enter | 选择节点 |
| Escape/Ctrl+C | 取消 |
| Ctrl+U | 切换：仅用户消息 |
| Ctrl+O | 切换：显示全部（包括自定义/标签条目） |

### 显示

- 高度：终端高度的一半
- 当前叶子标记为 `← active`
- 标签内联显示：`[标签名]`
- 默认过滤器隐藏 `label` 和 `custom` 条目（Ctrl+O 模式显示）
- 子项按时间戳排序（最旧的在前）

## 选择行为

### 用户消息或自定义消息
1. 叶子设置为所选节点的**父级**（如果是根则为 `null`）
2. 消息文本放入**编辑器**中以重新提交
3. 用户编辑并提交，创建新分支

### 非用户消息（助手、压缩等）
1. 叶子设置为**所选节点**
2. 编辑器保持为空
3. 用户从该点继续

### 选择根用户消息
如果用户选择第一条消息（没有父级）：
1. 叶子重置为 `null`（空对话）
2. 消息文本放入编辑器
3. 用户有效地从头重启

## 分支摘要

切换分支时，用户有三个选项：

1. **不摘要** - 不总结立即切换
2. **摘要** - 使用默认提示生成摘要
3. **带自定义提示摘要** - 打开编辑器输入附加聚焦指令，追加到默认摘要提示

### 被摘要的内容

从旧叶子到目标共同祖先的路径：

```
A → B → C → D → E → F  ← 旧叶子
        ↘ G → H        ← 目标
```

放弃的路径：D → E → F（被摘要）

摘要停止于：
1. 共同祖先（始终）
2. 压缩节点（如果先遇到）

### 摘要存储

存储为 `BranchSummaryEntry`：

```typescript
interface BranchSummaryEntry {
  type: "branch_summary";
  id: string;
  parentId: string;      // 新叶子位置
  timestamp: string;
  fromId: string;        // 我们放弃的旧叶子
  summary: string;       // LLM 生成的摘要
  details?: unknown;     // 可选的钩子数据
}
```

## 实现

### AgentSession.navigateTree()

```typescript
async navigateTree(
  targetId: string,
  options?: {
    summarize?: boolean;
    customInstructions?: string;
    replaceInstructions?: boolean;
    label?: string;
  }
): Promise<{ editorText?: string; cancelled: boolean }>
```

选项：
- `summarize`：是否生成放弃分支的摘要
- `customInstructions`：摘要器的自定义指令
- `replaceInstructions`：如果为 true，`customInstructions` 替换默认提示而不是追加
- `label`：附加到分支摘要条目的标签（如果不摘要，则附加到目标条目）

流程：
1. 验证目标，检查无操作（target === current leaf）
2. 在旧叶子和目标之间找到共同祖先
3. 收集要摘要的条目（如果请求）
4. 触发 `session_before_tree` 事件（钩子可以取消或提供摘要）
5. 如需要运行默认摘要器
6. 通过 `branch()` 或 `branchWithSummary()` 切换叶子
7. 更新代理：`agent.replaceMessages(sessionManager.buildSessionContext().messages)`
8. 触发 `session_tree` 事件
9. 通过会话事件通知自定义工具
10. 返回结果，如果选择用户消息则包含 `editorText`

### SessionManager

- `getLeafUuid(): string | null` - 当前叶子（如果为空则为 null）
- `resetLeaf(): void` - 设置叶子为 null（用于根用户消息导航）
- `getTree(): SessionTreeNode[]` - 完整树结构，子项按时间戳排序
- `branch(id)` - 更改叶子指针
- `branchWithSummary(id, summary)` - 更改叶子并创建摘要条目

### InteractiveMode

`/tree` 命令显示 `TreeSelectorComponent`，然后：
1. 提示摘要选项
2. 调用 `session.navigateTree()`
3. 清除并重新渲染聊天
4. 如适用设置编辑器文本

## 钩子事件

### `session_before_tree`

```typescript
interface TreePreparation {
  targetId: string;
  oldLeafId: string | null;
  commonAncestorId: string | null;
  entriesToSummarize: SessionEntry[];
  userWantsSummary: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
}

interface SessionBeforeTreeEvent {
  type: "session_before_tree";
  preparation: TreePreparation;
  signal: AbortSignal;
}

interface SessionBeforeTreeResult {
  cancel?: boolean;
  summary?: { summary: string; details?: unknown };
  customInstructions?: string;    // 覆盖自定义指令
  replaceInstructions?: boolean;  // 覆盖替换模式
  label?: string;                 // 覆盖标签
```

扩展可以通过从 `session_before_tree` 处理程序返回它们来覆盖 `customInstructions`、`replaceInstructions` 和 `label`。

### `session_tree`

```typescript
interface SessionTreeEvent {
  type: "session_tree";
  newLeafId: string | null;
  oldLeafId: string | null;
  summaryEntry?: BranchSummaryEntry;
  fromHook?: boolean;
}
```

### 示例：自定义摘要器

```typescript
export default function(pi: HookAPI) {
  pi.on("session_before_tree", async (event, ctx) => {
    if (!event.preparation.userWantsSummary) return;
    if (event.preparation.entriesToSummarize.length === 0) return;
    
    const summary = await myCustomSummarizer(event.preparation.entriesToSummarize);
    return { summary: { summary, details: { custom: true } } };
  });
}
```

## 错误处理

- 摘要失败：取消导航，显示错误
- 用户中止（Escape）：取消导航
- 钩子返回 `cancel: true`：静默取消导航
