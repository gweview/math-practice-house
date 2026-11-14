# 快乐数学练习屋

当前版本：**v2.0.0**

面向数学启蒙至小学六年级的纯前端数学、数独与二元推算练习生成、A4 打印工具。所有题目在浏览器内生成，不需要账号、数据库或第三方 AI 服务。

## 功能

- 7 个学习阶段（数学启蒙至六年级）、严格按年级/自由组合两种范围、5 档多维难度、109 种数学题型，支持 5～100 题。
- 题库按计算、概念、图形与测量、数据、应用五类内容组织，覆盖四则运算、分数/小数/百分数、数轴与钟表、几何与单位、表格与统计图及分步应用题。
- 按整张试卷平衡题型数量、进退位、简单题、比较关系、高位数抽样与混合运算占比。
- 独立的加减法竖式、乘除法竖式模式：不与口算混排，每页固定 8 题，按难度控制进退位、乘法进位和有余数除法比例。
- 竖式练习提供专用列式与长除法底稿；支持去重、失败重试、标准答案、答案页、题号和答题线。
- 数学练习先规划真实 A4 物理 sheet，再渲染练习页与一一对应的答案页；纵向/横向、标准/大字体均使用同一分页模型。
- 竖式使用按位数字网格，长除法使用独立底稿；每道题和每张纸都禁止内部跨页，保留 10mm 打印安全区与 1mm 分页取整余量，并省略不必要的提示性页尾。
- 独立数独模式：4×4 提供启蒙、基础、挑战 3 档，9×9 提供入门、简单、标准、提高、挑战 5 档；可添加多个题组，自由组合规格、难度与题量。
- 每盘数独经过唯一解校验；难度综合提示数、单数策略、搜索分支和深度评分，而不是只更换标签。
- 数独按真实 A4 物理 sheet 规划并预览，可生成独立答案页；“打印数独”和“打印数学练习”严格隔离，互不夹带。
- 独立二元推算模式：支持同值推算、代入推算、和差推算、连推算四种方法，按阶段和五档难度生成 4～40 题。
- 每道推算题都保存结构化等式并由独立求解器复核，保证两个图形不同、数值不同、答案唯一且为非负整数；不生成分数、负数或除不尽的题。
- 二元推算提供儿童友好的分步答案、纵横向 A4 物理页、标准/大字体和独立打印目标，不会夹带数学或数独页面。
- 配置保存到 LocalStorage；不保存姓名、历史、答题结果或个人信息。
- 自绘 SVG/CSS 与 Emoji 装饰，无外链图片、字体、统计、广告或 Cookie。

### 答案协议与打印矩阵

数学题目保留 `Question.answer` 和 `answerDetails` 作为 legacy 兼容字段，同时逐步接入严格的 `AnswerProtocol`：可表达整数、定点小数、最简分数/假分数/带分数、百分数、比、比较符号、带单位、多问和可选步骤。答案页有两种模式：紧凑核对表适合短答案快速核对，详解页保留必要题干与分步过程；选择“无”则只打印练习页。

数学、数独和二元推算分别规划独立的 A4 physical sheets，不会互相夹带。数学练习支持纵向/横向、标准/大字体、无答案/紧凑答案/详解答案，以及按题量或目标 1/2 页生成；复杂图形、表格、图表和多小问题目按实际 footprint 安全分页，不强行压缩或裁切。真实打印建议 A4、100% 缩放并关闭浏览器页眉页脚。

### 数独难度与打印

从页面顶部切换到“数独练习”后，可以添加多个题组；每组分别选择 4×4 或 9×9、对应难度和题目数量。一二年级建议先从默认的 4×4 启蒙开始，再把 9×9 入门作为亲子陪伴下的过渡。4×4 提供“启蒙、基础、挑战”3 档：启蒙保留较多提示并以直观单数为主，基础需要连续观察行、列和 2×2 小宫，挑战提示更少并要求更深入的排除。9×9 提供“入门、简单、标准、提高、挑战”5 档，目标提示数依次约为 65、61、57、31、29。

9×9 的前三档以兴趣和连续成功为优先。入门只留 16 个空格，每一行、每一列和每一宫都留 1～2 格，因此开局固定会有 2 行、2 列、2 宫只缺一格，并保证整盘都能沿着这种方法完成；简单、标准分别只留 20 格和 24 格空白，也保证三类区域都有直接起点，且先用“只缺一格”完成至少 8 格和 4 格。三档都禁止隐性单数和猜测，不会为了拉开难度而淘汰意外更简单的题。所有 9×9 难度都拒绝完整填满的行、列或宫；生成器会记录儿童友好区域、显性/隐性单数、搜索分支和最大决策深度，不满足本档门槛的候选题不会作为兜底返回。当前难度模型衡量完整的单数解题路径与确定性搜索复杂度，不宣称覆盖 X-Wing 等全部人类高级技巧。

“题目数量”和“每页密度”彼此独立：增加题目会按需要增加物理纸张，不会为了把所有题强塞进一页而无限缩小宫格。4×4 练习在“舒适”密度下每页最多 4 盘，在“紧凑”密度下每页最多 6 盘，并保持适合书写的格子；9×9 练习每页最多 2 盘，因此 4 盘练习会稳定拆成 2 页。答案页独立规划，可将 4 盘 9×9 答案以 2×2 合排在 1 页。遇到“1 盘 9×9 + 2 盘 4×4”等组合时，会优先使用大棋盘为主、两个小棋盘为辅的混合模板，其余组合按规格和可写尺寸自动分页。

页面方向可选择“自动、纵向、横向”。自动模式根据整份练习选择一个稳定方向：单盘通常使用纵向，多盘 9×9 或专用混排通常使用横向，避免同一打印任务逐页切换方向带来的浏览器兼容问题。生成后的题目内容使用当次配置快照；方向和密度用于规划整份练习的物理 sheet。

预览中的每一张纸就是一张真实 A4 sheet，屏幕仅做等比缩放，打印时继续使用同一套分页和题卡结构，做到所见即所得。每张练习纸保留一次精简页头以及所选的姓名、日期、用时栏；每盘题按纸面阅读顺序连续编号，并保留规格和难度，空间充足时还会显示提示数；答案页沿用相同题号，便于核对。棋盘使用毫米尺寸与安全边距约束，整盘禁止跨页；若空间不足会拆页，不会通过隐藏溢出来静默截断棋盘或宫格。

数独和数学练习使用独立配置与独立打印目标，互不夹带。打印时推荐 Chrome/Edge，选择 **A4**、**缩放 100%**，关闭浏览器自带的**页眉和页脚**，并保持页面边距为默认或无额外自定义缩放；应用在 `@page` 页边距之外还预留内部安全区，以兼容常见打印机的不可打印边缘。

## 技术架构

```text
浏览器（题目生成、状态、答案、打印）
        │
127.0.0.1:8088 / 现有公网反向代理
        │
Caddy Gateway（安全响应头、日志）
        │ Docker internal network
Caddy Static Web（非 root、只读文件系统）
```

前端使用 React 19、TypeScript、Vite、原生 CSS、Vitest。Docker 为 Node 构建 + Caddy 运行的多阶段镜像。当前主机 443 已由 Xray 占用，因此默认只绑定 `127.0.0.1:8088`，不会抢占 80/443，也不会把内部 Web 容器暴露到公网。

## 目录结构

```text
src/
  app/                       # 应用壳、模式导航、打印控制与会话基础设施
  core/                      # 兼容入口、组卷、配置校验、随机源与基础生成器
  domain/
    curriculum/              # 年级、课标档案与课程常量（默认 π=3.14）
    math-core/               # 精确 Fraction、定点 Decimal、单位进率
    questions/               # 题型模型、五类内容、注册表、答案协议与覆盖检查
    worksheet/               # blueprint、题型配额、footprint 分页与页面预算
  question-types/            # calculation/concept/geometry-measurement/data/application
  features/math/             # 数学 physical sheet、工作簿、结构化图形与打印样式
  features/sudoku/           # 4×4/9×9 生成、求解、难度、分页、UI 与打印
  features/binary-reasoning/ # 二元推算生成、独立求解校验、分页、UI 与打印
  shared/                    # seeded random、LocalStorage 会话与共享 UI
  App.tsx main.tsx styles.css
tests/                       # domain、题型、答案协议、布局与浏览器回归
public/                      # 本地静态资源（无外链）
docker/                      # Caddy 静态服务配置
Dockerfile docker-compose.yml Caddyfile Caddyfile.https.example
scripts/e2e-sudoku.mjs scripts/e2e-binary-reasoning.mjs scripts/deploy.sh scripts/update.sh scripts/security-check.sh
```

## 本地开发

要求 Node.js 20、pnpm 9：

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm dev
```

开发服务器只监听 `127.0.0.1`。质量检查：

```bash
pnpm lint
pnpm test
pnpm exec vitest run tests/performance-baseline.test.ts
pnpm build
pnpm test:e2e
pnpm test:layout
pnpm test:sudoku-layout
pnpm test:binary-reasoning-layout
```

其中 `pnpm test` 会运行数学、数独和二元推算的生成、求解、难度与物理 sheet 规划单元测试；`pnpm test:e2e` 和 `pnpm test:layout` 检查数学练习、单页/答案页 PDF 数量及空白孤页；`pnpm test:sudoku-layout` 检查数独；`pnpm test:binary-reasoning-layout` 检查二元推算的四种方法、分步答案、真实 PDF、移动端布局和三模块打印隔离。提交前应依次执行以上全部命令。

`tests/performance-baseline.test.ts` 在 Node 核心环境中预热后重复测量 5 次 `generateWorksheet`（100 道普通数学题），计时范围不包含 Vite、浏览器启动或测试收集，取中位数和最慢样本与 500ms 稳定预算比较；测试本身不额外调用 validator 或用相同答案逻辑自证。

## Docker 部署

```bash
cp .env.example .env
chmod +x scripts/*.sh
./scripts/deploy.sh
curl -I http://127.0.0.1:8088
```

若当前 shell 尚未获得 Docker 组权限，可重新登录，或在上述命令前临时使用 `sudo` 执行 `docker compose ...`。服务设置 `restart: unless-stopped`。

## VPS 与域名接入

1. 将域名 A/AAAA 记录解析到 VPS 公网地址。
2. 确认 80/443 的占用者：`sudo ss -lntup | grep -E ':(80|443)\b'`。
3. **优先复用现有反向代理**，把域名转发到 `127.0.0.1:8088`。不要再将 Compose Gateway 映射到 80/443。
4. Caddy 可复制 `Caddyfile.https.example` 为独立站点配置，将 `example.com` 改为域名，再通过 `caddy validate --config <配置文件>` 验证后 reload。Caddy 会自动申请 Let's Encrypt 证书并将 HTTP 跳转到 HTTPS。
5. 当前主机 443 是 Xray，不应覆盖其配置。若要由 Xray 与站点共享 443，需要先提供域名并按现有 Xray 的回落/分流架构接入；修改前务必备份。

### 独立 Caddy 示例

```bash
sudo cp Caddyfile.https.example /etc/caddy/sites/math-worksheet.caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

实际 include 路径须以服务器现有 Caddy 主配置为准。本项目不会自动修改系统反向代理。

## 防火墙建议

公网通常只需 SSH、HTTP、HTTPS；但应先审计现有 Xray/Tailscale 端口后再改规则。本项目不会覆盖 UFW/nftables。示例仅供已确认现有服务后执行：

```bash
sudo ufw status verbose
sudo nft list ruleset
sudo ss -lntup
# 确认无其他必要端口后，才考虑：
# sudo ufw allow OpenSSH
# sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp
# sudo ufw enable
```

云厂商安全列表也应同步限制；默认 `127.0.0.1:8088` 无需对公网放行。

## 日志与健康状态

```bash
docker compose ps
docker compose logs --tail=100
docker compose logs -f gateway
docker inspect -f '{{.State.Health.Status}}' math-worksheet-web-1
curl -fsS http://127.0.0.1:8088/health
```

日志使用 `json-file`，每容器最多 3 个 5MB 文件。

## 更新、回滚、停止与卸载

更新源码后：

```bash
./scripts/update.sh
```

更新脚本会先构建生产文件，并在仅绑定回环地址的临时预览端口（默认 `4173`，可用 `E2E_PORT` 覆盖）完成三组浏览器回归；全部通过后才会替换 Compose 容器，避免把未通过打印检查的版本留在线上。

回滚建议先用 Git 标记稳定版本：

```bash
git checkout <稳定标签或提交>
pnpm install --frozen-lockfile
docker compose build
docker compose up -d
```

停止/启动/重启：

```bash
docker compose stop
docker compose start
docker compose restart
```

卸载项目容器与网络（不会影响其他容器）：

```bash
docker compose down
docker image rm math-worksheet-web:2.0.0  # 可选
```

不要使用会删除其他项目资源的全局 `docker system prune -a`。

## 常见故障排查

- **8088 被占用**：用 `ss -lntup` 查明进程；在 `.env` 修改 `PORT` 后重建，仍保持 `BIND_ADDRESS=127.0.0.1`。
- **容器 unhealthy**：运行 `docker compose logs --tail=100 web gateway`，再在容器内请求 `/health`。
- **Docker 权限不足**：重新登录使 `docker` 组生效，或使用 `sudo docker compose`。
- **证书申请失败**：核对 DNS、云防火墙、80/443 路由与 Caddy 日志；确认域名没有代理到错误地址。
- **打印分页不理想**：Chrome/Edge 中选择 A4、缩放 100%、关闭浏览器页眉页脚；应用题和单题已设置 `break-inside: avoid`。
- **页面空白**：检查浏览器控制台与 CSP；运行 `curl -I` 确认 JS/CSS 返回 200。项目不依赖外部 CDN。
- **配置异常**：点击对应模式的“恢复默认设置”。数学配置键是 `math-worksheet-config-v1`，数独配置键是 `math-worksheet-sudoku-config-v2`，二元推算配置键是 `math-worksheet-binary-reasoning-config-v1`；三者互不覆盖。数独首次升级会读取旧的 `math-worksheet-sudoku-config-v1` 并自动迁移。

## 安全检查清单

运行 `./scripts/security-check.sh`，并确认：

- [x] 多阶段构建，小型固定版本基础镜像。
- [x] 两个容器均非 root、`no-new-privileges`、删除全部 capabilities。
- [x] 根文件系统只读，临时目录使用受限 tmpfs。
- [x] Web 仅 `expose` 到内部网络；Gateway 仅绑定回环地址。
- [x] CPU、内存、PID 限制，健康检查，自动重启与日志轮转。
- [x] CSP、X-Content-Type-Options、X-Frame-Options、Referrer-Policy、Permissions-Policy、HSTS。
- [x] 无密码、Token、私钥、第三方追踪或远程资源。
- [ ] 提供域名后，由现有 443 入口启用真实 HTTPS 并验证证书链。

> HSTS 头已经配置，但只有通过 HTTPS 访问时浏览器才会采纳。

## 隐私

**本工具默认在浏览器本地生成题目，不收集或上传儿童个人信息。**

LocalStorage 只分别保存数学、数独、二元推算的题型/难度、数量和打印选项；不保存生成过的题目、儿童姓名、练习历史、答题结果或 IP 行为数据。服务无数据库、登录、广告、追踪、第三方统计、第三方字体和不必要 Cookie。
