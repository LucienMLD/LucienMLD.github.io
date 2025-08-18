"""
Data storage and persistence for news articles
"""

import logging
import re
from datetime import datetime
from pathlib import Path
from typing import List

import yaml

from .models import NewsArticle

logger = logging.getLogger(__name__)


class DataStorage:
    """Handles article data storage and persistence"""
    
    def __init__(self, data_path: str = None):
        # Use project root _data directory, not scripts/_data
        self.data_path = Path(data_path) if data_path else Path(__file__).parent.parent.parent / '_data'
        self.data_path.mkdir(exist_ok=True)
        self.filepath = self.data_path / 'news.yml'
    
    def save_articles(self, articles: List[NewsArticle]) -> None:
        """Save articles as Jekyll data file"""
        logger.info(f"Saving {len(articles)} articles to {self.filepath}")
        self._save_as_data_file(articles)
    
    def _save_as_data_file(self, articles: List[NewsArticle]) -> None:
        """Save articles by appending new ones to existing data"""
        # Load existing articles if file exists
        existing_articles = []
        if self.filepath.exists():
            with open(self.filepath, 'r', encoding='utf-8') as f:
                existing_data = yaml.safe_load(f) or {}
                existing_articles = existing_data.get('articles', [])
        
        # Prepare new articles
        new_articles = []
        for article in articles:
            article_data = {
                'title': article.title,
                'url': article.url,
                'source': article.source,
                'category': article.category,
                'published': article.published.isoformat(),
                'summary': article.summary,
                'tags': article.tags[:5] if article.tags else [],
                'score': round(article.score, 3)
            }
            new_articles.append(article_data)
        
        # Filter out duplicates by URL
        existing_urls = {article['url'] for article in existing_articles}
        unique_new_articles = [article for article in new_articles 
                             if article['url'] not in existing_urls]
        
        # Combine and sort by date (newest first)
        all_articles = unique_new_articles + existing_articles
        all_articles.sort(key=lambda x: x['published'], reverse=True)
        
        # Save updated data
        data = {
            'last_updated': datetime.now().isoformat(),
            'total_articles': len(all_articles),
            'articles': all_articles
        }
        
        with open(self.filepath, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
        
        logger.info(f"Added {len(unique_new_articles)} new articles to {self.filepath.name}")
        logger.info(f"Total articles: {len(all_articles)} (skipped {len(new_articles) - len(unique_new_articles)} duplicates)")
    
    def load_articles(self) -> List[dict]:
        """Load existing articles from storage"""
        if not self.filepath.exists():
            return []
        
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}
                return data.get('articles', [])
        except Exception as e:
            logger.error(f"Error loading articles: {e}")
            return []
    
    def get_stats(self) -> dict:
        """Get statistics about stored articles"""
        articles = self.load_articles()
        
        if not articles:
            return {'total_articles': 0}
        
        stats = {
            'total_articles': len(articles),
            'by_category': {},
            'by_source': {},
            'latest_update': None,
            'oldest_article': None,
            'newest_article': None
        }
        
        dates = []
        for article in articles:
            # Count by category
            category = article.get('category', 'unknown')
            stats['by_category'][category] = stats['by_category'].get(category, 0) + 1
            
            # Count by source
            source = article.get('source', 'unknown')
            stats['by_source'][source] = stats['by_source'].get(source, 0) + 1
            
            # Track dates
            if article.get('published'):
                dates.append(article['published'])
        
        # Find oldest and newest articles
        if dates:
            dates.sort()
            stats['oldest_article'] = dates[0]
            stats['newest_article'] = dates[-1]
        
        # Get last update time
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}
                stats['latest_update'] = data.get('last_updated')
        except Exception:
            pass
        
        return stats
    
    def cleanup_old_articles(self, days_to_keep: int = 30) -> int:
        """Remove articles older than specified days"""
        articles = self.load_articles()
        
        if not articles:
            return 0
        
        from datetime import datetime, timedelta
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        cutoff_str = cutoff_date.isoformat()
        
        # Filter articles
        filtered_articles = []
        removed_count = 0
        
        for article in articles:
            if article.get('published', '') >= cutoff_str:
                filtered_articles.append(article)
            else:
                removed_count += 1
        
        if removed_count > 0:
            # Save filtered articles
            data = {
                'last_updated': datetime.now().isoformat(),
                'total_articles': len(filtered_articles),
                'articles': filtered_articles
            }
            
            with open(self.filepath, 'w', encoding='utf-8') as f:
                yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
            
            logger.info(f"Removed {removed_count} old articles (keeping {days_to_keep} days)")
        
        return removed_count
    
    def _slugify(self, text: str) -> str:
        """Convert text to URL-friendly slug"""
        text = text.lower()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[-\s]+', '-', text)
        return text.strip('-')