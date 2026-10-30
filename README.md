# Dev SideMirror

基于 Vue 3 和 Cloudflare Pages 构建的 GitHub Releases 镜像服务。将发布文件缓存到 Cloudflare R2 存储中，提供简洁的 UI 来浏览和下载发布文件，支持自动检测操作系统和架构。

## 功能特性

- 浏览所有 GitHub 发布版本及其文件
- 通过 User-Agent 自动检测用户操作系统和架构
- 推荐适合的下载文件
- 将发布文件缓存到 Cloudflare R2 加速下载
- 智能缓存，存储满时自动 LRU 淘汰
- 自动清理旧版本缓存
- 跟随系统偏好的亮色/暗色主题

## 项目结构

```
dev-sidemirror/
├── functions/                    # Cloudflare Pages Functions (API)
│   └── api/
│       ├── releases.ts          # GET /api/releases - 列出所有发布版本
│       ├── download/
│       │   └── [[version]].ts   # GET /api/download/:version/:file - 下载/代理文件
│       ├── stats.ts             # GET /api/stats - 下载统计
│       └── cleanup.ts           # GET|POST /api/cleanup - 清理旧版本缓存（需 token）
├── src/                         # Vue 3 前端
│   ├── App.vue
│   ├── components/
│   │   ├── ReleaseList.vue      # 发布版本列表
│   │   ├── ReleaseCard.vue      # 单个版本卡片
│   │   ├── FileList.vue         # 文件列表
│   │   └── FileCard.vue         # 单个文件卡片（含下载按钮）
│   ├── composables/
│   │   ├── useReleases.js       # 获取发布数据
│   │   └── useUserAgent.js      # 解析 User-Agent
│   └── utils/
│       └── filenameParser.js    # 解析文件名获取操作系统/架构
├── wrangler.jsonc               # Cloudflare 配置
└── package.json
```

## 前置条件

- Node.js >= 22.18.0
- 已启用 Pages、R2 和 KV 的 Cloudflare 账户

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 Cloudflare 资源

创建 R2 存储桶：

```bash
wrangler r2 bucket create dev-sidecar
```

创建 KV 命名空间：

```bash
wrangler kv namespace create KV
```

### 3. 在 Dashboard 中配置构建与绑定

生产配置以 Cloudflare Dashboard 为准，仓库里的 `wrangler.jsonc` 只服务本地开发（没有 `pages_build_output_dir`，因此不会覆盖 Dashboard 设置）。

进入 Cloudflare Dashboard > Pages > 你的项目：

- Build command：`npm run build`
- Build output directory：`dist`
- Production branch：`master`

然后在 Settings > Functions > Bindings 里绑定：

| 绑定类型     | 变量名 | 说明                        |
| ------------ | ------ | --------------------------- |
| R2 Bucket    | `R2`   | 用于文件缓存的 R2 存储桶    |
| KV Namespace | `KV`   | 用于下载计数和发布缓存的 KV |

### 4. 在 Dashboard 中设置环境变量

进入 Cloudflare Dashboard > Pages > 你的项目 > Settings > Environment variables：

| 变量名                | 说明                                          | 示例                    |
| --------------------- | --------------------------------------------- | ----------------------- |
| `GITHUB_REPO`         | GitHub 仓库 (owner/repo)                      | `docmirror/dev-sidecar` |
| `R2_MAX_CAPACITY`     | R2 最大容量（字节）                           | `10737418240` (10GB)    |
| `KEEP_RELEASES_COUNT` | 保留缓存的版本数                              | `3`                     |
| `GITHUB_TOKEN`        | GitHub Token（建议配置，避免 60 次/小时限流） | `ghp_xxx`               |
| `CLEANUP_TOKEN`       | 清理接口口令（不配置则接口返回 503）          | 随机字符串              |

## 开发

```bash
npm run dev         # 只跑前端（/api 请求不可用）
npm run dev:pages   # 构建后用 Pages 本地环境跑 Functions，并绑定本地 KV/R2
```

## 构建

```bash
npm run build
```

## 预览

```bash
npm run preview
```

## 部署

推送到 `master` 即可，Cloudflare Pages 会自动构建部署（构建命令与绑定在 Dashboard 里配置，见上文）。

手动部署：

```bash
npx wrangler pages deploy dist
```

## API 端点

| 端点                                   | 说明                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/releases`                    | 列出所有发布版本（KV 缓存 5 分钟，失败时回退到上一次数据）                                      |
| `GET /api/download/:version/:filename` | 下载发布文件（从 R2 或代理 GitHub，支持 Range 断点续传）                                        |
| `GET /api/stats`                       | 获取下载统计                                                                                    |
| `GET /api/health`                      | 诊断用：返回环境变量是否注入、绑定是否存在、GitHub 侧状态与额度；`?record=1` 时记录一次状态采样 |
| `GET /api/status`                      | 状态页数据：24 小时 / 7 天 / 30 天的可用率、平均延迟与最近 24 小时采样                          |
| `GET\|POST /api/cleanup`               | 清理旧版本缓存，需 `Authorization: Bearer $CLEANUP_TOKEN` 或 `?token=`                          |

## 状态页

访问 `/status` 可以看到各组件状态、24 小时 / 7 天 / 30 天的可用率和最近 24 小时的检查条带。

历史数据来自 `.github/workflows/status-check.yml`，它每 15 分钟请求一次 `/api/health?record=1`，结果写入 KV 的 `status:rollup`（保留 35 天，5 分钟内重复调用不会重复记录）。也可以在 Actions 页面手动触发一次。

同一个仓库 60 天没有活动时 GitHub 会自动停用定时工作流，届时在 Actions 页面点一次 Enable 即可。启用了整站人机验证后，需要在本仓库的 Actions secrets 里加 `STATUS_TOKEN`，工作流会带上 `x-status-token` 头访问 `/api/health`。

## 整站人机验证（Turnstile）

配置以下环境变量后，未验证的访客会先看到 Turnstile 验证页；通过后写入一个签名的 HttpOnly cookie（7 天有效），之后访问页面、API 和下载都凭该 cookie 放行。

| 变量                   | 说明                                             |
| ---------------------- | ------------------------------------------------ |
| `TURNSTILE_SITE_KEY`   | Turnstile 小组件的 Site Key（公开）              |
| `TURNSTILE_SECRET_KEY` | Turnstile 的 Secret Key（Secret）                |
| `SESSION_SECRET`       | 可选，cookie 签名密钥；不填时用 Turnstile Secret |
| `STATUS_TOKEN`         | 可选，定时检查绕过验证用的口令                   |

三项 Turnstile 相关变量没有配齐时，验证闸门自动关闭，站点照常访问。`/api/verify` 与 `/favicon.ico` 不参与拦截。

## 工作原理

1. 前端从 `/api/releases` 获取发布数据
2. API 优先检查 KV 缓存，未命中则调用 GitHub REST API
3. 下载文件时：
   - 如果 R2 中已缓存：直接返回（缓存命中）
   - 如果未缓存：从 GitHub 代理下载，然后缓存到 R2
   - 超过 50 MB 的文件不写缓存，直接透传（Workers 单实例内存上限 128 MB）
4. 下载次数记录在 KV 中，并用同一个索引做 LRU 淘汰判断
5. R2 存储满时，自动淘汰下载次数最少的文件（LRU）
6. 超过 `KEEP_RELEASES_COUNT` 的旧版本会由清理接口或定时任务删除
