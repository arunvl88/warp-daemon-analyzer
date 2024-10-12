
# Cloudflare WARP Log Analyzer

A Cloudflare Worker that analyzes WARP log files using predefined error patterns and AI-generated insights.

## Setup

1. Install Wrangler CLI:

```

npm install -g wrangler

```

2. Authenticate with your Cloudflare account:

```

wrangler login

```

3. Create a new Cloudflare Worker project:

```

npm create cloudflare\@2.5.0 -- warp-log-analyzer
cd warp-log-analyzer

```

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

## Fine-tune the AI (@cf/mistral/mistral-7b-instruct-v0.2-lora):

- scrape Cloudflare warp dev docs and output a CSV
- Mistral expects CSV to be in this format: https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.1#instruction-format

```jsx
import requests
from bs4 import BeautifulSoup
import csv
from urllib.parse import urljoin
import time
import nltk
from nltk.tokenize import sent_tokenize

# Download necessary NLTK data
nltk.download('punkt')

BASE_URL = 'https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/'
OUTPUT_FILE = 'warp_documentation_dataset_mistral.csv'

def get_content(url):
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')
    # Adjust the selector based on the actual structure of the documentation pages
    content = soup.select_one('main article').get_text(strip=True)
    return content

def generate_qa_pairs(content):
    sentences = sent_tokenize(content)
    qa_pairs = []
    for i in range(0, len(sentences) - 1, 2):
        question = sentences[i]
        answer = sentences[i+1] if i+1 < len(sentences) else ''
        formatted_pair = f"<s>[INST] {question} [/INST] {answer}</s>"
        qa_pairs.append(formatted_pair)
    return qa_pairs

def crawl_warp_docs(start_url):
    visited = set()
    to_visit = [start_url]
    all_qa_pairs = []

    while to_visit:
        url = to_visit.pop(0)
        if url in visited:
            continue

        print(f"Processing: {url}")
        visited.add(url)

        try:
            response = requests.get(url)
            soup = BeautifulSoup(response.content, 'html.parser')

            content = get_content(url)
            qa_pairs = generate_qa_pairs(content)
            all_qa_pairs.extend(qa_pairs)

            # Find more links within the WARP documentation
            for link in soup.find_all('a', href=True):
                next_url = urljoin(url, link['href'])
                if next_url.startswith(BASE_URL):
                    to_visit.append(next_url)

        except Exception as e:
            print(f"Error processing {url}: {e}")

        time.sleep(1)  # Polite delay between requests

    return all_qa_pairs

def save_to_csv(qa_pairs, filename=OUTPUT_FILE):
    with open(filename, 'w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        writer.writerow(['text'])
        for pair in qa_pairs:
            writer.writerow([pair])

if __name__ == "__main__":
    qa_pairs = crawl_warp_docs(BASE_URL)
    save_to_csv(qa_pairs)
    print(f"Dataset saved to {OUTPUT_FILE}")
```

In the same directory where you have the script run the following commands:
* `python3 -m venv venv `
* `source venv/bin/activate`
* `pip install requests beautifulsoup4 nltk`
* `python3 scrape_warp_docs.py`


- Create CSV on the Warp daemon logs
- Merge all of the CSV to one
- Once the CSV is ready, follow the article below for fine-tuning:
https://developers.cloudflare.com/workers-ai/fine-tunes/loras/
- Multiple CSV's should be merged:

```
import pandas as pd

# Read both CSV files
warp_docs_df = pd.read_csv('warp_documentation_dataset_mistral.csv')
warp_logs_df = pd.read_csv('warp_logs_mistral.csv')

# Concatenate the dataframes
merged_df = pd.concat([warp_docs_df, warp_logs_df], ignore_index=True)

# Shuffle the merged dataframe to mix the entries
merged_df = merged_df.sample(frac=1).reset_index(drop=True)

# Save the merged and shuffled data to a new CSV
merged_df.to_csv('merged_warp_training_data.csv', index=False)
```

## AutoTrain LLM
[1]
In order to use this colab

upload train.csv to a folder named data/
train.csv must contain a text column
choose a project name if you wish
change model if you wish, you can use most of the text-generation models from Hugging Face Hub
add huggingface information (token) if you wish to push trained model to huggingface hub
update hyperparameters if you wish
click Runtime > Run all or run each cell individually
report issues / feature requests here: https://github.com/huggingface/autotrain-advanced/issues

- Prepare your LoRA adapter files:
You need two files:
    - `adapter_model.safetensors`: Contains the model weights.
    - `adapter_config.json`: Contains the configuration information.
- Edit the `adapter_config.json`:
Make sure to include the `model_type` field. For your case, using the Mistral model, it should look like this:
    
    ```
    Copy
    {
      "alpha_pattern": {},
      "auto_mapping": null,
      ...
      "target_modules": [
        "q_proj",
        "v_proj"
      ],
      "task_type": "CAUSAL_LM",
      "model_type": "mistral"
    }
    
    ```
    
- Create a new fine-tune and upload your adapter files:

- Uploading the fine tuned model to Cloudflare workers

```
npx wrangler ai finetune create @cf/mistral/mistral-7b-instruct-v0.2-lora warp-mistral /Users/arunlingamariyappa/Documents/test
```

- Verify the fine tune creation

```
npx wrangler ai finetune list
```

- Update your getAIInsights function to use the fine-tuned model

```
try {
    const response = await env.AI.run('@cf/mistralai/mistral-7b-instruct-v0.2-lora', {
      messages: messages,
      raw: true,// skip applying the default chat template
      lora: "your-finetune-name-or-id",// replace with your actual finetune name or ID
      max_tokens: 1000
    });
    return response.response;
  } catch (error) {
    console.error('Error getting AI insights:', error);
    return `Error getting AI insights: ${error.message}`;
  }
}
```

