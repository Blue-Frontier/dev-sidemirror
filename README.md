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
wrangler r2 bucket create mirrors
```

创建 KV 命名空间：

```bash
wrangler kv namespace create KV
```

### 3. 配置环境变量

在 `wrangler.jsonc` 中更新你的配置，或在 Cloudflare Dashboard 中设置：

```jsonc
{
  "vars": {
    "GITHUB_REPO": "owner/repo", // 要镜像的 GitHub 仓库
    "R2_MAX_CAPACITY": "10737418240", // R2 最大容量（字节，默认 10GB）
    "KEEP_RELEASES_COUNT": "3", // 保留缓存的最近版本数
  },
}
```

### 4. 在 Dashboard 中配置绑定

部署后，进入 Cloudflare Dashboard > Pages > 你的项目 > Settings > Functions：

| 绑定类型     | 变量名 | 说明                        |
| ------------ | ------ | --------------------------- |
| R2 Bucket    | `R2`   | 用于文件缓存的 R2 存储桶    |
| KV Namespace | `KV`   | 用于下载计数和发布缓存的 KV |

### 5. 在 Dashboard 中设置环境变量

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
npm run dev
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

```bash
npm run deploy
```

或连接你的 GitHub 仓库到 Cloudflare Pages 实现自动部署。

## API 端点

| 端点                                   | 说明                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/releases`                    | 列出所有发布版本（KV 缓存 5 分钟，失败时回退到上一次数据）             |
| `GET /api/download/:version/:filename` | 下载发布文件（从 R2 或代理 GitHub，支持 Range 断点续传）               |
| `GET /api/stats`                       | 获取下载统计                                                           |
| `GET\|POST /api/cleanup`               | 清理旧版本缓存，需 `Authorization: Bearer $CLEANUP_TOKEN` 或 `?token=` |

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
