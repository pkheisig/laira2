# LAIRA — Literature AI Research Assistant

Flask web app to upload sources, embed them with a local vector store, and chat with context grounded in your documents using Google Gemini.

## Features

- Document embedding and semantic search
- Support for multiple Google AI models (Gemini 2.0/2.5)
- Configurable chunking and embedding parameters
- User-friendly GUI interface
- Persistent database storage
- Customizable search settings
- Layout-aware chunking strategy for scientific papers: automatically detect and split into logical sections (e.g., Introduction, Results, Discussion, Methods) with context bridging and flexible heading patterns

## Prerequisites

- Python 3.10+
- A Google AI API key (`GOOGLE_API_KEY`) for Gemini

## Installation

1. Clone the repository:
```bash
git clone <your fork or empty repo>
cd laira
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

4. Configure environment variables (create `.env`):
```
FLASK_SECRET_KEY=change-me
GOOGLE_API_KEY=your-google-ai-api-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id
```
These are used by the web app for chat/embedding and Google sign-in.
An example file is provided as `.env.example`.

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
python web_server.py
```

2. Open the printed URL (default 0.0.0.0:8000-8009 available port) and:
   - Load and process documents
   - Perform semantic searches
   - Configure settings
   - View search results

## License

MIT License - see `LICENSE`.