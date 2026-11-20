---
name: mcp-travel
description: Maintain authorized itineraries, daily plans, places and budgets and query read-only travel evidence with Travel MCP. 通过 Travel MCP 在固定行程界面合同内维护攻略、预算及地点，查询地图和旅行服务；不改变 Travel UI 或自行预订。
---

# Travel operations

English · [简体中文](#travel-业务操作)

One interface renders all itineraries from a typed data contract. The app owns field names, units, icons, labels and unknown-value behavior. Write only the requested itinerary and fields. Keep debug text, speculative narratives and invented UI copy out of structured data.

| Tool | When and how to use it |
| --- | --- |
| `travel_list_itineraries` | Discover authorized itineraries and their stable resource IDs. |
| `travel_read_itinerary` | Before changing anything, read its dates, places, transport legs, budget and current revision. |
| `travel_update_place_details` | Patch permitted facts for one existing place. Preserve its other short display facts and all other places. |
| `travel_upsert_place` | Add or update a stable place ID using the schema’s place type, price, duration, opening hours and nullable fields. Keep the card layout intact. |
| `travel_set_day_plan` | Set the ordered places and transport legs for one specified date. Referenced places must exist. Distinguish straight-line connections from a road route. |
| `travel_set_budget_item` | Maintain one dated, categorized item with amount, currency, unit and booking status. Record payment or booking only with evidence. |
| `travel_search_places` | Search candidate points of interest in the specified city. Keep returned observations and disambiguate places with the same name. |
| `travel_get_place` | Retrieve details for the specified POI. Preserve unknown values. Do not turn observations into future price or opening-hour guarantees. |
| `travel_plan_route` | Query the specified origin, destination and travel mode. Use the returned duration, distance and route type for the corresponding leg. |
| `travel_search_services` | Query hotels, restaurants, flights or trains by type. Report the returned conditions and limitations. Results do not book, reserve a price or establish availability. |

For writes, use the current `expectedRevision` and a fixed `idempotencyKey` for the intent. Resolve conflicts first and read back the dates, order and quantities after saving. Keep observation time separate from displayed facts. Report uncertain information accurately. Stop on connection or permission failure; do not bypass the API through source code or underlying data files.

# Travel 业务操作

同一套行程界面呈现不同攻略。代码定义字段、单位、图标、标签及未知值；只填业务数据，不能往结构化字段塞调试说明、待确认长文或自创 UI 文案。只修改用户请求的行程和字段。

| 工具 | 选择与操作 |
|---|---|
| `travel_list_itineraries` | 发现获授权行程及稳定资源 ID。 |
| `travel_read_itinerary` | 修改前读当前行程、日期、地点、交通、预算和修订号。 |
| `travel_update_place_details` | 修改一个已存在地点的允许事实字段，保留其他地点与现有短显示事实。 |
| `travel_upsert_place` | 增加或修改一个稳定地点 ID；填 schema 指定的地点类型、价格、时长、营业时间及可空字段，不改变卡片布局。 |
| `travel_set_day_plan` | 设置指定日期的有序地点和交通段；对应地点必须存在，不把地图直线距离冒充道路路线。 |
| `travel_set_budget_item` | 维护一个有日期、类别、金额及预订状态的预算项，保持币种和数量单位正确；未预订不是已支付。 |
| `travel_search_places` | 在给定城市查询候选 POI，保存服务返回的观察依据，不擅自选择重名地点。 |
| `travel_get_place` | 获取指定 POI 的实际详情；缺失值保持未知，不捏造未来开放或价格保证。 |
| `travel_plan_route` | 查询明确起终点及交通方式的道路路线，依据返回的时长、距离、路线类型填写对应段。 |
| `travel_search_services` | 按类型查询酒店、餐厅、机票或火车票；使用实际返回条件和限制，不代表已下单、锁价或可订。 |

写入使用最新`expectedRevision`及固定`idempotencyKey`，先处理冲突再提交，之后回读核对日期、顺序和数量。资料观察时间与业务展示事实分开。API无法确定的信息准确告诉用户，不能为了看起来完整而随意覆盖原事实。连接或权限失败停止，不能改源码或原数据文件绕过。
