"""
Gemini Client Module for LAIRA.

Handles interactions with the Google Generative AI API.
"""

import logging
import google.generativeai as genai
import backoff

logger = logging.getLogger(__name__)

class GeminiClient:
    """Client for interacting with the Google Gemini models."""

    DEFAULT_MODEL_NAME = "gemini-1.5-flash-latest"
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_RETRY_DELAY = 2

    def __init__(self, api_key: str, model_name: str = None):
        """
        Initializes the Gemini client.

        Args:
            api_key: Your Google AI API key.
            model_name: The specific Gemini model to use (defaults to flash).
        """
        if not api_key:
            raise ValueError("Google AI API key is required.")
            
        try:
            genai.configure(api_key=api_key)
            # Use the provided model_name OR the user-specified default
            self.model_name = model_name or "gemini-2.0-flash" # Use the user-specified name here
            self.model = genai.GenerativeModel(self.model_name)
            self.last_error = None
            logger.info(f"GeminiClient initialized with model: {self.model_name}")
        except Exception as e:
             logger.error(f"Failed to configure Google Generative AI: {e}", exc_info=True)
             raise ConnectionError(f"Failed to initialize GeminiClient: {e}")

    @backoff.on_exception(
        backoff.expo,
        Exception, # Catch more specific API errors if possible later
        max_tries=DEFAULT_MAX_RETRIES,
        base=DEFAULT_RETRY_DELAY
    )
    def generate_response(self, prompt: str, temperature: float = None, top_p: float = None, max_output_tokens: int = None) -> str:
        """
        Generates a response from the Gemini model based on the prompt.

        Args:
            prompt: The input prompt for the model.

        Returns:
            The generated text response.
            
        Raises:
            Exception: If the API call fails after retries.
        """
        try:
            logger.info(f"Sending prompt to Gemini model ({self.model_name}). Prompt length: {len(prompt)}")
            # Pass generation parameters if provided
            gen_kwargs = {}
            if temperature is not None:
                gen_kwargs['temperature'] = temperature
            if top_p is not None:
                gen_kwargs['top_p'] = top_p
            if max_output_tokens is not None:
                gen_kwargs['max_output_tokens'] = max_output_tokens
            response = self.model.generate_content(prompt, **gen_kwargs)
            
            # Handle potential lack of response or safety blocks
            if not response.parts:
                 # Check for safety ratings / blocked prompt
                 if response.prompt_feedback and response.prompt_feedback.block_reason:
                      block_reason = response.prompt_feedback.block_reason
                      logger.error(f"Gemini API call blocked. Reason: {block_reason}")
                      self.last_error = f"Blocked by API safety settings: {block_reason}"
                      # Consider raising a specific exception or returning a specific error message
                      return f"Error: The prompt was blocked due to safety settings ({block_reason})."
                 else:
                      logger.error("Gemini API returned an empty response with no parts and no block reason.")
                      self.last_error = "Empty response from API"
                      return "Error: Received an empty response from the language model."
                      
            response_text = response.text
            logger.info(f"Received response from Gemini. Length: {len(response_text)}")
            self.last_error = None
            return response_text

        except Exception as e:
            self.last_error = f"Gemini API error: {repr(e)}"
            logger.error(f"Error generating response from Gemini: {repr(e)}", exc_info=True)
            # Re-raise the exception for backoff to handle retries
            raise 