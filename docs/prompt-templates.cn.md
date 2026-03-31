> pi 可以创建提示模板。让它为你的工作流程构建一个。

# 提示模板

提示模板是展开为完整提示的 Markdown 代码片段。在编辑器中输入 `/名称` 来调用模板，其中 `名称` 是没有 `.md` 后缀的文件名。

## 位置

Pi 从以下位置加载提示模板：

- 全局：`~/.pi/agent/prompts/*.md`
- 项目：`.pi/prompts/*.md`
- 包：`prompts/` 目录或 `package.json` 中的 `pi.prompts` 条目
- 设置：`prompts` 数组，包含文件或目录
- CLI：`--prompt-template <path>`（可重复）

使用 `--no-prompt-templates` 禁用发现。

## 格式

```markdown
---
description: 审查暂存的 git 更改
---
审查暂存的更改（`git diff --cached`）。重点关注：
- 错误和逻辑错误
- 安全问题
- 错误处理差距
```

- 文件名成为命令名称。`review.md` 变为 `/review`。
- `description` 是可选的。如果缺失，则使用第一个非空行。

## 使用方法

在编辑器中输入 `/` 后跟模板名称。自动补全显示带有描述的可用模板。

```
/review                           # 展开 review.md
/component Button                 # 带参数展开
/component Button "click handler" # 多个参数
```

## 参数

模板支持位置参数和简单切片：

- `$1`、`$2`、... 位置参数
- `$@` 或 `$ARGUMENTS` 用于连接所有参数
- `${@:N}` 用于从第 N 个位置开始的参数（1 索引）
- `${@:N:L}` 用于从 N 开始的 L 个参数

示例：

```markdown
---
description: 创建一个组件
---
创建一个名为 $1 的 React 组件，功能：$@
```

使用：`/component Button "onClick handler" "disabled support"`

## 加载规则

- `prompts/` 中的模板发现是非递归的。
- 如果你希望在子目录中有模板，通过 `prompts` 设置或包清单显式添加它们。
