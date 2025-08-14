"""
AI service management for Claude API interactions
"""

import hashlib
import logging
import os
import re
import requests
import time
from typing import List

logger = logging.getLogger(__name__)


class AIServiceManager:
    """Centralized AI service manager for all Claude API interactions"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        self.is_available = bool(self.api_key)
        
        # Rate limiting
        self.last_call_time = 0
        self.min_interval = 1.0  # Minimum 1 second between calls
        
        # Cache for AI responses
        self._response_cache = {}
        self.cache_ttl = 3600  # 1 hour cache TTL
        
        # Request statistics
        self.stats = {
            'total_calls': 0,
            'cache_hits': 0,
            'errors': 0,
            'total_tokens_used': 0
        }
        
        logger.info(f"AIServiceManager initialized - API available: {self.is_available}")
    
    def _get_cache_key(self, prompt: str, max_tokens: int, model: str) -> str:
        """Generate cache key for the request"""
        content = f"{prompt}{max_tokens}{model}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def _is_cache_valid(self, timestamp: float) -> bool:
        """Check if cached response is still valid"""
        return (time.time() - timestamp) < self.cache_ttl
    
    def _rate_limit(self):
        """Implement rate limiting between API calls"""
        current_time = time.time()
        time_since_last_call = current_time - self.last_call_time
        
        if time_since_last_call < self.min_interval:
            sleep_time = self.min_interval - time_since_last_call
            logger.debug(f"Rate limiting: sleeping for {sleep_time:.2f}s")
            time.sleep(sleep_time)
        
        self.last_call_time = time.time()
    
    def call_claude(self, prompt: str, max_tokens: int = 150, model: str = 'claude-3-haiku-20240307', use_cache: bool = True) -> str:
        """Make a call to Claude API with caching, rate limiting, and error handling"""
        if not self.is_available:
            raise ValueError("Claude API key not available")
        
        # Check cache first
        if use_cache:
            cache_key = self._get_cache_key(prompt, max_tokens, model)
            if cache_key in self._response_cache:
                cached_response, timestamp = self._response_cache[cache_key]
                if self._is_cache_valid(timestamp):
                    self.stats['cache_hits'] += 1
                    logger.debug("Using cached AI response")
                    return cached_response
                else:
                    # Remove expired cache entry
                    del self._response_cache[cache_key]
        
        # Apply rate limiting
        self._rate_limit()
        
        # Make API call
        try:
            self.stats['total_calls'] += 1
            response = self._make_api_request(prompt, max_tokens, model)
            
            # Cache the response
            if use_cache:
                self._response_cache[cache_key] = (response, time.time())
            
            # Estimate tokens used (rough approximation)
            self.stats['total_tokens_used'] += len(prompt.split()) + len(response.split())
            
            logger.debug(f"Claude API call successful - {len(response)} chars returned")
            return response
            
        except Exception as e:
            self.stats['errors'] += 1
            logger.error(f"Claude API call failed: {e}")
            raise
    
    def _make_api_request(self, prompt: str, max_tokens: int, model: str) -> str:
        """Make the actual API request to Claude"""
        headers = {
            'x-api-key': self.api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }
        
        data = {
            'model': model,
            'max_tokens': max_tokens,
            'messages': [
                {'role': 'user', 'content': prompt}
            ]
        }
        
        response = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers=headers,
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['content'][0]['text'].strip()
        elif response.status_code == 429:
            # Rate limited - wait and retry once
            logger.warning("API rate limited, waiting 5 seconds...")
            time.sleep(5)
            return self._make_api_request(prompt, max_tokens, model)
        else:
            raise Exception(f"Claude API error: {response.status_code} - {response.text}")
    
    def batch_categorize(self, articles_data: list, categories: dict) -> list:
        """Specialized method for batch article categorization"""
        if not self.is_available:
            logger.warning("AI not available for categorization")
            return []
        
        # Prepare category descriptions
        categories_desc = ""
        for category, info in categories.items():
            categories_desc += f"- {category}: {info['description']}\n"
        
        # Prepare articles text
        articles_text = ""
        for i, article in enumerate(articles_data):
            articles_text += f"""
{i+1}. Title: {article['title']}
   Source: {article['source']}  
   Description: {article['description'][:200]}...
"""
        
        prompt = f"""You are an expert tech content categorizer. Analyze each article and assign it to the MOST APPROPRIATE category from this list:

Available categories:
{categories_desc}

Articles to categorize:
{articles_text}

For each article, return ONLY the category name. If an article doesn't clearly fit any category, choose the closest match.

Format your response as:
1. category_name
2. category_name  
3. category_name
...and so on.

Your categorization:"""
        
        try:
            result = self.call_claude(prompt, max_tokens=200)
            return self._parse_categorization_result(result, categories)
        except Exception as e:
            logger.error(f"Batch categorization failed: {e}")
            return []
    
    def _parse_categorization_result(self, result: str, valid_categories: dict) -> list:
        """Parse AI categorization result"""
        categories = []
        lines = result.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Remove numbering (1., 2., etc.)
            category = re.sub(r'^\d+\.\s*', '', line).strip().lower()
            
            # Validate category
            if category in valid_categories:
                categories.append(category)
            else:
                # Try to match partial names
                for valid_cat in valid_categories.keys():
                    if valid_cat in category or category in valid_cat:
                        categories.append(valid_cat)
                        break
                else:
                    # Default fallback - use first category
                    default_cat = list(valid_categories.keys())[0]
                    categories.append(default_cat)
        
        return categories
    
    def batch_summarize(self, articles_data: list) -> list:
        """Specialized method for batch article summarization"""
        if not self.is_available:
            logger.warning("AI not available for summarization")
            return []
        
        # Prepare batch content
        articles_text = ""
        for i, article in enumerate(articles_data):
            articles_text += f"""
Article {i+1}:
Title: {article['title']}
Description: {article['description'][:300]}...
Category: {article['category']}

"""
        
        prompt = f"""Summarize each of these {len(articles_data)} tech articles in exactly 2-3 concise sentences. 
Focus on key technical points and implications for each.

{articles_text}

Provide summaries in this exact format:
1. [2-3 sentence summary for article 1]
2. [2-3 sentence summary for article 2]
3. [2-3 sentence summary for article 3]
...and so on.

Summaries:"""

        try:
            result = self.call_claude(prompt, max_tokens=len(articles_data) * 80)
            return self._parse_batch_summaries(result)
        except Exception as e:
            logger.error(f"Batch summarization failed: {e}")
            return []
    
    def _parse_batch_summaries(self, batch_response: str) -> list:
        """Parse batch summary response into individual summaries"""
        summaries = []
        lines = batch_response.strip().split('\n')
        
        current_summary = ""
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check if this is a numbered item (1., 2., etc.)
            if re.match(r'^\d+\.', line):
                if current_summary:
                    summaries.append(current_summary)
                # Remove the number prefix
                current_summary = re.sub(r'^\d+\.\s*', '', line)
            else:
                # Continue previous summary
                if current_summary:
                    current_summary += " " + line
        
        # Add the last summary
        if current_summary:
            summaries.append(current_summary)
        
        return summaries
    
    def get_stats(self) -> dict:
        """Get usage statistics"""
        return self.stats.copy()
    
    def clear_cache(self) -> None:
        """Clear the response cache"""
        self._response_cache.clear()
        logger.info("AI response cache cleared")