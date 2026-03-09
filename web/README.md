<p align="center">
  <img src="octopus.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - AI Browser Assistant

`web` is the core AI extension component of the ocbot project, running as a Chrome Extension. It provides an interactive interface via the Side Panel and leverages low-level browser APIs to achieve automation.

This directory is part of the [ocbot](https://github.com/instry/ocbot) monorepo.

## ✨ Key Features

*   **Multi-Model Support**: Built-in support for major LLMs such as OpenAI, Anthropic, Gemini, DeepSeek, Moonshot, and more.
*   **Native Browser Integration**: Deeply integrated via the Side Panel, providing a seamless browsing experience without interruption.
*   **Autonomous Agent**: Utilizes `debugger` and `scripting` permissions to read web content and perform automated actions.
*   **Privacy First**: Your data remains in your control. Supports local models via compatible interfaces.

## 🛠️ Tech Stack

*   **Framework**: [WXT](https://wxt.dev/) (Web Extension Tools)
*   **UI Library**: React + Tailwind CSS
*   **Icons**: Lucide React
*   **Build Tool**: Vite (via WXT)

## 🚀 Development Guide

### Prerequisites

*   Node.js >= 18
*   npm or pnpm

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

This command starts a development server and attempts to automatically open Chrome with the extension loaded.

### Build for Production

```bash
npm run build
```

Build artifacts will be located in the `.output/` directory.

## 📦 Directory Structure

```
web/
├── entrypoints/        # Extension entry points (background, sidepanel, content)
├── lib/                # Core logic library
│   ├── agent/          # AI Agent core logic (act, observe, loop)
│   ├── llm/            # LLM adapters
│   └── channels/       # Communication channels (Telegram, etc.)
├── assets/             # Static assets
└── wxt.config.ts       # WXT configuration file
```

## 🔐 Permissions

This extension requests the following sensitive permissions to implement Agent functionality:

*   `sidePanel`: Provides the sidebar interactive interface.
*   `debugger`: Used for high-privilege browser automation operations.
*   `scripting`: Used to inject scripts into pages.
*   `tabs` & `activeTab`: Used to retrieve tab information.
*   `storage`: Used to save configuration and chat history.

## 🤝 Contributing

Pull Requests and Issues are welcome to improve the ocbot agent.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
