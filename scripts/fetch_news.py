#!/usr/bin/env python3
"""
News Fetcher for Jekyll Site
Fetches RSS feeds, scores articles, and generates summaries using Claude API
"""

import os
import sys
import logging
from pathlib import Path
from typing import Dict
import yaml

# Add core modules to path
sys.path.insert(0, str(Path(__file__).parent))

# Import modular components
from core.ai_service import AIServiceManager
from core.feeds import FeedManager
from core.processor import ArticleProcessor
from core.analyzer import ContentAnalyzer
from core.storage import DataStorage
from core.models import NewsArticle

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def load_rss_feeds() -> dict:
    """Load RSS feeds from configuration files"""
    feeds = {}
    feeds_dir = Path(__file__).parent / 'feeds'
    
    for config_file in feeds_dir.glob('*.yml'):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                category_feeds = yaml.safe_load(f)
                feeds.update(category_feeds)
        except Exception as e:
            logger.error(f"Error loading feed config {config_file}: {e}")
    
    return feeds

def load_categories_config() -> dict:
    """Load categories configuration from YAML file"""
    config_file = Path(__file__).parent / 'config' / 'categories.yml'
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
            return config
    except FileNotFoundError:
        logger.error(f"Categories config file not found: {config_file}")
        # Fallback to hardcoded config if file doesn't exist
        return get_fallback_categories_config()
    except Exception as e:
        logger.error(f"Error loading categories config: {e}")
        return get_fallback_categories_config()

def get_fallback_categories_config() -> dict:
    """Fallback configuration if YAML file is not available"""
    return {
        'categories': {
            'cybersecurity': {
                'description': 'Security vulnerabilities, breaches, malware, ransomware, privacy, compliance, security tools',
                'keywords': ['vulnerability', 'breach', 'attack', 'security', 'exploit', 'ransomware', 'malware', 'patch', 'zero-day', 'cve'],
                'priority': 'high',
                'max_articles': 5,
                'score_multiplier': 1.2
            },
            'ai': {
                'description': 'Artificial intelligence, machine learning, LLMs, neural networks, AI tools, research',
                'keywords': ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'gpt', 'llm', 'transformer', 'ai model', 'chatgpt', 'claude', 'gemini'],
                'priority': 'high',
                'max_articles': 5,
                'score_multiplier': 1.1
            },
            'webdev': {
                'description': 'Web development, frameworks, browsers, CSS, JavaScript, performance, accessibility',
                'keywords': ['javascript', 'css', 'html', 'react', 'vue', 'framework', 'performance', 'accessibility', 'api', 'browser'],
                'priority': 'medium',
                'max_articles': 5,
                'score_multiplier': 1.0
            }
        },
        'settings': {
            'default_max_articles': 5,
            'default_score_multiplier': 1.0,
            'default_category': 'webdev',
            'min_score_threshold': 0.3,
            'recent_article_boost': 0.1,
            'old_article_penalty': -0.05
        }
    }

# Configuration - Load RSS feeds and categories from configuration files
RSS_FEEDS = load_rss_feeds()
CATEGORIES_CONFIG = load_categories_config()

# Extract categories and settings from config
TARGET_CATEGORIES = CATEGORIES_CONFIG.get('categories', {})
CONFIG_SETTINGS = CATEGORIES_CONFIG.get('settings', {})

# Max articles per category per day (final output) - configurable
MAX_ARTICLES_PER_CATEGORY = CONFIG_SETTINGS.get('default_max_articles', 5)
# Days to look back for articles
DAYS_LOOKBACK = 2
# Max articles to fetch per feed (gives AI more choice)
MAX_ENTRIES_PER_FEED = 15


class NewsFetcher:
    """Refactored main news fetcher using modular architecture"""
    
    def __init__(self):
        logger.info("Initializing NewsFetcher with modular architecture...")
        
        # Core services
        self.ai_service = AIServiceManager()
        self.feed_manager = FeedManager(DAYS_LOOKBACK, MAX_ENTRIES_PER_FEED)
        self.processor = ArticleProcessor(self.ai_service, TARGET_CATEGORIES, CONFIG_SETTINGS)
        self.analyzer = ContentAnalyzer(self.ai_service)
        self.storage = DataStorage()
        
        # Articles list (for compatibility)
        self.articles = []
        
    def fetch_feeds(self) -> None:
        """Fetch all RSS feeds using modular FeedManager"""
        logger.info("Fetching RSS feeds...")
        self.articles = self.feed_manager.fetch_all_feeds(RSS_FEEDS)
        logger.info(f"Fetched {len(self.articles)} articles")
    
    def filter_and_rank(self) -> None:
        """Filter duplicates and use AI to select most important articles using modular ArticleProcessor"""
        logger.info("Processing and filtering articles...")
        self.articles = self.processor.process_articles(self.articles)
        logger.info(f"Selected {len(self.articles)} articles after processing")
    
    def generate_summaries(self) -> None:
        """Generate AI summaries for articles using modular ContentAnalyzer"""
        logger.info("Generating article summaries...")
        self.articles = self.analyzer.generate_summaries(self.articles)
        logger.info(f"Generated summaries for {len(self.articles)} articles")
    
    def save_articles(self) -> None:
        """Save articles using modular DataStorage"""
        logger.info("Saving articles...")
        self.storage.save_articles(self.articles)
        logger.info("Articles saved successfully")
    
    def run(self) -> None:
        """Complete news fetching pipeline"""
        logger.info("Starting news fetching pipeline...")
        
        try:
            # Step 1: Fetch feeds
            self.fetch_feeds()
            
            if not self.articles:
                logger.warning("No articles found. Exiting.")
                return
            
            # Step 2: Process, filter and rank articles
            self.filter_and_rank()
            
            if not self.articles:
                logger.warning("No articles selected after filtering. Exiting.")
                return
            
            # Step 3: Generate summaries
            self.generate_summaries()
            
            # Step 4: Save to file
            self.save_articles()
            
            # Print final stats
            self._print_final_stats()
            
        except Exception as e:
            logger.error(f"Error in news fetching pipeline: {e}")
            raise
    
    def _print_final_stats(self) -> None:
        """Print final statistics"""
        if not self.articles:
            logger.info("No articles to show stats for.")
            return
        
        # Count by category
        category_counts = {}
        for article in self.articles:
            category_counts[article.category] = category_counts.get(article.category, 0) + 1
        
        logger.info("=== Final Statistics ===")
        logger.info(f"Total articles selected: {len(self.articles)}")
        logger.info("Articles by category:")
        for category, count in category_counts.items():
            logger.info(f"  {category}: {count}")
        
        # AI service stats
        if hasattr(self.ai_service, 'stats'):
            stats = self.ai_service.stats
            logger.info(f"AI API calls: {stats['total_calls']} (cache hits: {stats['cache_hits']})")
            logger.info(f"Total tokens used: {stats['total_tokens_used']}")


def main():
    """Main function"""
    logger.info("News Fetcher starting...")
    
    # Check if feeds are configured
    if not RSS_FEEDS:
        logger.error("No RSS feeds configured. Please check feeds/*.yml files.")
        sys.exit(1)
    
    # Check if categories are configured
    if not TARGET_CATEGORIES:
        logger.error("No categories configured. Please check config/categories.yml file.")
        sys.exit(1)
    
    # Initialize and run news fetcher
    fetcher = NewsFetcher()
    fetcher.run()
    
    logger.info("News fetching complete!")


if __name__ == "__main__":
    main()