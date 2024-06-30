// Cloudflare Worker script

export default {
	async fetch(request, env) {
	  return await handleRequest(request, env);
	}
  };
  
  async function handleRequest(request, env) {
	const url = new URL(request.url);
	if (request.method === 'POST' && url.pathname === '/analyze') {
	  return await handleFileUpload(request, env);
	}
	return new Response(INDEX_HTML, {
	  headers: { 'Content-Type': 'text/html' },
	});
  }
  
  async function handleFileUpload(request, env) {
	try {
	  const formData = await request.formData();
	  const file = formData.get('file');
	  const userContext = formData.get('userContext');
	  if (!file) {
		return new Response('No file uploaded', { status: 400 });
	  }
	  
	  const logContent = await file.text();
	  const analysis = await analyzeWarpLog(logContent, userContext, env);
	  
	  return new Response(analysis, {
		headers: { 'Content-Type': 'text/plain' },
	  });
	} catch (error) {
	  return new Response(`Error processing file: ${error.message}`, { status: 500 });
	}
  }
  
  async function analyzeWarpLog(logContent, userContext, env) {
	let result = "# WARP Log Analysis\n\n";
	const lines = logContent.split('\n');
	
	// Fetch all error patterns once
	const errorPatterns = await getErrorPatterns(env);
	
	result += "## Interpretations from Known Patterns\n\n";
	
	// Object to store the latest occurrence of each error pattern
	const latestErrors = {};
  
	for (const line of lines) {
	  for (const [pattern, interpretation] of Object.entries(errorPatterns)) {
		if (line.includes(pattern)) {
		  latestErrors[pattern] = { line, interpretation };
		  break;  // Break after first match to avoid multiple interpretations per line
		}
	  }
	}
  
	// Add the latest occurrence of each error pattern to the result
	for (const { line, interpretation } of Object.values(latestErrors)) {
	  result += `Log: ${line.trim()}\n`;
	  result += `Interpretation: ${interpretation}\n\n`;
	}
  
	// Get AI insights, passing the already fetched errorPatterns
	result += "## Insights from AI\n\n";
	const aiInsights = await getAIInsights(logContent, userContext, errorPatterns, env);
	result += aiInsights;
  
	return result;
  }
  
  async function getErrorPatterns(env) {
	const { keys } = await env.ERROR_PATTERNS.list();
	const patterns = {};
	for (const { name } of keys) {
	  patterns[name] = await env.ERROR_PATTERNS.get(name);
	}
	return patterns;
  }
  
  function interpretError(logLine, errorPatterns) {
	for (const [pattern, interpretation] of Object.entries(errorPatterns)) {
	  if (logLine.includes(pattern)) {
		return interpretation;
	  }
	}
	return null;
  }
  
  async function getAIInsights(logContent, userContext, errorPatterns, env) {
	const trimmedLogContent = logContent.slice(0, 3000);
  
	const predefinedContext = `
  WARP client functionality:
  1. Device Control: Granular control over device access to applications.
  2. Traffic Forwarding: Sends DNS and network traffic to Cloudflare for Zero Trust policy application.
  3. Connections:
	 a) Device orchestration (HTTPS): User registration, device posture, profile settings.
	 b) DoH (HTTPS): DNS requests to Gateway for policy enforcement.
	 c) WARP tunnel (UDP via WireGuard/MASQUE): IP packets for network/HTTP policy and private network access.
  4. Split Tunnel: Determines traffic sent through WARP tunnel.
  5. Local Domain Fallback: Configures DNS request handling.
  6. DNS Handling:
	 - Creates local DNS proxy (127.0.2.2, 127.0.2.3 for IPv4).
	 - Configures OS to use this proxy for all DNS requests.
	 - Forwards requests to Gateway or private DNS based on configuration.
  7. IP Traffic Management:
	 - Creates virtual network interface for WARP tunnel.
	 - Modifies OS routing table for Split Tunnel rules.
	 - Adjusts OS firewall to enforce Split Tunnel rules.
  8. Routing: Default routes all traffic through WARP except for Split Tunnel exclude list.
  
  Key components to check in logs:
  - DNS resolution issues
  - Tunnel connection problems
  - Split Tunnel configuration errors
  - Firewall rule conflicts
  - Device registration or posture check failures
  - Gateway policy enforcement issues
  
  WARP operational stages and key log indicators:
  - WARP is toggled on: Identified by log lines containing "INFO main_loop: warp::warp::tunnel: Initiate WARP connection protocol=Wireguard"
  - WARP is connecting to the Cloudflare edge: Identified by log lines containing "Attempting Happy Eyeballs"
  - WARP is creating the interface: Identified by log lines containing "Creating Network Service"
  - WARP is adding routes: Identified by log lines containing "network_change: Routes changed"
  - WARP is adding stub resolvers (DNS proxy): Identified by log lines "Initiate DNS connection" AND "Binding UDP and TCP sockets dns_servers=[127.0.2.2, 127.0.2.3]"
  - WARP performs connectivity check outside the tunnel: Identified by log lines containing "engage.cloudflareclient.com"
  - WARP performs connectivity check inside the tunnel: Identified by log lines containing "connectivity.cloudflareclient.com"
  - WARP successfully connects: Identified by log lines "Sending IPC status update: Connected" AND "Ipc Broadcast ResponseStatus: Connected"`;
  
	const errorPatternsContext = Object.entries(errorPatterns).length > 0 
	  ? `\n\nKnown error patterns and interpretations:\n${Object.entries(errorPatterns).map(([pattern, interpretation]) => 
		  `- ${pattern}: ${interpretation}`
		).join('\n')}`
	  : '\n\nNo known error patterns available.';
  
	const combinedContext = predefinedContext + errorPatternsContext;
  
	const messages = [
	  {
		role: "system",
		content: "You are an AI assistant specializing in WARP log analysis. Use this context:\n\n" + combinedContext
	  },
	  {
		role: "user",
		content: `Analyze this WARP log content:
  
  ${trimmedLogContent}
  
  ${userContext ? `User-reported issue: ${userContext}` : 'No user-reported issues.'}
  
  Provide:
  1. List of significant issues or errors related to WARP's core functions. Explain their impact.
  2. Analysis of how the log relates to any user-reported issues, including potential root causes.
  3. Specific troubleshooting recommendations.
  4. Identify any known error patterns from the provided context and their interpretations.
  
  Use markdown formatting for clarity.`
	  }
	];
  
	try {
	  const response = await env.AI.run('@cf/mistral/mistral-7b-instruct-v0.2-lora', {
		messages: messages,
		max_tokens: 1000
	  });
	  return response.response;
	} catch (error) {
	  console.error('Error getting AI insights:', error);
	  return `Error getting AI insights: ${error.message}`;
	}
  }
  
  
  const INDEX_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WARP Log Analyzer</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1, h2 { border-bottom: 1px solid #ccc; padding-bottom: 10px; }
        #uploadForm { margin-bottom: 20px; }
        #result, #aiInsights { white-space: pre-wrap; margin-top: 20px; }
        #aiInsights { background-color: #f0f0f0; padding: 15px; border-radius: 5px; }
        #userContext { width: 100%; height: 100px; margin-top: 10px; }
        #progressBar { width: 100%; height: 20px; background-color: #f0f0f0; margin-top: 10px; display: none; }
        #progressBarFill { width: 0%; height: 100%; background-color: #4CAF50; transition: width 0.5s; }
        .tab { overflow: hidden; border: 1px solid #ccc; background-color: #f1f1f1; }
        .tab button { background-color: inherit; float: left; border: none; outline: none; cursor: pointer; padding: 14px 16px; transition: 0.3s; }
        .tab button:hover { background-color: #ddd; }
        .tab button.active { background-color: #ccc; }
        .tabcontent { display: none; padding: 6px 12px; border: 1px solid #ccc; border-top: none; }
    </style>
</head>
<body>
    <h1>WARP Log Analyzer</h1>
    <form id="uploadForm">
        <input type="file" id="warpDiag" name="file" accept=".log">
        <textarea id="userContext" placeholder="context: Describe the issue for better AI response (e.g., 'Connection drops frequently when switching networks')"></textarea>
        <button type="submit">Analyze</button>
    </form>
    <div id="progressBar">
        <div id="progressBarFill"></div>
    </div>

    <div class="tab">
        <button class="tablinks" onclick="openTab(event, 'KnownIssues')" id="defaultOpen">Known Issues and Interpretations</button>
        <button class="tablinks" onclick="openTab(event, 'AIInsights')">Insights from AI</button>
    </div>

    <div id="KnownIssues" class="tabcontent">
        <h2>Interpretations from Known Patterns</h2>
        <div id="result"></div>
    </div>

    <div id="AIInsights" class="tabcontent">
        <h2>Insights from AI</h2>
        <div id="aiInsights"></div>
    </div>

    <script>
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append('file', document.getElementById('warpDiag').files[0]);
            formData.append('userContext', document.getElementById('userContext').value);

            document.getElementById('result').textContent = 'Analyzing...';
            document.getElementById('aiInsights').textContent = 'Generating AI insights...';
            
            const progressBar = document.getElementById('progressBar');
            const progressBarFill = document.getElementById('progressBarFill');
            progressBar.style.display = 'block';
            
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += 1;
                if (progress > 100) progress = 0;
                progressBarFill.style.width = progress + '%';
            }, 100);

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

                const response = await fetch('/analyze', { 
                    method: 'POST', 
                    body: formData,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                clearInterval(progressInterval);
                progressBar.style.display = 'none';

                const result = await response.text();
                if (!response.ok) throw new Error(result || \`HTTP error! status: \${response.status}\`);
                
                const [kvInterpretations, aiInsights] = result.split('## Insights from AI');
                
                document.getElementById('result').textContent = kvInterpretations.replace('## Interpretations from Known Patterns\\n\\n', '');
                document.getElementById('aiInsights').innerHTML = marked.parse(aiInsights || 'No AI insights available.');
            } catch (error) {
                console.error('Error:', error);
                document.getElementById('result').textContent = \`Error: \${error.message}\`;
                document.getElementById('aiInsights').textContent = 'AI insights not available due to an error.';
                clearInterval(progressInterval);
                progressBar.style.display = 'none';
            }
        });

        function openTab(evt, tabName) {
            var i, tabcontent, tablinks;
            tabcontent = document.getElementsByClassName("tabcontent");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].style.display = "none";
            }
            tablinks = document.getElementsByClassName("tablinks");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].className = tablinks[i].className.replace(" active", "");
            }
            document.getElementById(tabName).style.display = "block";
            evt.currentTarget.className += " active";
        }

        // Open the default tab
        document.getElementById("defaultOpen").click();
    </script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</body>
</html>
`;