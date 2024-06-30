
# Cloudflare WARP Log Analyzer

A Cloudflare Worker that analyzes WARP log files using predefined error patterns and AI-generated insights.

## Setup

1. Install Wrangler CLI:

```

npm install -g wrangler

```
Copy

2. Authenticate with your Cloudflare account:

```

wrangler login

```
Copy

3. Create a new Cloudflare Worker project:

```

wrangler init warp-log-analyzer
cd warp-log-analyzer

```
Copy

4. Replace `src/index.js` with your WARP log analyzer code.

5. Configure `wrangler.toml`:
```toml
name = "warp-log-analyzer"
main = "src/index.js"
compatibility_date = "2023-01-01"

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "ERROR_PATTERNS"
id = "your-kv-namespace-id"

```

1. Create a KV namespace:

Update `wrangler.toml` with the returned namespace ID.
    
    ```
    Copy
    wrangler kv:namespace create "ERROR_PATTERNS"
    
    ```
    
2. Add error patterns to KV:
    
    ```
    Copy
    wrangler kv:key put --binding=ERROR_PATTERNS "Connection failed" "Indicates a network connectivity issue"
    wrangler kv:key put --binding=ERROR_PATTERNS "Authentication error" "Suggests invalid credentials or expired session"
    
    ```
    
3. Deploy the Worker:
    
    ```
    Copy
    wrangler deploy
    
    ```
    

## Code Overview

The Worker script performs the following main functions:

- `handleRequest`: Routes incoming HTTP requests.
- `handleFileUpload`: Processes uploaded log files.
- `analyzeWarpLog`: Analyzes logs using known patterns and AI.
- `getErrorPatterns`: Retrieves error patterns from KV storage.
- `getAIInsights`: Generates AI-based insights using Cloudflare's AI model.

The script serves an HTML interface for file uploads and displays analysis results in two sections: known issues and AI insights.

## Usage

1. Access the Worker's URL in a web browser.
2. Upload a WARP log file and optionally provide context.
3. Click "Analyze" to process the log.
4. View results in the "Known Issues" and "AI Insights" tabs.
