# Retro Route

地图化旅行行程编辑器。React + Vite 纯前端，桌面与手机共用完整编辑逻辑，无需启动 Flask 或数据库。

## 本地运行

需要 Node.js 22.12+，建议 Node.js 24。

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm test
npm run build
npm run preview
```

## 功能

- 本地多路线管理、自动保存、改名、复制、删除、撤销／重做。
- 地点新增、修改、地图重新选点、名称筛选和独立分类／链接／备注。
- 可重复访问的节点序列，路段时间与交通详情，跨日时长。
- Markdown 总备注、Explore、Preview、浅色／深色主题。
- 单条 JSON 导入／导出、全部路线库备份／恢复；所有导入先预览。
- 压缩二维码生成、网页相机扫码及二维码图片读取。
- 系统地图导航；响应式界面，小入口使用图标、必要文案使用英文。

地图线是示意线，时间和距离需要手动填写。数据保存在当前站点、当前浏览器；不同设备导入后是独立副本，没有云同步。文件导出用于长期备份。

## GitHub Pages

项目已提供 `.github/workflows/pages.yml`。将代码推送到 GitHub 的 `main` 分支，然后在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。也可以在 Actions 手动运行部署任务。使用其他默认分支时修改工作流中的分支名。

若首次推送时尚未开启 Pages，初次工作流可能失败；开启后在 Actions 重新运行即可。工作流参考 [Vite 官方部署说明](https://vite.dev/guide/static-deploy.html#github-pages)，Action 版本固定到已核实的提交。

资源路径相对化，支持 `https://user.github.io/repository/`。也可执行 `npm run build` 后把 **dist 目录中的内容** 上传到任意静态托管平台。无需上传 `.env`、SQLite、Python 文件、原始备份或 `node_modules`。

不要直接双击 `dist/index.html`；ES 模块和摄像头需要正常的网页托管环境。GitHub Pages 使用 HTTPS；相机权限需用户主动点击开启。

默认地图为 OpenStreetMap 在线瓦片。可在构建前设置 `VITE_TILE_URL` 和 `VITE_TILE_ATTRIBUTION` 使用其他兼容服务。大陆网络上的瓦片和外部地图可用性请在目标设备测试。原 `.env` 的 `VITE_API_URL` 已无作用。

## 迁移旧路线

现有 `retro_route.db` 与服务器源码保留，正式应用不会访问它们。一次性迁移无需启动旧后端：

```sh
python3 scripts/export-legacy.py --database retro_route.db --output migration-exports/legacy-routes.json
```

该命令只读数据库，不覆盖已有导出。通过新应用的文件入口导入生成的 JSON，在预览中确认坐标源：旧桌面高德地图默认为 **AMap / GCJ-02**，原数据如为 GPS 坐标请选择 **WGS84**。导入后检查几个真实地点。

旧浏览器同来源的缓存会提示迁移，保留原缓存键；新部署域名无法读取旧域名的缓存，使用导出文件迁移。旧地点冲突和失效路段有迁移说明，原文件保留历史内容。不要将 `migration-exports` 或数据库提交到公开仓库。

## 浏览器测试

```sh
npx playwright install chromium
npm run test:ui
npm run build
npm run test:static
```

测试包含桌面编辑、持久化、文件预览、真实二维码图像识别、响应式表单、损坏数据保护、多标签页冲突和摄像头资源释放；`test:static` 专门检查构建产物在 `/retro-route/` 项目子路径的加载。测试不向公共地图服务请求瓦片。`test-results` 中保留截图及失败追踪。

真实 iOS Safari、Android Chrome 的摄像头、图片／文件选择、下载和系统地图跳转需部署后验证，见 [设备测试清单](docs/device-testing.md)。自动化窄屏测试不能替代真实移动设备。

## 项目结构

```text
src/domain/       路线模型、校验、时间和坐标转换
src/storage/      本地保存、修订号与撤销历史
src/transfer/     文件协议和二维码协议
src/components/   地图、表单、扫描器和共享复古 UI
src/App.jsx       响应式应用与功能入口
scripts/          旧数据库只读导出工具
tests/            核心逻辑与浏览器流程测试
docs/             需求、格式及设备验收说明
```

[需求文档](docs/requirements.md) · [数据格式与工程决定](docs/data-format.md) · [实现与验证记录](docs/implementation.md)

兼容性依赖修复已应用。当前 Tailwind 3 构建链仍有 npm audit 报告的开发依赖问题，自动修复要求升级到 Tailwind 4；本轮保留现有主版本，不使用 `--force`。这些构建依赖不会作为后台服务部署。
