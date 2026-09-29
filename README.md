# dsh-skill-manager

DeepSeek Harness (DSH) 设置页技能管理独立插件。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH Compatibility](https://img.shields.io/badge/DSH-0.1.x%20%7C%20%3E%3D0.1.2--rc.1-brightgreen.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Cordis Compatibility](https://img.shields.io/badge/Cordis-%5E4.0.2-orange.svg)](https://github.com/deepseek-ai/cordis)

---

## 适配版本说明

- **DeepSeek Harness (DSH)**：适配 `0.2.x` 系列（`0.2.0-rc.1` 及以上）。已在 **DSH `0.2.0-rc.2` / cordis `4.0.4`** 上实测通过。
- **微内核架构**：基于 `@deepseek-ai/cordis` `^4.0.2` 插件生命周期与依赖注入机制。
- **环境要求**：Node.js `>= 20.0.0`，pnpm `>= 9.0.0`，React `>= 18.0.0`。

### 0.2.x 适配要点

| 契约 | 本插件用法 | DSH 0.2.0-rc.2 |
| --- | --- | --- |
| 宿主插件形态 | `name` / `inject` / `apply` | 一致 |
| HTTP 路由 | `ctx.webServer.register({ kind: 'prefix', path, handler })` | 一致 |
| 客户端槽位 | `ctx.slots.inject(key, () => ctx.slots.register({ name, id, order, label }, C))` | 一致（与官方 `templates/decoration/client.js` 相同） |
| 客户端 bundle | `window.__ModuleLoader__.load({ id, factory })`，`id` = 包名 | 一致 |
| 客户端声明 | `dsh.client = { platform: 'web', immediately, inject }` | 一致（解析器接受 `immediately`） |
| 打包补丁 | `dsh.bundle.patch` → `- insert:` 行 | 一致 |
| 界面语言 | `locale.getLocale().active`（保留 0.1.x 的 `get()` / `current` 回退） | 一致 |

> DSH 的版本兼容门禁只检查 `peerDependencies` 中声明的 `@deepseek-ai/dsh*` 范围
> （`engines.dsh` 不参与门禁）。本插件与官方外部插件模板一致，**不声明 DSH peer**，
> 因此不施加版本约束。

> ⚠️ **重要说明（当前阶段安装注意）**：
> 目前 DeepSeek Harness 官方框架尚处于快速迭代阶段，**尚未面向公共 npm 仓库打包编译发布全局二进制**。
> 因此，直接通过网络包管理器执行远程安装命令无法开箱即用。
> **当前使用方式**：必须将本插件仓库代码**克隆/拉取到本地**，然后**让本地 AI（Pi / Claude Code / Cursor / Windsurf / DSH 内置 Coding Agent）帮您完成装载**，或通过本地 Link 方式引入。

---

## 让 AI 帮我装（推荐方式）

如果您正在使用 AI 编程助手（例如 Pi、Claude Code、Cursor、Windsurf 或 DSH 内部的 Coding Agent），请**将本插件拉到本地**后，直接复制下方提示词发给 AI：

```markdown
请帮我将本地的 DSH 技能管理插件接入到当前运行的 DeepSeek Harness 中：

1. 本地插件路径：/你的本地路径/dsh-skill-manager（请替换为实际绝对路径）
2. 请进入该插件目录执行 `pnpm install` 与 `pnpm run build`，确保已完成编译构建出 lib 产物；
3. 请定位当前使用的 DSH Profile 目录（如 `~/.dsh/profiles/web/` 或项目根目录下的 profiles/web）：
   - 在其 `package.json` 的 `dependencies` 中添加："dsh-skill-manager": "link:/你的本地路径/dsh-skill-manager"
   - 在其 `cordis.patch.yml` 中添加插件声明并启用：
     ```yaml
     dsh-skill-manager:
       $if: true
     ```
4. 在 Profile 目录下执行 `pnpm install`，并触发 DSH 热重载或重启 DSH Web 服务；
5. 检查设置页面中是否已成功出现「技能管理」配置面板。
```

---

## 手动安装与接入步骤

### 第一步：克隆到本地并编译构建

```bash
# 1. 克隆本仓库到本地任意工作目录
git clone https://github.com/Td0000000/dsh-skill-manager.git
cd dsh-skill-manager

# 2. 安装依赖并执行构建（必须构建出 lib/ 产物）
pnpm install
pnpm run build
```

### 第二步：在 DSH Profile 中配置本地软链接

进入您的 DSH 配置目录（通常为 `~/.dsh/profiles/web/` 或 DSH 源码目录中的对应 profile）：

1. **编辑 `package.json`**，在 `dependencies` 中引入本地路径：
   ```json
   {
     "dependencies": {
       "dsh-skill-manager": "link:/绝对路径/dsh-skill-manager"
     }
   }
   ```

2. **编辑 `cordis.patch.yml`**（或 `cordis.yml`），启用该插件：
   ```yaml
   dsh-skill-manager:
     $if: true
   ```

3. **安装依赖并重启/热重载**：
   ```bash
   pnpm install
   ```
   刷新浏览器页面，即可在设置页中看到「技能管理」。

---

## 页面使用文档与界面交互指南

### 1. 页面入口

启动 DSH Web 界面后：
1. 点击界面左侧或右上角进入 **设置（Settings）** 弹窗/抽屉。
2. 在左侧设置分类列表中，点击 **「技能管理」** 标签，即可打开本插件的完整控制面板。

---

### 2. 页面区域与布局结构

界面由上至下分为三大核心区域：

```
+-----------------------------------------------------------------------+
|  顶部状态与搜索栏                                                      |
|  [ 技能统计徽标 ]          [ 🔍 搜索技能名称/描述/路径... ]           |
+-----------------------------------------------------------------------+
|  ▼ 全局技能 (Global Skills)                          [统计: 共 X 个]   |
|  +-----------------------------------------------------------------+  |
|  | 技能名称        技能描述                路径         [启/停开关] [🗑] |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
|  ▼ 项目工作区技能 (Project Skills)                   [一键启用] [一键禁用] |
|  +-----------------------------------------------------------------+  |
|  | 技能名称        技能描述                路径         [启/停开关] [🗑] |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

#### ① 顶部状态与搜索过滤栏
- **技能统计徽标**：实时统计当前加载的用户可用技能总数。
- **实时过滤搜索框**：输入关键词（支持技能名、ID、简介描述、所在文件绝对路径），即时动态过滤，无需回车。

#### ② 全局技能分组区（Global Skills）
- **置顶显示**：扫描主目录全局技能（包含 `~/.dsh/skills/`、`~/.pi/skills/`、`~/.agents/skills/` 等路径）。
- **手风琴折叠面板**：点击标题栏任意位置可展开或折叠。折叠状态下指示箭头向右，展开状态下指示箭头向下。
- **内置官方技能自动屏蔽**：自动过滤官方系统内置的代码审查与规范技能（如 `dsh-code-review`、`dsh-pre-push-checks` 等），避免冗余干扰，专注展示用户自定义技能。

#### ③ 项目工作区分组区（Project Skills）
- **多项目工作区隔离**：自动识别并列出所有打开过的项目工作区目录。每个工作区拥有独立卡片面板。
- **多面板同步展开**：支持同时展开多个项目面板，方便跨项目对照与操作。
- **项目级一键批量控制**：
  - **「全部启用」按钮**：将当前项目目录下的所有技能批量激活。
  - **「全部禁用」按钮**：将当前项目目录下的所有技能批量挂起。

---

### 3. 核心交互操作

#### 🔄 单项技能即时启停（Toggle Switch）
- 点击每个技能卡片右侧的滑动开关即可实时切换状态。
- **底层规范原理**：通过安全规范的方式重命名技能主控文件（`SKILL.md` ↔ `SKILL.md.disabled`），操作原子化无破坏。
- **即刻热生效**：操作完成后，插件后端会自动通知 DSH 技能加载引擎执行热刷新，智能 Agent 在下一次对话或工具调用时立即生效，**无需重启 DSH 服务**。

#### 🗑️ 技能安全删除（含模态防误删确认）
- 点击操作列的红色垃圾桶图标，会弹出二次确认模态弹窗。
- **智能区分删除类型**：
  - **单文件技能**：仅安全删除其对应的 markdown 文件。
  - **目录型技能**：弹窗会明确标注技能文件夹路径，确认后连同配置与资源文件彻底安全移除。
- 确认后即时刷新列表并同步给 DSH 技能索引。

#### ⚡ 热同步与聚焦感知机制
- 插件内置双重同步机制：
  1. **后台轮询检测**（每 2.5 秒轻量增量查询一次）。
  2. **窗口聚焦同步**（当您在 IDE 或外部文件管理器中新增/重命名了技能文件，切回 DSH 浏览器页面时自动即时静默刷新）。

---

## 本地开发与构建

```bash
# 安装依赖
pnpm install

# 源码类型检查与构建打包
pnpm run build
```

构建后产物包含：
- `lib/index.js`：Cordis 后端服务入口（自动内联 YAML 与文件系统操作，提供 HTTP RPC 接口与 DSH 技能热刷新触发器）。
- `lib/client.js`：前端 React 设置页注入入口（通过 `@deepseek-ai/dsh-client-ui-slots` 注册到 `settings.section`）。

---

## 开源协议

本项目采用 [MIT 许可证](LICENSE)。
