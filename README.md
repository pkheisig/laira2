# Literature AI Research Assistant

A powerful research assistant application that helps you analyze and search through academic literature using AI-powered embeddings and natural language processing.

## Features

- Document embedding and semantic search
- Support for multiple Google AI models (Gemini 2.0/2.5)
- Configurable chunking and embedding parameters
- User-friendly GUI interface
- Persistent database storage
- Customizable search settings
- Layout-aware chunking strategy for scientific papers: automatically detect and split into logical sections (e.g., Introduction, Results, Discussion, Methods) with context bridging and flexible heading patterns

## Prerequisites

- Python 3.8 or higher
- Google Cloud Platform account with Vertex AI enabled
- Google Cloud credentials (service account key)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/literature_ai.git
cd literature_ai
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up your Google Cloud credentials:
   - Place your service account key JSON file in the project root
   - Update the `.env` file with your project settings

## Configuration

1. Create a `.env` file in the project root with the following variables:
```
VERTEX_AI_PROJECT=your-project-id
VERTEX_AI_LOCATION=us-central1
VERTEX_EMBEDDING_MODEL=text-embedding-005
VERTEX_GENERATIVE_MODEL=gemini-2.0-flash
```

2. Configure application settings through the GUI:
   - Input directory for documents
   - Model selection
   - Generation parameters
   - Database settings

## Usage

1. Start the application:
```bash
python -m src.main_app
```

2. Use the GUI to:
   - Load and process documents
   - Perform semantic searches
   - Configure settings
   - View search results

## License

MIT License - see LICENSE file for details 