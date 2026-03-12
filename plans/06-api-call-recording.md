# Plan: API Call Recording — UI 自动化转 API 自动化

## Goal

在 agent 执行任务过程中，通过 CDP Network domain 拦截并记录 UI 操作触发的 HTTP API 调用。将成功的 API 调用序列保存为 Skill 的一种新 step 类型，下次执行相同任务时直接调用 API，跳过 UI 渲染和 LLM 推理。

## 动机

当前 Skill 回放依赖 UI 操作（点击、填表单），每次都需要页面渲染 + DOM 查找（甚至 LLM 推理）。将 UI 操作转化为底层 API 调用可以：

- **速度提升数量级**：跳过页面渲染、DOM 查找、LLM 推理
- **极高稳定性**：API 比 UI 变化频率低得多
- **零 token 消耗**：回放时不需要 LLM

## 数据结构

### 新增 Step 类型

```ts
// lib/skills/types.ts

interface ApiCallStep {
  type: 'api_call'
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  urlTemplate: string              // "https://example.com/api/orders/{{orderId}}"
  headerTemplates: Record<string, string>  // 静态 + 动态 headers
  bodyTemplate: string             // JSON 模板，含 {{变量}}
  contentType: string              // "application/json" etc.

  // 动态 token 标记（执行时从当前 session 提取）
  dynamicTokens: DynamicToken[]

  // 从 response 提取变量给后续步骤使用
  extractors: ResponseExtractor[]

  // 关联的原始 UI 操作（用于 fallback）
  originalUiStep?: AgentReplayStep
}

interface DynamicToken {
  name: string                     // 变量名，如 'csrfToken'
  source: 'cookie' | 'header' | 'localStorage' | 'page_meta'
  key: string                      // cookie name / localStorage key / meta name
}

interface ResponseExtractor {
  variableName: string             // 提取后的变量名
  jsonPath: string                 // "$.data.id" — 从 response body 提取
}
```

### NetworkCapture 记录结构

```ts
// lib/agent/networkCapture.ts

interface CapturedRequest {
  requestId: string
  timestamp: number
  method: string
  url: string
  headers: Record<string, string>
  postData?: string
  resourceType: string             // 'XHR' | 'Fetch' | 'Document' etc.

  // 关联的 UI 操作
  triggeredBy?: {
    instruction: string            // act() 的 instruction
    stepIndex: number
  }
}

interface CapturedResponse {
  requestId: string
  status: number
  headers: Record<string, string>
  body?: string                    // response body（限制大小）
}

interface CapturedExchange {
  request: CapturedRequest
  response: CapturedResponse
}
```

## 实现分 3 个 Phase

### Phase 1：Network 录制（观察）

**目标：** 在 act() 执行期间录制 HTTP 请求，不改变执行流程。

**新增文件：** `lib/agent/networkCapture.ts`

**核心逻辑：**

```ts
class NetworkCapture {
  private exchanges: CapturedExchange[] = []
  private pendingRequests: Map<string, CapturedRequest> = new Map()

  // 开始监听（在 act() 执行前调用）
  async startCapture(tabId: number): Promise<void> {
    await sendCdp(tabId, 'Network.enable', {})
    // 监听 Network.requestWillBeSent
    // 监听 Network.responseReceived
    // 监听 Network.loadingFinished（获取 response body）
  }

  // 停止监听（在 act() 执行后调用）
  async stopCapture(tabId: number): Promise<CapturedExchange[]> {
    await sendCdp(tabId, 'Network.disable', {})
    return this.getFilteredExchanges()
  }

  // 过滤：只保留有副作用的业务请求
  private getFilteredExchanges(): CapturedExchange[] {
    return this.exchanges.filter(ex => {
      const req = ex.request
      // 只保留有副作用的方法
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false
      // 排除已知的非业务请求
      if (this.isAnalytics(req.url)) return false
      if (this.isStaticResource(req.url)) return false
      // 只保留 XHR/Fetch
      if (!['XHR', 'Fetch'].includes(req.resourceType)) return false
      return true
    })
  }

  private isAnalytics(url: string): boolean {
    const patterns = [
      'google-analytics.com', 'analytics', 'tracking',
      'sentry.io', 'hotjar.com', 'facebook.com/tr',
      'doubleclick.net', 'googlesyndication',
    ]
    return patterns.some(p => url.includes(p))
  }

  private isStaticResource(url: string): boolean {
    return /\.(js|css|png|jpg|svg|woff|ico)(\?|$)/.test(url)
  }
}
```

**集成点：** 在 `act.ts` 的 `performAct()` 中，act 执行前后包裹 capture：

```ts
// act.ts — performAct()
const capture = new NetworkCapture()
await capture.startCapture(tabId)

// ... 执行原有 act 逻辑 ...

const exchanges = await capture.stopCapture(tabId)
// 将 exchanges 附加到 ActResult 返回
```

**验证方式：** 在 debug 页面显示录制到的 API 调用列表，人工检查是否正确捕获了业务请求。

### Phase 2：API 分析与模板化（提取）

**目标：** 用 LLM 分析录制的 API 调用，识别核心业务请求，提取动态参数，生成 ApiCallStep。

**新增文件：** `lib/skills/apiAnalyzer.ts`

**核心逻辑：**

```ts
async function analyzeApiCalls(
  exchanges: CapturedExchange[],
  uiSteps: AgentReplayStep[],
  provider: LlmProvider,
): Promise<ApiCallStep[]> {
  // 1. 构建 prompt，将录制的 API 调用 + 对应的 UI 操作发给 LLM
  // 2. LLM 分析并返回：
  //    - 哪些是核心业务请求（vs analytics/prefetch/无关请求）
  //    - 哪些参数是动态的（CSRF token, session ID, timestamp, random ID）
  //    - 请求之间的依赖关系（A 的 response 中的 ID 被 B 使用）
  //    - 生成 urlTemplate / bodyTemplate（用 {{变量名}} 占位）
  // 3. 返回结构化的 ApiCallStep 数组
}
```

**LLM Prompt 核心内容：**

```
你是一个 API 分析专家。以下是用户在网页上操作时触发的 HTTP 请求列表。
请分析并：
1. 标记哪些是核心业务请求（创建/修改/删除数据），哪些可以忽略
2. 识别请求中的动态参数（每次执行都不同的值），标记来源
3. 识别请求之间的数据依赖（某个请求的响应值被后续请求使用）
4. 生成参数化的请求模板

[录制的 API 调用数据]
```

**关键挑战与解决方案：**

| 挑战 | 方案 |
|------|------|
| CSRF token | 标记为 dynamicToken，source='cookie' 或 'page_meta' |
| Session/Auth | 执行时从当前 browser session 自动注入 cookies |
| 时间戳/随机ID | 标记为模板变量，执行时动态生成 |
| 请求链依赖 | 使用 ResponseExtractor 从上游 response 提取变量 |
| Body 中的用户输入 | 关联到 Skill 的 parameters |

### Phase 3：API 回放（执行）

**目标：** Skill 执行时，优先尝试 API 直接调用，失败时 fallback 到 UI 操作。

**新增文件：** `lib/skills/apiExecutor.ts`

**核心逻辑：**

```ts
class ApiExecutor {
  async executeApiStep(
    step: ApiCallStep,
    variables: Record<string, string>,   // 上游提取的变量 + Skill parameters
    tabId: number,                       // 用于获取 cookies
  ): Promise<ApiStepResult> {
    // 1. 从当前 session 提取 dynamic tokens
    const tokens = await this.resolveDynamicTokens(step.dynamicTokens, tabId)

    // 2. 渲染模板（替换 {{变量}}）
    const url = this.renderTemplate(step.urlTemplate, { ...variables, ...tokens })
    const body = this.renderTemplate(step.bodyTemplate, { ...variables, ...tokens })
    const headers = this.renderHeaders(step.headerTemplates, { ...variables, ...tokens })

    // 3. 通过 CDP Fetch / background fetch 发送请求
    //    （使用 tab 的 cookie jar，保持认证状态）
    const response = await this.sendRequest(tabId, {
      method: step.method,
      url,
      headers,
      body,
    })

    // 4. 从 response 提取变量（供后续步骤使用）
    const extracted = this.extractFromResponse(response, step.extractors)

    // 5. 验证 response status
    if (response.status >= 400) {
      return { success: false, variables: extracted, response }
    }

    return { success: true, variables: extracted, response }
  }

  private async resolveDynamicTokens(
    tokens: DynamicToken[],
    tabId: number,
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    for (const token of tokens) {
      switch (token.source) {
        case 'cookie': {
          const cookies = await chrome.cookies.getAll({ url: '...' })
          const cookie = cookies.find(c => c.name === token.key)
          if (cookie) result[token.name] = cookie.value
          break
        }
        case 'localStorage': {
          const value = await sendCdp(tabId, 'Runtime.evaluate', {
            expression: `localStorage.getItem('${token.key}')`,
          })
          if (value.result?.value) result[token.name] = value.result.value
          break
        }
        case 'page_meta': {
          const value = await sendCdp(tabId, 'Runtime.evaluate', {
            expression: `document.querySelector('meta[name="${token.key}"]')?.content`,
          })
          if (value.result?.value) result[token.name] = value.result.value
          break
        }
      }
    }
    return result
  }

  private async sendRequest(
    tabId: number,
    req: { method: string; url: string; headers: Record<string, string>; body: string },
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    // 使用 CDP Fetch domain 在 tab 上下文中发请求（继承 cookies）
    // 或者使用 chrome.declarativeNetRequest + fetch from background
    // 推荐方案：在 tab 中注入 fetch 调用
    const result = await sendCdp(tabId, 'Runtime.evaluate', {
      expression: `
        fetch('${req.url}', {
          method: '${req.method}',
          headers: ${JSON.stringify(req.headers)},
          body: ${JSON.stringify(req.body)},
          credentials: 'include',
        }).then(r => r.text().then(body => ({
          status: r.status,
          body,
        })))
      `,
      awaitPromise: true,
    })
    return JSON.parse(result.result.value)
  }
}
```

**Skill Runner 集成：**

在 `SkillRunner` 中，对 `api_call` 类型的 step：
1. 先尝试 API 直接调用
2. 如果失败（401/403/500），fallback 到关联的 `originalUiStep`（如果有）
3. 记录执行结果（API 成功率），用于后续优化

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `lib/agent/networkCapture.ts` | Phase 1: CDP Network 录制 |
| 修改 | `lib/agent/act.ts` | Phase 1: 在 act() 中集成录制 |
| 修改 | `lib/agent/loop.ts` | Phase 1: 传递录制数据到 onRecordedSteps |
| 修改 | `lib/skills/types.ts` | 新增 ApiCallStep 类型定义 |
| 新增 | `lib/skills/apiAnalyzer.ts` | Phase 2: LLM 分析 API 调用 |
| 新增 | `lib/skills/apiExecutor.ts` | Phase 3: API 回放执行 |
| 修改 | `lib/skills/runner.ts` | Phase 3: 集成 api_call step 执行 |
| 修改 | `lib/skills/create.ts` | Phase 2: Skill 创建时包含 API 步骤 |

## 执行顺序

1. **Phase 1 先行**：只做录制，不改执行流程。通过 debug 页面验证捕获质量。
2. **Phase 2 跟进**：LLM 分析 + 模板化。在 "Save as Skill" 流程中增加 API 分析步骤。
3. **Phase 3 最后**：API 回放 + fallback。需要充分测试各种网站的兼容性。

## 风险与注意事项

- **CORS**：在 tab 上下文中 fetch 会受 CORS 限制。可能需要通过 background script 发请求并手动注入 cookies。
- **认证过期**：Session token 可能在回放时已过期。需要检测 401 并提示用户重新登录。
- **请求体过大**：文件上传等场景不适合录制。需要设置 body 大小上限（如 1MB）。
- **幂等性**：POST 请求可能不幂等（重复调用创建多条记录）。需要在 Skill 元数据中标记。
- **网站反爬**：部分网站检测非浏览器环境的请求特征。在 tab 上下文中 fetch 可以规避大部分检测。
