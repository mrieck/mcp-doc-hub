# MCP Doc Hub - Up-to-date Technical Docs For Any Prompt

**Website:** [MCPDocHub.com](https://www.mcpdochub.com) 

### Stop Wasting Time with Outdated or Generic LLM Knowledge!

❌ **Without MCP Doc Hub:**
LLMs often rely on outdated training data or generic information about the libraries and technologies you use. This leads to:
*   Outdated code examples that don't work with current versions.
*   Hallucinated APIs and functions that don't even exist.
*   Generic answers that aren't specific to the package version you're using.

✅ **With MCP Doc Hub:**
MCP Doc Hub connects your AI agent to a powerful backend that pulls up-to-date, relevant documentation and code examples directly from authoritative sources. It places this crucial, current context directly into your LLM's prompt.

**Get better, more accurate code and technical answers, faster.**

1.  **Write your prompt** naturally in your MCP-enabled client.
2.  Optionally tell the agent to look up documentation
3.  Your agent gets **working code examples** and **accurate technical information**.

## Features

*   **Targeted Documentation Retrieval:** Fetch documentation specifically by library/technology name and topic.
*   **URL-Based Document Fetching:** Provide a direct URL to get specific documentation processed.
*   **Intelligent Web Search:** Leverages advanced search capabilities to find relevant documentation sources.
*   **Content Extraction & Ranking:** Intelligently extracts and ranks information from multiple domains to provide the most relevant context.
*   **Own MCP Server:** You are given a unique MCP server url which stores recent documents as part of a recent documents tool description.  

## 🛠️ Getting Started

### Requirements

*   An MCP Client (e.g., Cursor, Windsurf, Claude Desktop, VS Code with MCP extension, Zed)
*   An **MCP Doc Hub API Key** and **Server URL** (obtain these from your dashboard at [MCPDocHub.com](https://www.mcpdochub.com))

<!--
### Installing via Smithery
To install MCP Doc Hub Server for Claude Desktop automatically via Smithery:
```bash
npx -y @smithery/cli install @productivmark/mcp-doc-hub --client claude
```
You will likely need to configure environment variables as shown in other client examples.
-->
### Install in Cursor

Go to: Settings -> Cursor Settings -> MCP -> Add new global MCP server

Pasting the following configuration into your Cursor `~/.cursor/mcp.json` file is the recommended approach. You may also install in a specific project by creating `.cursor/mcp.json` in your project folder. See Cursor MCP docs for more info.

**Replace `YOUR_SERVER_URL` and `YOUR_API_KEY` with the values from your MCPDocHub.com dashboard.**

```json
{
  "mcpServers": {
    "mcp-doc-hub": {
      "command": "npx",
      "args": ["-y", "@productivmark/mcp-doc-hub@latest"],
      "env": {
        "SERVER_URL": "YOUR_SERVER_URL",
        "MCPDOCHUB_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Install in Windsurf
Add this to your Windsurf MCP config file. See Windsurf MCP docs for more info.

**Replace `YOUR_SERVER_URL` and `YOUR_API_KEY` with the values from your MCPDocHub.com dashboard.**

```json
{
  "mcpServers": {
    "mcp-doc-hub": {
      "command": "npx",
      "args": ["-y", "@productivmark/mcp-doc-hub@latest"],
      "env": {
        "SERVER_URL": "YOUR_SERVER_URL",
        "MCPDOCHUB_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Install in Zed
It can be installed via Zed Extensions or you can add this to your Zed `settings.json`. See Zed Context Server docs for more info.

**Replace `YOUR_SERVER_URL` and `YOUR_API_KEY` with the values from your MCPDocHub.com dashboard.**

```json
{
  "context_servers": {
    "MCPDocHub": {
      "command": {
        "path": "npx",
        "args": ["-y", "@productivmark/mcp-doc-hub@latest"],
        "env": {
          "SERVER_URL": "YOUR_SERVER_URL",
          "MCPDOCHUB_API_KEY": "YOUR_API_KEY"
        }
      },
      "settings": {}
    }
  }
}
```

### Install in Claude Code
Run this command. See Claude Code MCP docs for more info.

**Replace `YOUR_SERVER_URL` and `YOUR_API_KEY` with the values from your MCPDocHub.com dashboard.**

```bash
env SERVER_URL="YOUR_SERVER_URL" MCPDOCHUB_API_KEY="YOUR_API_KEY" claude mcp add mcp-doc-hub -- npx -y @productivmark/mcp-doc-hub@latest
```
Or, if `claude mcp add` supports environment variable configuration directly, it might look like the other JSON examples. Refer to Claude Code's specific MCP documentation.

### Install in Claude Desktop
Add this to your Claude Desktop `claude_desktop_config.json` file. See Claude Desktop MCP docs for more info.

**Replace `YOUR_SERVER_URL` and `YOUR_API_KEY` with the values from your MCPDocHub.com dashboard.**

```json
{
  "mcpServers": {
    "MCPDocHub": {
      "command": "npx",
      "args": ["-y", "@productivmark/mcp-doc-hub@latest"],
      "env": {
        "SERVER_URL": "YOUR_SERVER_URL",
        "MCPDOCHUB_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Install in Windows
The configuration on Windows is slightly different. Here's an example, assuming a client like Cline:

**Replace `YOUR_SERVER_URL` and `YOUR_API_KEY` with the values from your MCPDocHub.com dashboard.**
```json
{
  "mcpServers": {
    "mcp-doc-hub": {
      "command": "cmd",
      "args": [
        "/c",
        "set SERVER_URL=YOUR_SERVER_URL && set MCPDOCHUB_API_KEY=YOUR_API_KEY && npx -y @productivmark/mcp-doc-hub@latest"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Running with npx directly (for testing or custom setups)
You can also run the MCP Doc Hub relay directly from your terminal using `npx`, ensuring you provide the necessary environment variables:

**Replace `YOUR_SERVER_URL` and `YOUR_API_KEY` with the values from your MCPDocHub.com dashboard.**

For Linux/macOS:
```bash
env SERVER_URL="YOUR_SERVER_URL" MCPDOCHUB_API_KEY="YOUR_API_KEY" LOG_LEVEL="debug" npx -y @productivmark/mcp-doc-hub@latest
```

## Environment Variables

*   **`SERVER_URL` (Required):** The URL of the backend MCP Doc Hub server. You can find this in your dashboard at [MCPDocHub.com](https://www.mcpdochub.com).
*   **`MCPDOCHUB_API_KEY` (Required):** Your unique API key for accessing the MCP Doc Hub service. You can find this in your dashboard at [MCPDocHub.com](https://www.mcpdochub.com).

## Available Tools

Your MCP Doc Hub provides the following tools to your AI agent:

### `retrieve_technical_documentation`
Searches the web for technical documentation based on a name and topic. It assesses relevant URLs, attempts to understand site structure (e.g., sitemaps), and extracts information relevant to the topic.

*   **Parameters:**
    *   `documentName` (string, required): The title or identifier of the documentation (e.g., "React", "Django ORM", "AWS S3 SDK for Python").
    *   `documentTopic` (string, required): The specific topic, feature, or question you need information about (e.g., "useEffect hook", "QuerySet API", "uploading large files").

### `get_technical_documentation_by_url`
Fetches and processes documentation directly from a specific user-provided URL. This tool is best used when you have a precise link to the documentation page. It does not perform a general web crawl.

*   **Parameters:**
    *   `url` (string, required): The exact URL of the documentation page to retrieve (e.g., "https://react.dev/reference/react/useEffect", "https://docs.djangoproject.com/en/stable/topics/db/queries/").
