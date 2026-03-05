# Skill Distribution

Open-source vs closed-source models, encryption, and cloud storage.

Parent document: [skill-system.md](./skill-system.md)

---

## Open-Source vs Closed-Source Skills

Skill 分为两种分发模式：**开源（Open-Source）** 和 **闭源（Closed-Source）**。

### 对比

| | Open-Source | Closed-Source |
|---|---|---|
| **SKILL.md** | 明文可读 | 加密，仅 metadata 可见 |
| **scripts/steps.json** | 明文可读 | 加密 |
| **scripts/references/assets** | 明文可读 | 加密 |
| **分发方式** | GitHub repo / zip / URL 导入 | Marketplace 加密分发 |
| **Fork** | 自由 fork，完整源码 | 不可 fork（看不到源码） |
| **Clone** | 可 clone（跟随上游更新） | 可 clone（跟随上游更新） |
| **社区贡献** | PR / fork 改进 / issue 反馈 | 只能反馈给作者 |
| **商业模式** | 免费，靠声誉和生态 | 付费 / 订阅 / 免费增值 |
| **转换** | 不可转闭源（已公开） | 作者可选择开源（单向） |

### Open-Source Skill

**格式**：标准文件目录，可直接托管在 GitHub：

```
my-skill/
├── SKILL.md              # 明文，任何人可读
├── scripts/
│   ├── steps.json         # 明文，可学习和改进
│   └── *.py / *.sh        # 明文
├── references/            # 明文
└── assets/                # 明文
```

**导入方式**：
- **GitHub URL**: 粘贴 repo URL → 一键导入
- **Zip 上传**: 拖拽 zip 文件到 Skills 页面
- **Marketplace**: 开源 skill 也可发布到 marketplace，标记为 "Open Source"

**导出方式**：
- Skill 详情页 → "Export" → 生成 zip 文件
- 或直接 "Push to GitHub"（需要 GitHub 授权）

### Closed-Source Skill

**格式**：加密 bundle：

```
my-skill.ocskill (encrypted bundle)
├── manifest.json          # 明文：name, description, parameters, categories, triggerPhrases
└── payload.enc            # 加密：SKILL.md body + scripts/steps.json + resources
```

**Clone 流程（闭源唯一的获取方式）**：
```
用户浏览闭源 Skill → "Clone" (或 "购买" 后 Clone)
  ▼ 下载加密 bundle → 本地解密执行
  ▼ 只能运行，不能查看或编辑 SKILL.md/steps.json
  ▼ 跟随上游更新：作者发布新版本 → 自动同步
  ▼ self-heal 产生的进化数据存在本地（不回写上游）
```

---

## Encryption & Cloud Storage (Phase 3+)

核心原则：**密钥永远不出内核层，JS 层只传密文进出，服务端永远不持有明文。**

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chromium 内核层 (C++)                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  OcbotCryptoService (Mojo IPC)                    │  │
│  │  ● Key Derivation (HKDF-SHA256)                   │  │
│  │  ● Encrypt / Decrypt (AES-256-GCM)               │  │
│  │  ● Master Key ←→ OS Keychain (Ocbot Safe Storage) │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │ chrome.ocbot.crypto API           │
├──────────────────────┼──────────────────────────────────┤
│  ┌───────────────────▼───────────────────────────────┐  │
│  │              Extension 层 (TypeScript)              │  │
│  │  SkillStore ──► encrypt ──► Cloud API ──► Server   │  │
│  │  SkillStore ◄── decrypt ◄── Cloud API ◄── Server   │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    Cloud 层                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Auth Service │  │ Skill Store  │  │ Marketplace   │  │
│  │ (JWT/OAuth)  │  │ (encrypted)  │  │ (metadata)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Why Kernel-Level Crypto

| Dimension | Web Crypto (JS) | Kernel (C++) |
|-----------|-----------------|-------------|
| Master Key storage | JS heap, readable by devtools | OS Keychain, process-isolated |
| Key lifecycle | GC timing uncertain | Manual `memset(0)` |
| Attack surface | Malicious extensions, console | Mojo IPC with permission check |
| Hardware support | None | macOS: Secure Enclave; Windows: TPM |

### Key Hierarchy

```
OS Keychain ("Ocbot Safe Storage")
  └─ Master Key (AES-256)           ← 设备级，永不离开内核
       │ HKDF-SHA256(master_key, context)
       ├─ SK_skill_1                 ← context: "skill:<skillId>"
       ├─ SK_skill_2
       └─ SK_provider_keys           ← context: "provider:<providerId>"
```

### Mojo Interface

```mojom
interface OcbotCryptoService {
  Initialize() => (bool success);
  Encrypt(string context, array<uint8> plaintext) => (array<uint8> ciphertext, array<uint8> nonce);
  Decrypt(string context, array<uint8> ciphertext, array<uint8> nonce) => (array<uint8>? plaintext);
  ExportWrappedKey(string passphrase) => (array<uint8> wrapped_key);
  ImportWrappedKey(string passphrase, array<uint8> wrapped_key) => (bool success);
};
```

### Private vs Public Skill Encryption

**Private Skill** — 全加密，服务端只看到 opaque blob + timestamps：

```json
{
  "id": "skill_abc123",
  "owner_id": "user_xyz",
  "visibility": "private",
  "blob": "<base64 encrypted everything>",
  "blob_nonce": "<base64>",
  "updated_at": 1740700800
}
```

**Public Skill (Marketplace)** — metadata 明文（供发现），content 加密（保护 IP）：

```json
{
  "id": "skill_def456",
  "visibility": "public",
  "metadata": { "name": "...", "description": "...", "categories": [...] },
  "encrypted_content": "<base64>",
  "distribution_blob": "<base64>"
}
```

### Clone Key Transformation

```
作者发布: plaintext → encrypt(author_SK) → encrypted_content
          plaintext → encrypt(dist_key)  → distribution_blob

用户 Clone: download distribution_blob → decrypt(dist_key) → re-encrypt(user_SK) → 本地密文
```

### Cross-Device Sync

```
设备 A: passphrase → PBKDF2 → wrapping_key → AES-KW(master_key) → wrapped_blob → QR/text
设备 B: paste wrapped_blob + passphrase → 解包 → 存入 Keychain → 云端数据即可解密
```

### Cloud API

```
POST   /api/skills                  上传 (encrypted blob)
GET    /api/skills/:id              下载
PUT    /api/skills/:id              更新
DELETE /api/skills/:id              删除
GET    /api/skills?q=...&cat=...    搜索 (public skill metadata)
POST   /api/skills/:id/clone        Clone
POST   /api/skills/:id/fork         Fork (只返回参数骨架)
POST   /api/skills/:id/metrics      上报执行指标
```

### Bonus: Encrypt Existing Sensitive Data

有了 `chrome.ocbot.crypto`，可统一加密现有明文数据（`LlmProvider.apiKey`、`ChannelConfig.botToken`）：

```typescript
const { ciphertext, nonce } = await chrome.ocbot.crypto.encrypt(
  `provider:${provider.id}`,
  new TextEncoder().encode(provider.apiKey)
)
// 明文不落盘，只存密文
```
