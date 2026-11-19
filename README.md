# Calendar / 日历

Run `python3 -m http.server 8080 --bind 127.0.0.1 --directory public` and open http://localhost:8080. Choose a date, enter a title and times, and download an .ics invitation to keep it in your calendar. The managed workbench also shows authorized Reminder dates.

运行上述命令后打开本机地址。选择日期，填写标题和起止时间，下载 .ics 邀请后导入自己的日历。工作台版本还显示已获授权的 Reminder 日期。

## Workbench cards and checks / 工作台卡片与验证

`praxis-provider.mjs` supplies read-only day cards and data locations. Browser events created by downloading .ics use the signed-in native Praxis identity. A different native account sees its own browser events. Standalone events use a separate local namespace. Run `npm test` with Node 22.12+ for synthetic provider and isolation checks.

`praxis-provider.mjs` 提供只读日期卡片及数据位置。下载 .ics 时创建的浏览器日程按已登录的原生 Praxis 身份隔离；另一原生账号只显示自己的浏览器日程，独立模式另用本机命名空间。使用 Node 22.12+ 运行 `npm test` 验证合成供数及身份隔离。
