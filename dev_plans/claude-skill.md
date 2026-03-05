# Claude Skills Guide

> **Note**: This guide is based on the latest documentation and best practices for Claude Code and Agent Skills as of late 2025/early 2026.

## 1. Overview

**Skills** are modular capabilities that extend Claude's functionality. They allow you to package domain expertise, organizational knowledge, and specialized workflows into reusable units.

Key characteristics:
- **Filesystem-based**: Skills are defined in folders containing instructions and resources.
- **Progressive Disclosure**: Claude loads information in stages (Metadata → Instructions → Resources) to save context window space.
- **Flexible Invocation**: Can be triggered manually (e.g., `/skill-name`) or automatically by Claude when relevant to the user's request.
- **Agent Skills Standard**: Follows an open standard compatible across multiple AI tools.

## 2. Skill Locations & Scope

Where you store a skill determines who can use it and its precedence.

| Location | Path | Scope |
| :--- | :--- | :--- |
| **Project** | `.claude/skills/<skill-name>/SKILL.md` | Specific to the current project (committed to git). |
| **Personal** | `~/.claude/skills/<skill-name>/SKILL.md` | Available across all your projects. |
| **Plugin** | `<plugin-name>/skills/<skill-name>/SKILL.md` | Distributed via plugins. |
| **Enterprise** | (Managed Settings) | All users in an organization. |

**Precedence**: Enterprise > Personal > Project.
*Note: Plugin skills use a namespace (`plugin-name:skill-name`) to avoid conflicts.*

## 3. Directory Structure

A skill is a directory with a `SKILL.md` entry point and optional supporting files.

```text
my-skill/
├── SKILL.md           # [Required] Main instructions & metadata
├── template.md        # [Optional] Templates for Claude to fill
├── examples/          # [Optional] Few-shot examples
│   └── output.md
└── scripts/           # [Optional] Executable scripts (Bash, Python, etc.)
    └── validate.sh
```

### SKILL.md Format

The `SKILL.md` file must start with YAML frontmatter followed by markdown instructions.

```markdown
---
name: my-skill-name
description: A clear description of what this skill does and when to use it.
---

# My Skill Name

Detailed instructions for Claude on how to perform the task.

## Guidelines
- Guideline 1
- Guideline 2

## Usage
Run script: `scripts/validate.sh`
```

**Critical Field**: `description`
- Claude uses this to decide *when* to activate the skill automatically.
- Must be specific enough to distinguish it from other skills but broad enough to catch relevant intents.

## 4. Creating Skills

### Method A: Manual Creation
Simply create the directory structure and `SKILL.md` file in `.claude/skills/`.

### Method B: Using `skill-creator` (Recommended)
The `skill-creator` plugin helps interactively build, test, and refine skills.

1.  **Install/Enable**:
    ```bash
    /plugin install skill-creator
    ```
2.  **Usage**:
    - `/skill-creator`: Starts the interactive wizard.
    - `/skill-creator create <name>`: Scaffolds a new skill.
    - `/skill-creator test <name>`: Runs evaluations.

## 5. Bundled Skills

Claude Code comes with several built-in skills:

-   **/simplify**: Reviews recent changes for code reuse, quality, and efficiency. Spawns parallel agents to fix issues.
-   **/batch**: Orchestrates large-scale changes (e.g., migrations). Decomposes work into independent units and executes them in parallel git worktrees.
-   **/debug**: Troubleshoots the current session by analyzing debug logs.
-   **/claude-api**: Provides Claude API and SDK reference documentation.

## 6. Best Practices

1.  **Progressive Disclosure**:
    - Don't dump everything into `SKILL.md`.
    - Put reference data (API docs, schemas) in separate files and reference them in `SKILL.md`. Claude will only read them if needed.
2.  **Scripts for Logic**:
    - Use scripts (Python/Bash) for deterministic logic, data processing, or complex validation.
    - Let Claude orchestrate the script execution rather than simulating the logic.
3.  **Evals & Testing**:
    - Define test cases (prompts + expected outcomes).
    - Use `skill-creator` to run evals and measure performance/regression.
4.  **Clear Descriptions**:
    - The YAML `description` is the "API" to Claude's router. Write it for the AI, not just the human.

## 7. Resources

-   **Official Repo**: [anthropics/skills](https://github.com/anthropics/skills) - Reference implementations and examples.
-   **Documentation**:
    - [Extend Claude with skills](https://code.claude.com/docs/en/skills)
    - [Agent Skills Standard](https://agentskills.io) (if available)
-   **Community**:
    - `awesome-claude-skills` lists.

## 8. Integration with MCP (Model Context Protocol)

Skills can leverage MCP servers to access external data (databases, APIs) dynamically. While skills are filesystem-based, they can instruct Claude to use available MCP tools to fetch context before processing.

---

*Last Updated: 2026-03-05*
