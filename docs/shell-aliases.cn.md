# Shell 别名

Pi 在非交互模式下运行 bash（`bash -c`），默认情况下不会展开别名。

要启用你的 shell 别名，请在 `~/.pi/agent/settings.json` 中添加：

```json
{
  "shellCommandPrefix": "shopt -s expand_aliases\neval \"$(grep '^alias ' ~/.zshrc)\""
}
```

调整路径（`~/.zshrc`、`~/.bashrc` 等）以匹配你的 shell 配置。
