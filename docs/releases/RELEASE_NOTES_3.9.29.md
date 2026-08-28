# v3.9.29

Dashboard 401 不再把 stats 的模型/账号表刷空；login 与 email-OTP 失败路径先脱敏再截断。
无 API 破坏。升级不要求改配置。ACU `^22` 仍默认关。

---

## 用户可感知

### 统计面板 401 不再假装「零请求」(#257 同类)

`loadOverview` / `loadModels` / `loadProxy` / `loadBans` 已在 `09bde39` 对
`success:false` 直接 return。`loadStats`（主面板 + sketch）仍把 401 当成
`totalRequests=0` 并重写 `#model-stats-table` / `#account-stats-table`。
现在同样 bail，保留上一帧。

### Login / OTP 失败不再切开 JWT 再脱敏

`09bde39` 给 PostAuth 5xx 接了 `sliceRedactedJson`，4xx throw 仍
`JSON.stringify(…).slice(0, 200)`，JWT 在第一个 `.` 被切开，正则认不出。
`windsurf-login.js` 的 Auth1 missing-token / PostAuth 4xx / Firebase refresh，
以及 `email-otp-login.js` 的 RegisterUser / SendEmailVerification，一律先
redact 再截断。

ACU `^22` 仍默认关。`FREE_TIER_SELECTOR` 仍是 `swe-1-6-slow`。不扩
`FREE_REACHABLE_SELECTORS`。

实测：`test/log-safety.test.js` + `test/dashboard-account-add-token.test.js`
21/21。`node src/dashboard/check-i18n.js` 绿。`secret-scan` exit 0。

---

## 工程

OTA 跟 annotated tag。v3.9.28 OTA 用户吃不到 `09bde39` 的 401 空表，本 tag
把那一刀和 stats/OTP 补丁一起发出去。

#258 仍开：等报告者旱灾下 `swe-1-7` / `glm-5.2` 确认 200。#250 / #245 /
#236 / #239 / #208 球仍在报告者。

Windows `npm run test:release`：318 文件里 6 个 exit 1（5 个
`git-fixture-env.js` / mutate / OTA 夹具要 `/usr/bin/git`，外加
`docs-consistency-guard` 的 heading-slug 在本机 Windows 对中文/emoji 锚点
误报；Linux CI 是权威）。突变规格未在 scratch 重跑。生产树未覆盖。
