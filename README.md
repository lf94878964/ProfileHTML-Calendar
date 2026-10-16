# profilehtml

Cloudflare Worker：每分鐘抓取 GitHub 貢獻資料，輸出成 SVG 日曆圖（含今日 / 本週 / 本月 / 本年 / 全部貢獻數），可直接嵌入 GitHub Profile README。

- 圖片：`https://profilehtml.hitachi.ciallo.com/contrib.svg`
- JSON：`https://profilehtml.hitachi.ciallo.com/api.json`

> GitHub README 不允許 HTML/JS/iframe，所以輸出的是「SVG 圖片」，背景圖已縮小並以 base64 內嵌（SVG 在 `<img>` 內無法載入外部圖片）。

## 部署

```bash
npm install

# 1. 建立 KV，並把回傳的 id 填進 wrangler.toml
npx wrangler kv namespace create CACHE

# 2. 設定 GitHub Token（classic PAT，勾 read:user 才會計入私有貢獻）
npx wrangler secret put GITHUB_TOKEN

# 3. 部署（會先用 sharp 由 image/background.png 重新產生內嵌背景）
npm run deploy
```



## 更換背景
替換 `image/background.png` 後執行 `npm run build:bg`（會裁切成 1080×310 並重新產生 `src/bg.generated.js`），再 commit / deploy。

## 運作方式
- Cron `* * * * *` → GitHub GraphQL 抓最近一年每日貢獻 + 逐年加總（全部）。
- 資料有變動才寫入 KV（免費方案 KV 每日僅 1000 次寫入）。
- 請求時由 KV 資料即時渲染 SVG，今日 / 本週 / 本月以 Asia/Taipei 時區計算。
