# Travel

[English](README.md)

双语行程阅读器，提供路线目录、每日计划、预算、准备清单及可选的地图和地点搜索。新安装的路线目录为空。私有路线资料可独立生成浏览页，经授权的业务操作可更新配置的行程。

```sh
npm ci
npm run build
npm start -- --host 127.0.0.1 --port 4323
```

## 受管安装

受管服务可从空行程列表启动，例如 `{"version":1,"webSpace":"personal","spaces":{"personal":[]}}`。原生目录和带签名的行程列表均为空，启动时不创建行程记录。首次导入时，由获授权的内容流程提供来源 JSON 及目录元数据，在同一个私有空间映射中登记行程标识，再重启 Travel。保留原 `TRAVEL_DATA_DIR`、签名密钥和空间标识，以便已有编辑继续对应原来源。

## Praxis 集成

应用维护的[供数合同](docs/PRAXIS-PROVIDER.md)提供按授权过滤、有来源依据的卡片与数据源描述，不增加 HTTP 元数据入口。使用 `npm run test:provider` 验证隔离供数测试。

## Praxis 登记

应用发行版本：`0.1.18`。本应用维护 [`praxis-app.json`](praxis-app.json)、英中展示文案、`public/praxis-icon.svg` 图标、PRD 路径及需要保留的旧图标别名。`schemaVersion: 1` 表示登记格式，与应用发行版本、数据、协议和文档修订分别管理；已有 package 和 lockfile 的发行版本须与声明一致。

[`apps.example.json`](apps.example.json) 引用 `./praxis-app.json`，使用 `http://127.0.0.1:4323/` 登记本地别名。先按上文启动独立服务；登记不启动后端，也不授予账号、管理员或业务数据权限。安装地址、数据位置与授权策略仍独立配置。

## SQLite 存储与转换

结构化运行记录使用应用数据库。运维命令为 `npm run storage:migrate -- --spec /absolute/private/sources.json --database /absolute/private/app.db --receipt /absolute/private/receipt.json --writers-stopped`，私有 spec 数组每项为 `{file, spaceId, documentId}`。先停所有写者、保留原文件，比对回执后才激活新绑定。JSON 保留为显式兼容/导入来源，配置数据库时不静默回退。`--export --database /absolute/private/app.db --space SPACE --document state --output /absolute/private/new-export.json` 可导出逻辑命名空间以恢复。原件/素材保持归属。
