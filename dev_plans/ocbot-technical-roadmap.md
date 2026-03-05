# ocbot Technical Roadmap & Architecture Strategy

Derived from [Stagehand Technical Analysis](./stagehand-technical-analysis.md).

## 1. 混合视觉-代码策略 (Hybrid Vision-Code Strategy)

针对 ocbot，我们可以采用 **"首次视觉探索，后续代码回放" (Vision First, Code Replay)** 的策略，以平衡成功率与运行成本。

*   **核心理念**:
    *   **首次运行 (Cold Start)**: 不计成本地追求成功率。启用多模态大模型 (GPT-4o/Claude 3.5 Sonnet) + 全页截图 + AXTree。利用视觉能力解决“难以描述的 UI 元素”（如无文本图标、复杂布局）的定位问题。
    *   **锚点固化 (Anchoring)**: 视觉模型不仅执行操作，还负责“翻译”——找到该视觉元素对应的底层代码锚点（如稳定的 AXTree ID、XPath 或 CSS Selector）。
    *   **后续运行 (Warm Start)**: 仅使用缓存的锚点进行代码级回放（CDP/Kernel）。完全跳过视觉处理和 LLM 推理，实现毫秒级响应。

*   **优势**:
    *   **高鲁棒性**: 视觉能力弥补了 DOM/AXTree 在语义理解上的盲区。
    *   **低摊销成本**: 虽然首次运行昂贵（$0.01-$0.03/step），但后续成千上万次运行成本几乎为零。
    *   **自愈升级**: 当代码回放失败时，再次唤醒视觉能力进行“再校准”。

## 2. 内核级优化 vs CDP (深度解析)

Stagehand 是基于 CDP 的外部工具，而 ocbot 是浏览器内核本身。这种架构差异带来了显著的优势，但也伴随着巨大的挑战。

### 优势 (Pros)
1.  **性能 (Latency & Throughput)**:
    *   **CDP**: 依赖 WebSocket/Pipe 通信，序列化开销显著。例如 `Accessibility.getFullAXTree` 在大页面上可能产生 MB 级数据传输。
    *   **Kernel**: 直接在 C++ 渲染进程执行，零 IPC 开销。可以直接访问内存中的 `AXTree` 对象，性能提升 10x-100x。
2.  **隐蔽性 (Stealth)**:
    *   **CDP**: 开启 CDP 调试端口容易被反爬虫系统检测（如 Cloudflare, Akamai）。
    *   **Kernel**: 可以在浏览器内部通过 C++ 接口操作，对外完全透明，不修改 `navigator.webdriver` 等指纹特征。
3.  **上下文感知 (Context Awareness)**:
    *   **Kernel**: 可以访问 CDP 无法获取的内部状态（如网络栈底层细节、渲染流水线状态）。

### 不足与挑战 (Cons & Challenges)
1.  **维护成本极高 (Maintenance Hell)**:
    *   Chromium 代码库庞大且迭代极快（每 4 周一个大版本）。任何内核补丁（Patch）都需要随着 Chromium 版本升级而不断适配，维护负担呈指数级增长。
2.  **开发复杂度**:
    *   需要精通 C++ 和 Chromium 内部架构（Blink, Content API, V8）。调试难度远高于 TypeScript/Node.js。
3.  **生态隔离**:
    *   难以直接复用现有的 Node.js 生态库（如 Playwright, Puppeteer 插件）。

### 建议架构
采用 **"内核增强 + CDP 编排"** 的混合架构：
*   **重计算/高频操作**（如 AXTree 遍历、快照生成、视觉特征提取）下沉到 **C++ 内核层** 实现，暴露为自定义的高性能 CDP 方法。
*   **业务逻辑/流程控制**（如 Agent 状态机、LLM 调用、缓存管理）保留在 **TypeScript/Node.js 层**，保持开发效率和灵活性。

## 3. 视觉数据流优化 (Visual Data Pipeline Optimization)

针对用户提出的“在内核中完成截屏、压缩、Base64 编码”的设想，这是一个极具价值的优化点。

*   **现状 (Standard CDP)**:
    *   `Page.captureScreenshot` 通常获取全分辨率图像。
    *   流程: `Render (4K)` -> `Encode (PNG/JPEG)` -> `Base64` -> `IPC (5MB+)` -> `Node.js` -> `Resize (to 1024px)` -> `Re-encode` -> `LLM`。
    *   **瓶颈**: 传输和处理大量冗余像素数据，造成巨大的 CPU 和 IO 浪费。

*   **内核级优化方案 (Kernel-Level LLM Snapshot)**:
    *   在 Chromium `PageHandler` 中实现自定义方法 `Page.captureLLMSnapshot`。
    *   **C++ 内部流水线**:
        1.  **Capture**: 获取原始 `SkBitmap` (内存操作)。
        2.  **Resize**: 直接在 C++ 层使用 Skia 将图像缩放至 LLM 友好尺寸（如最长边 1024px）。
        3.  **Compress**: 使用高性能编码器（如 WebP/JPEG Turbo）进行有损压缩（Quality 60-80）。
        4.  **Base64**: 在 C++ 层直接转换为 Base64 字符串。
    *   **直接产出**: 仅需传输约 30KB-50KB 的字符串给 Node.js。

*   **性能收益预估**:
    *   **延迟 (Latency)**: 降低 **90%** (从 ~300ms 降至 ~30ms)。
    *   **带宽/IPC**: 降低 **99%** (从 ~5MB 降至 ~50KB)。
    *   **CPU**: 避免了 Node.js 端的解码-缩放-再编码 (Decode-Resize-Encode) 的昂贵计算。

## 4. 拟人化交互引擎 (Human-like Interaction Engine)

当前的自动化操作（如 `Input.dispatchMouseEvent`）通常是瞬间完成的、坐标精确的机械行为，极易触发反爬虫系统（如 Cloudflare, Akamai）的风控。

*   **核心问题**:
    *   **鼠标**: 瞬间移动 (Teleporting)、直线移动、点击无偏差。
    *   **键盘**: 输入速度恒定、无间隔、瞬间完成。
    *   **特征**: `isTrusted` 属性虽可通过 CDP 伪造，但**行为特征**无法伪造。

*   **技术方案 (Ghost Cursor & Natural Typing)**:

    1.  **鼠标轨迹生成 (Bézier Curves)**:
        *   不使用 `(x1, y1) -> (x2, y2)` 的直线。
        *   使用 **贝塞尔曲线 (Bézier Curves)** 生成平滑路径，模拟人手的自然抖动。
        *   **Fitts's Law**: 模拟接近目标时的减速行为。
        *   **Overshooting**: 模拟轻微的“瞄准过头”再修正的行为。

    2.  **输入队列系统 (Input Queuing)**:
        *   **Key Rhythm**: 键盘输入不应是 `type("hello")` 瞬间完成。
        *   实现 `KeyDown` -> `RandomDelay(50-150ms)` -> `KeyUp` 的序列。
        *   模拟打字时的“停顿思考”和“爆发式输入”节奏。

    3.  **视口行为 (Viewport Behavior)**:
        *   **Idle Jitter**: 当页面加载或等待时，鼠标不应完全静止，而应有微小的随机移动。
        *   **Random Scrolling**: 模拟人类在阅读时的随机滚动行为，而非直接跳转到目标位置。

*   **实现层级**:
    *   建议在 **Node.js 控制层** 实现轨迹计算，生成一系列高频 (60Hz) 的 `Input.dispatchMouseEvent` CDP 指令序列。
    *   不需要内核级修改，因为 CDP 的 `Input` 域已经足够底层，关键在于**调用参数的生成算法**。
