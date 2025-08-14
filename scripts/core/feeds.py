"""
Feed management for RSS feeds fetching and caching
"""

import hashlib
import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import feedparser
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .models import NewsArticle

logger = logging.getLogger(__name__)


class FeedManager:
    """Manages RSS feed fetching, caching, and parsing"""
    
    def __init__(self, days_lookback: int = 2, max_entries_per_feed: int = 15):
        self.days_lookback = days_lookback
        self.max_entries_per_feed = max_entries_per_feed
        self.articles = []
        self.seen_hashes = set()
        
        # Setup HTTP session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Set User-Agent to be respectful
        self.session.headers.update({
            'User-Agent': 'Jekyll News Fetcher 1.0 (Tech Blog RSS Aggregator)'
        })
    
    def fetch_all_feeds(self, rss_feeds: Dict) -> List[NewsArticle]:
        """Fetch all RSS feeds and return articles"""
        self.articles = []
        self.seen_hashes = set()
        cutoff_date = datetime.now() - timedelta(days=self.days_lookback)
        
        for source_category, feeds in rss_feeds.items():
            logger.info(f"Fetching {source_category} feeds...")
            for feed_info in feeds:
                try:
                    self._fetch_single_feed(feed_info, cutoff_date)
                    time.sleep(1)  # Rate limiting
                except Exception as e:
                    logger.error(f"Error fetching {feed_info['source']}: {e}")
        
        return self.articles
    
    def _fetch_single_feed(self, feed_info: Dict, cutoff_date: datetime) -> None:
        """Fetch a single RSS feed with timeout, retry and caching"""
        try:
            # Check cache first
            cached_feed_data = self._get_cached_feed(feed_info['url'])
            if cached_feed_data:
                logger.debug(f"Using cached data for {feed_info['source']}")
                feed = self._create_feedparser_object(cached_feed_data)
            else:
                logger.debug(f"Fetching {feed_info['source']}...")
                
                # Fetch with timeout and retry
                response = self.session.get(
                    feed_info['url'], 
                    timeout=30,
                    allow_redirects=True
                )
                response.raise_for_status()
                
                # Parse the feed
                feed = feedparser.parse(response.content)
                
                # Cache the feed
                self._cache_feed(feed_info['url'], feed)
            
            if not feed.entries:
                logger.warning(f"No entries found in {feed_info['source']}")
                return
                
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout fetching {feed_info['source']} after 30 seconds")
            return
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error fetching {feed_info['source']}: {e}")
            return
        except Exception as e:
            logger.error(f"Unexpected error fetching {feed_info['source']}: {e}")
            return
        
        for entry in feed.entries[:self.max_entries_per_feed]:  # Limit entries per feed
            try:
                # Parse publication date
                published = self._parse_date(entry)
                if not published or published < cutoff_date:
                    continue
                
                # Extract article info
                title = entry.get('title', 'No title')
                url = entry.get('link', '')
                description = entry.get('summary', entry.get('description', ''))
                
                # Extract tags safely - handle both dict and object formats
                tags = []
                for tag in entry.get('tags', [])[:5]:
                    if hasattr(tag, 'term'):
                        tags.append(tag.term)
                    elif isinstance(tag, dict) and 'term' in tag:
                        tags.append(tag['term'])
                    elif isinstance(tag, str):
                        tags.append(tag)
                
                article = NewsArticle(
                    title=title,
                    url=url,
                    source=feed_info['source'],
                    category='uncategorized',  # Will be determined by AI later
                    published=published,
                    description=description,
                    tags=tags
                )
                
                # Check for exact duplicates first
                if article.content_hash in self.seen_hashes:
                    continue
                
                self.articles.append(article)
                self.seen_hashes.add(article.content_hash)
                    
            except Exception as e:
                logger.warning(f"Error processing entry: {e}")
    
    def _get_cached_feed(self, url: str) -> Optional[dict]:
        """Get cached feed if it exists and is fresh (< 1 hour old)"""
        cache_dir = Path(__file__).parent.parent / '.cache'
        url_hash = hashlib.md5(url.encode()).hexdigest()
        cache_file = cache_dir / f'feed_{url_hash}.json'
        
        if not cache_file.exists():
            return None
            
        try:
            # Check if cache is fresh (< 1 hour old)
            if (datetime.now() - datetime.fromtimestamp(cache_file.stat().st_mtime)).total_seconds() > 3600:
                cache_file.unlink()  # Remove stale cache
                return None
                
            # Load cached feed
            with open(cache_file, 'r', encoding='utf-8') as f:
                return json.load(f)
                
        except (json.JSONDecodeError, OSError, FileNotFoundError) as e:
            logger.debug(f"Cache read error for {url}: {e}")
            # Remove corrupted cache file
            try:
                cache_file.unlink()
            except FileNotFoundError:
                pass
            return None
    
    def _cache_feed(self, url: str, feed) -> None:
        """Cache feed data for future use"""
        import hashlib
        cache_dir = Path(__file__).parent.parent / '.cache'
        cache_dir.mkdir(exist_ok=True)
        
        url_hash = hashlib.md5(url.encode()).hexdigest()
        cache_file = cache_dir / f'feed_{url_hash}.json'
        
        try:
            # Convert feedparser object to JSON-serializable format
            feed_data = {
                'feed': dict(feed.feed) if hasattr(feed, 'feed') else {},
                'entries': []
            }
            
            # Convert entries to dictionaries
            for entry in feed.entries:
                entry_dict = dict(entry)
                # Convert time tuples to strings for JSON serialization
                for key, value in entry_dict.items():
                    if key.endswith('_parsed') and value:
                        try:
                            entry_dict[key] = list(value)
                        except (TypeError, ValueError):
                            entry_dict[key] = str(value)
                feed_data['entries'].append(entry_dict)
            
            # Save to cache
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(feed_data, f, ensure_ascii=False, indent=2)
                
            logger.debug(f"Cached feed data for {url}")
            
        except (OSError, TypeError, ValueError) as e:
            logger.debug(f"Cache write error for {url}: {e}")
    
    def _create_feedparser_object(self, cached_data: dict):
        """Create a feedparser-like object from cached JSON data"""
        class CachedFeed:
            def __init__(self, data):
                self.feed = data.get('feed', {})
                self.entries = []
                
                # Convert entries back to feedparser-like objects
                for entry_data in data.get('entries', []):
                    # Create a dictionary-based entry with get method
                    class CachedEntry(dict):
                        def __init__(self, data):
                            super().__init__(data)
                            # Add attributes for direct access
                            for key, value in data.items():
                                if key.endswith('_parsed') and isinstance(value, list) and len(value) >= 6:
                                    try:
                                        # Convert list back to time tuple
                                        setattr(self, key, tuple(value))
                                    except (TypeError, ValueError):
                                        setattr(self, key, None)
                                else:
                                    setattr(self, key, value)
                    
                    entry = CachedEntry(entry_data)
                    self.entries.append(entry)
        
        return CachedFeed(cached_data)
    
    def _parse_date(self, entry) -> Optional[datetime]:
        """Parse various date formats from RSS feeds"""
        date_fields = ['published_parsed', 'updated_parsed', 'created_parsed']
        
        for field in date_fields:
            if hasattr(entry, field) and getattr(entry, field):
                try:
                    return datetime(*getattr(entry, field)[:6])
                except (TypeError, ValueError, IndexError) as e:
                    logger.debug(f"Could not parse date from {field}: {e}")
                    continue
        return None