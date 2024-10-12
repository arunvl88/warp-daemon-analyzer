
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


# Fine-Tuning Process Documentation

This document outlines the process used to fine-tune the Mistral 7B model for WARP log analysis.

## Key Technologies

Before diving into the process, let's briefly explain the key technologies used:

### AutoTrain Advanced

AutoTrain Advanced is a tool developed by Hugging Face that simplifies the process of fine-tuning large language models. It automates many of the complex steps involved in model training, making it accessible to users without extensive machine learning expertise.

### Google Colab

Google Colab (short for Colaboratory) is a free, cloud-based platform that allows you to write and execute Python code through the browser. It's particularly useful for machine learning projects as it provides free access to GPUs, making computationally intensive tasks like model training more feasible.

### Hugging Face

Hugging Face is a company that provides a platform for sharing, discovering, and collaborating on machine learning models, datasets, and applications. They offer a wide range of pre-trained models and tools for natural language processing tasks.

### Cloudflare Workers AI

Cloudflare Workers AI is a platform that allows developers to run machine learning models at the edge of the network, close to where users are located. It enables the integration of AI capabilities into Cloudflare Workers, which are serverless functions that run on Cloudflare's global network. Cloudflare workers is where I would use the 

## Prerequisites

- Google Colab account
- Hugging Face account
- `train.csv` file containing your training data

## Steps

### 1. Set Up Google Colab

1. Open a new Google Colab notebook.
2. Ensure you're using a GPU runtime for faster processing.

### 2. Install Required Libraries

Run the following commands in a Colab cell:

```python
python
Copy
!pip install --upgrade torch torchvision
!pip install --upgrade autotrain-advanced
!pip install -U autotrain-advanced

```

### 3. Set Up Hugging Face Token

1. Go to [Hugging Face Token Settings](https://huggingface.co/settings/tokens)
2. Create a new token with write permissions
3. In your Colab notebook, set the environment variable:

```python
python
Copy
import os
os.environ["HUGGING_FACE_HUB_TOKEN"] = "your_token_here"

```

Replace `your_token_here` with your actual Hugging Face token.

### 4. Configure the Fine-Tuning Process

Use the following configuration:

- Project Name: `finetune-mistral-warp`
- Base Model: `mistralai/mistral-7b-instruct-v0.2`
- Push to Hub: `True`
- HF Username: Your Hugging Face username

### 5. Prepare Training Data

Ensure your `train.csv` file is properly formatted and uploaded to your Colab environment.

### 6. Run Fine-Tuning

Execute the fine-tuning process using the autotrain-advanced library. The exact command will depend on your specific requirements and dataset.

### 7. Retrieve Fine-Tuned Model

After fine-tuning, you'll get two important files:

- `adapter_model.safetensors`: Contains the model weights
- `adapter_config.json`: Contains the configuration information

These files will be automatically pushed to your Hugging Face repository if you set `push_to_hub` to `True`.

### 8. Integrate with Cloudflare Workers AI

Follow the guide at [Cloudflare Workers AI LoRA Fine-tunes](https://developers.cloudflare.com/workers-ai/fine-tunes/loras/) to integrate your fine-tuned model with Cloudflare Workers AI.

Cloudflare Workers AI is a platform that enables running machine learning models at the edge of the network, close to where users are located. It integrates AI capabilities into Cloudflare Workers, which are serverless functions running on Cloudflare's global network. In this project, we utilize Cloudflare Workers AI for two crucial steps:

1. **Uploading Fine-Tuned Models**: After fine-tuning our model (based on Mistral 7B) using AutoTrain Advanced and Hugging Face, we upload the resulting fine-tuned model to Cloudflare Workers AI. This process makes our custom-trained model available for use within the Cloudflare ecosystem.
The process involves:
a. Preparing your LoRA adapter files:

b. Editing the `adapter_config.json`:
Ensure it includes the `model_type` field. For the Mistral model, it should look like this:

c. Creating a new fine-tune and uploading your adapter files:

d. Verifying the fine-tune creation:
    - `adapter_model.safetensors`: Contains the model weights.
    - `adapter_config.json`: Contains the configuration information.
	
- Editing the adapter_config.json. Ensure it includes the model_type field. For the Mistral model, it should look like this.

```json
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

- Upload fine-tune files adapter_model.safetensors and adapter_config.json to Cloudflare Workers:

`npx wrangler ai finetune create @cf/mistral/mistral-7b-instruct-v0.2-lora warp-mistral /<folder_path>/`

- Get the fine-tune ID

`npx wrangler ai finetune list`
  
    
2. **Running Inference**: We use Cloudflare Workers AI to run inference on our uploaded fine-tuned models. Specifically, we use it to analyze WARP logs in real-time. When a log is submitted to our application, the Cloudflare Worker calls upon our fine-tuned model to process the log data, extract insights, and generate analysis results.
To use the fine-tuned model for inference, update the `getAIInsights` function:
    
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
    
    ```
    

This setup allows us to leverage the power of edge computing for our WARP log analysis, ensuring fast response times and efficient processing of log data, regardless of the user's geographical location.

## Troubleshooting

If you encounter any issues during the fine-tuning process, refer to:

- [Autotrain Advanced Issues](https://github.com/huggingface/autotrain-advanced/issues)
- Hugging Face community forums

## Notes

- Ensure your Hugging Face token has the necessary permissions.
- The fine-tuning process can take several hours depending on your dataset size and the GPU you're using.
- Always monitor the Colab notebook to ensure it doesn't disconnect during the fine-tuning process.


## References

- [Cloudflare Workers AI LoRA Fine-tunes](https://developers.cloudflare.com/workers-ai/fine-tunes/loras/)
- [Hugging Face Token Settings](https://huggingface.co/settings/tokens)
- [Autotrain Advanced GitHub](https://github.com/huggingface/autotrain-advanced)
- [fine-tune-models-with-autotrain](https://developers.cloudflare.com/workers-ai/tutorials/fine-tune-models-with-autotrain)
