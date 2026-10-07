# 数据格式及工程决定

实现版本：1，2026-10-07。

## 本地路线库

`localStorage['retroRoute.workspace.v1']`：

```json
{
  "version": 1,
  "revision": "UUID",
  "savedAt": "ISO-8601",
  "currentId": "route-UUID or null",
  "routes": []
}
```

每条路线包含 `id`、`name`、`createdAt`、`updatedAt`、`locations`、`stops`、`segments`、`notes`。

- 地点：`id`、`name`、`lat`、`lng`、`crs: 'WGS84'`、`category`、`url`、`notes`。
- 节点：`id`、`locationId`。地点内容只保存一次。
- 路段：以 `fromStopId~toStopId` 为键，只保存当前相邻有向关系。
- 路段详情：`mode`、`dep`、`dur`、`arr`、`arrivalDay`、`inferredDay`、`fromStation`、`nextStation`、`toStation`、`seat`、`gate`、`distance`。
- `mode`：`car`、`train`、`flight`、`walk`。
- `category`：`stay`、`food`、`nature`、`shop`、`photo`、`favorite`。
- 时钟和时长保留输入字符串，包括未完成输入；完整值格式为 `HH:mm`。时长小时可超过 23，`arrivalDay` 为相对出发日的整数偏移。
- 路段排序后失效详情从当前数据剔除，会话内撤销历史保留旧状态。

设备主题单独保存到 `retroRoute.preferences.v1`。旧缓存键保留，不在迁移完成后删除。

## 文件

单条路线文件：

```json
{
  "format": "retro-route",
  "version": 1,
  "exportedAt": "ISO-8601",
  "document": {}
}
```

完整路线库备份：

```json
{
  "format": "retro-route-backup",
  "version": 1,
  "exportedAt": "ISO-8601",
  "currentId": "route-UUID or null",
  "routes": []
}
```

单条导入 `Add` 生成独立本地路线标识；`Replace` 保留目标路线标识。完整备份 `Restore All` 预览后整体替换，没有合并功能。导入及恢复可以会话内撤销。

## 二维码协议

`RR1:` + UTF-8 单条文档 JSON 的 gzip 压缩结果，经无填充 Base64URL 编码。

- 固定使用 gzip，不能改成原始 deflate 而仍沿用相同前缀。
- 生成库 `qrcode`；识别库 `jsqr`；压缩库 `fflate`，按需载入。
- 纠错等级 M；超过 QR version 32 则提示改用文件。该阈值只是初始工程选择，可根据真实手机测试调整。
- 解压上限 1 MB，压缩流按小块读取并检查累计输出。
- 图片识别在本地 canvas 中完成；相机优先后置，每秒最多约五次识别；关闭、成功识别或隐藏页面时释放媒体流。
- 源文档中的中文、Unicode、重复节点、交通字段和备注均参与传输，不为了容量截断。

相关项目文档：[qrcode](https://github.com/soldair/node-qrcode)、[jsQR](https://github.com/cozmo/jsQR)、[fflate](https://github.com/101arrowz/fflate)。

## 容量和历史

- 单个导入文件最多 10 MB；最多 200 条路线、每条最多 3000 个地点和 5000 个节点。
- 名称最多 200 字符；单份总备注和单个地点备注最多 100000 字符；链接最多 4000 字符。
- 撤销／重做最多 60 次；同字段一秒内的连续编辑合并。历史仅在当前会话中存在。
- 保存防抖 400 ms；切换路线或页面隐藏时提交待保存内容。
- 存储容量取决于浏览器。保存失败保留内存中的路线，并提示导出；路线数上限不代表浏览器保证能够保存那么多大型路线。
- 用修订号和 storage 事件检测多标签页冲突。存在本地待写内容时暂停保存并提示导出本页或加载已保存版本。

## 地图和坐标

新地点统一使用 WGS84，默认瓦片为 OpenStreetMap 标准瓦片，地图有永久来源署名。浏览器按服务响应的 HTTP 缓存规则处理，没有批量下载或离线缓存功能。测试中拦截外部瓦片请求，不通过公共服务进行自动化缩放。

依据：[OSM 瓦片使用说明](https://operations.osmfoundation.org/policies/tiles/)。可通过构建环境变量 `VITE_TILE_URL` 和 `VITE_TILE_ATTRIBUTION` 替换服务；替换时需要提供使用 WGS84/Web Mercator 的瓦片源，并遵守其使用条件。

旧桌面地图基于高德瓦片；[高德说明其坐标使用 GCJ-02](https://lbs.amap.com/api/javascript-api-v2/guide/abc/basetype)。旧格式导入预览默认按 GCJ-02 处理，也可选择 WGS84。转换采用本地近似逆变换，须通过真实地点验证；选择错坐标源会导致位置偏差。原始文件及数据库不会修改。

外部导航使用 Apple Maps 或 [Google Maps URL](https://developers.google.com/maps/documentation/urls/get-started)，是否跳转原生 App 由设备决定。跨时区航班不自动换算；`Flight` 不强行指定地面导航方式。

## 部署

Vite 使用相对资源 base `./`，一个响应式入口，无需 `/m` 和服务器回退规则。生产部署仅包含 `dist`，可放在站点根路径或 GitHub Pages 仓库子目录。二维码扫码网页需 HTTPS 或 localhost。
