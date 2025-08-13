#!/usr/bin/env python3
"""
News Fetcher for Jekyll Site
Fetches RSS feeds, scores articles, and generates summaries using Claude API
"""

import os
import sys
import json
import hashlib
import feedparser
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import datetime, timedelta
from pathlib import Path
import re
from typing import List, Dict, Optional
import time
import logging
import yaml

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

# Configuration - Load RSS feeds from configuration files
RSS_FEEDS = load_rss_feeds()

# Max articles per category per day (final output)
MAX_ARTICLES_PER_CATEGORY = 5
# Days to look back for articles
DAYS_LOOKBACK = 2
# Max articles to fetch per feed (gives AI more choice)
MAX_ENTRIES_PER_FEED = 15

class NewsArticle:
    """Represents a news article"""
    
    def __init__(self, title: str, url: str, source: str, category: str, 
                 published: datetime, description: str = "", tags: List[str] = None):
        self.title = title
        self.url = url
        self.source = source
        self.category = category
        self.published = published
        self.description = description
        self.tags = tags or []
        self.summary = ""
        self.score = 0.0
        self.content_hash = self._generate_hash()
    
    def _generate_hash(self) -> str:
        """Generate a hash for duplicate detection"""
        content = f"{self.title}{self.url}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def is_similar_to(self, other_article, news_processor=None) -> bool:
        """Check if this article is similar to another (same topic)"""
        # Check for exact URL match first
        if self.url == other_article.url:
            return True
        
        # Use Claude for semantic similarity if available
        if news_processor and news_processor.anthropic_api_key:
            try:
                prompt = f"""Compare these two news articles and determine if they cover the same topic or event.

Article 1: "{self.title}"
Article 2: "{other_article.title}"

Respond with only "YES" if they cover the same topic/event (like the same security patch, same product release, same incident), or "NO" if they are different topics.

Examples:
- "Microsoft Patch Tuesday August 2025" vs "Microsoft fixes 107 vulnerabilities in August update" → YES
- "Chrome 116 released" vs "Firefox 117 released" → NO
- "New iPhone announced" vs "Apple announces new iPhone" → YES"""

                result = news_processor._call_claude_api(prompt, max_tokens=10)
                return result.strip().upper() == "YES"
                
            except Exception as e:
                logger.debug(f"Claude similarity check failed: {e}, falling back to keyword matching")
        
        # Fallback to keyword-based detection
        return self._is_similar_keyword_based(other_article)
    
    def _is_similar_keyword_based(self, other_article) -> bool:
        """Fallback keyword-based similarity detection"""
        # Quick checks for obvious similarities
        self_lower = self.title.lower()
        other_lower = other_article.title.lower()
        
        # Microsoft patch tuesday detection
        if (("microsoft" in self_lower and "microsoft" in other_lower) and
            (any(phrase in self_lower for phrase in ["patch tuesday", "patch", "vulnerability", "flaw"]) and
             any(phrase in other_lower for phrase in ["patch tuesday", "patch", "vulnerability", "flaw"]))):
            return True
        
        # Same company + similar security keywords
        companies = ["microsoft", "google", "apple", "adobe", "cisco", "vmware"]
        for company in companies:
            if (company in self_lower and company in other_lower and
                any(word in self_lower for word in ["vulnerability", "patch", "update", "fix"]) and
                any(word in other_lower for word in ["vulnerability", "patch", "update", "fix"])):
                return True
        
        return False
    
    def calculate_score(self, source_weight: float) -> float:
        """Calculate article score based on various factors"""
        # Freshness score (0-1, newer is better)
        age_hours = (datetime.now() - self.published).total_seconds() / 3600
        freshness_score = max(0, 1 - (age_hours / 48))  # 48 hours = score 0
        
        # Keyword relevance score (simplified)
        relevance_score = 0.5  # Base score
        important_keywords = {
            'cybersecurity': ['vulnerability', 'breach', 'attack', 'security', 'exploit', 
                             'ransomware', 'malware', 'patch', 'zero-day', 'cve'],
            'webdev': ['javascript', 'css', 'html', 'react', 'vue', 'framework', 
                      'performance', 'accessibility', 'api', 'browser']
        }
        
        keywords = important_keywords.get(self.category, [])
        title_lower = self.title.lower()
        for keyword in keywords:
            if keyword in title_lower:
                relevance_score += 0.1
        relevance_score = min(1.0, relevance_score)
        
        # Final score calculation
        self.score = (freshness_score * 0.3) + (source_weight * 0.3) + (relevance_score * 0.4)
        return self.score

class NewsFetcher:
    """Fetches and processes news from RSS feeds"""
    
    def __init__(self):
        self.articles = []
        self.seen_hashes = set()
        self.anthropic_api_key = os.environ.get('ANTHROPIC_API_KEY')
        
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
        
    def fetch_feeds(self) -> None:
        """Fetch all RSS feeds"""
        cutoff_date = datetime.now() - timedelta(days=DAYS_LOOKBACK)
        
        for category, feeds in RSS_FEEDS.items():
            logger.info(f"Fetching {category} feeds...")
            for feed_info in feeds:
                try:
                    self._fetch_single_feed(feed_info, category, cutoff_date)
                    time.sleep(1)  # Rate limiting
                except Exception as e:
                    logger.error(f"Error fetching {feed_info['source']}: {e}")
    
    def _fetch_single_feed(self, feed_info: Dict, category: str, cutoff_date: datetime) -> None:
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
        
        for entry in feed.entries[:MAX_ENTRIES_PER_FEED]:  # Limit entries per feed
            try:
                # Parse publication date
                published = self._parse_date(entry)
                if not published or published < cutoff_date:
                    continue
                
                # Extract article info
                title = entry.get('title', 'No title')
                url = entry.get('link', '')
                description = entry.get('summary', entry.get('description', ''))
                tags = [tag.term for tag in entry.get('tags', [])][:5]
                
                article = NewsArticle(
                    title=title,
                    url=url,
                    source=feed_info['source'],
                    category=category,
                    published=published,
                    description=description,
                    tags=tags
                )
                
                # Check for exact duplicates first
                if article.content_hash in self.seen_hashes:
                    continue
                
                # Check for similar articles (same topic)
                is_similar = False
                for existing_article in self.articles:
                    if article.is_similar_to(existing_article, self if self.anthropic_api_key else None):
                        is_similar = True
                        # Keep the one with higher score
                        article.calculate_score(feed_info['weight'])
                        if article.score > existing_article.score:
                            logger.info(f"Replacing similar article: '{existing_article.title}' with '{article.title}' (better score: {article.score:.2f} > {existing_article.score:.2f})")
                            self.articles.remove(existing_article)
                            self.seen_hashes.discard(existing_article.content_hash)
                        else:
                            logger.info(f"Skipping similar article: '{article.title}' (lower score: {article.score:.2f} <= {existing_article.score:.2f})")
                            break
                
                if not is_similar:
                    article.calculate_score(feed_info['weight'])
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
                    entry = type('Entry', (), entry_data)()
                    
                    # Convert time lists back to time tuples for parsed fields
                    for key, value in entry_data.items():
                        if key.endswith('_parsed') and isinstance(value, list) and len(value) >= 6:
                            try:
                                # Convert list back to time tuple
                                setattr(entry, key, tuple(value))
                            except (TypeError, ValueError):
                                setattr(entry, key, None)
                        else:
                            setattr(entry, key, value)
                    
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
    
    def filter_and_rank(self) -> None:
        """Filter duplicates and use AI to select most important articles"""
        # Remove similar titles (>80% similarity)
        self._remove_similar_articles()
        
        if not self.articles:
            return
            
        # Use AI to select the most important articles if API key is available
        if self.anthropic_api_key:
            logger.info("Using AI to select most important articles...")
            self.articles = self._ai_curate_articles()
        else:
            logger.info("No API key - using basic scoring...")
            # Fallback to basic scoring
            self.articles.sort(key=lambda x: x.score, reverse=True)
            
            # Keep top articles per category
            filtered = []
            category_counts = {'cybersecurity': 0, 'webdev': 0}
            
            for article in self.articles:
                if category_counts[article.category] < MAX_ARTICLES_PER_CATEGORY:
                    filtered.append(article)
                    category_counts[article.category] += 1
            
            self.articles = filtered
    
    def _remove_similar_articles(self) -> None:
        """Remove articles with similar titles"""
        unique_articles = []
        seen_titles = []
        
        for article in self.articles:
            is_duplicate = False
            for seen_title in seen_titles:
                if self._similarity(article.title, seen_title) > 0.8:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                unique_articles.append(article)
                seen_titles.append(article.title)
        
        self.articles = unique_articles
    
    def _similarity(self, s1: str, s2: str) -> float:
        """Simple similarity calculation between two strings"""
        s1_lower = s1.lower()
        s2_lower = s2.lower()
        
        if s1_lower == s2_lower:
            return 1.0
        
        # Simple word overlap
        words1 = set(s1_lower.split())
        words2 = set(s2_lower.split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union)
    
    def generate_summaries(self) -> None:
        """Generate AI summaries for articles with batch processing"""
        if not self.anthropic_api_key:
            logger.warning("ANTHROPIC_API_KEY not set. Using descriptions as summaries.")
            for article in self.articles:
                article.summary = self._clean_text(article.description)[:200] + "..."
            return
        
        try:
            # Batch process summaries to reduce API calls
            logger.info(f"Generating summaries for {len(self.articles)} articles...")
            self._generate_batch_summaries()
        except Exception as e:
            logger.error(f"Error in batch summary generation: {e}")
            # Fallback to individual processing
            logger.info("Falling back to individual summary generation...")
            self._generate_individual_summaries()
    
    def _generate_batch_summaries(self) -> None:
        """Generate summaries for multiple articles in one API call"""
        if not self.articles:
            return
            
        # Prepare batch content
        articles_text = ""
        for i, article in enumerate(self.articles):
            articles_text += f"""
Article {i+1}:
Title: {article.title}
Description: {article.description[:300]}...
Category: {article.category}

"""
        
        prompt = f"""Summarize each of these {len(self.articles)} tech articles in exactly 2-3 concise sentences. 
Focus on key technical points and implications for each.

{articles_text}

Provide summaries in this exact format:
1. [2-3 sentence summary for article 1]
2. [2-3 sentence summary for article 2]
3. [2-3 sentence summary for article 3]
...and so on.

Summaries:"""

        try:
            batch_response = self._call_claude_api(prompt, max_tokens=len(self.articles) * 80)
            summaries = self._parse_batch_summaries(batch_response)
            
            # Assign summaries to articles
            for i, article in enumerate(self.articles):
                if i < len(summaries) and summaries[i].strip():
                    article.summary = summaries[i].strip()
                else:
                    # Fallback for missing summaries
                    article.summary = self._clean_text(article.description)[:200] + "..."
                    
            logger.info(f"Generated {len(summaries)} summaries in batch")
            
        except Exception as e:
            logger.error(f"Batch summary generation failed: {e}")
            raise
    
    def _parse_batch_summaries(self, batch_response: str) -> List[str]:
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
    
    def _generate_individual_summaries(self) -> None:
        """Fallback: Generate summaries one by one"""
        for article in self.articles:
            try:
                summary = self._generate_summary_with_claude(article)
                article.summary = summary
                time.sleep(1)  # Rate limiting for API
            except Exception as e:
                logger.error(f"Error generating summary for {article.title}: {e}")
                article.summary = self._clean_text(article.description)[:200] + "..."
    
    def _ai_curate_articles(self) -> List[NewsArticle]:
        """Use Claude AI to select the most important articles"""
        try:
            # Group articles by category
            cybersecurity_articles = [a for a in self.articles if a.category == 'cybersecurity']
            webdev_articles = [a for a in self.articles if a.category == 'webdev']
            
            selected_articles = []
            
            # Select cybersecurity articles
            if cybersecurity_articles:
                cyber_selected = self._ai_select_category_articles(
                    cybersecurity_articles, 'cybersecurity', MAX_ARTICLES_PER_CATEGORY
                )
                selected_articles.extend(cyber_selected)
            
            # Select web development articles
            if webdev_articles:
                webdev_selected = self._ai_select_category_articles(
                    webdev_articles, 'webdev', MAX_ARTICLES_PER_CATEGORY
                )
                selected_articles.extend(webdev_selected)
            
            return selected_articles
            
        except Exception as e:
            print(f"Error in AI curation: {e}")
            print("Falling back to basic scoring...")
            # Fallback to basic scoring
            self.articles.sort(key=lambda x: x.score, reverse=True)
            return self.articles[:MAX_ARTICLES_PER_CATEGORY * 2]
    
    def _ai_select_category_articles(self, articles: List[NewsArticle], category: str, max_count: int) -> List[NewsArticle]:
        """Use AI to select the most important articles from a category"""
        if not articles:
            return []
            
        # Prepare articles for AI analysis
        articles_text = ""
        for i, article in enumerate(articles):
            articles_text += f"""
{i+1}. Title: {article.title}
   Source: {article.source}
   Published: {article.published.strftime('%Y-%m-%d %H:%M')}
   Description: {article.description[:200]}...
   Tags: {', '.join(article.tags[:3])}
   
"""
        
        # Create AI prompt for selection
        category_context = {
            'cybersecurity': """
Prioritize articles that are:
- Critical security vulnerabilities or breaches
- Major security tool releases or updates
- Important security research or findings
- Regulatory changes or compliance updates
- High-impact security incidents
- Zero-day discoveries or patches""",
            'webdev': """
Prioritize articles that are:
- Major framework releases or updates (React, Vue, Angular, etc.)
- Important browser updates or new web standards
- Significant development tool releases
- Performance optimization techniques
- New web APIs or features
- Industry-changing development practices"""
        }
        
        prompt = f"""You are an expert tech curator specializing in {category}. 
From the following {len(articles)} articles, select the {max_count} MOST IMPORTANT and RELEVANT ones for professional developers.

{category_context.get(category, '')}

Articles to choose from:
{articles_text}

Consider these factors:
1. **Impact**: How significant is this for the developer community?
2. **Urgency**: Is this breaking news or time-sensitive information?
3. **Quality**: Is the source reputable and the information valuable?
4. **Relevance**: How useful is this for practicing developers?
5. **Novelty**: Is this genuinely newsworthy or just routine updates?

Return ONLY the numbers (1-{len(articles)}) of the {max_count} most important articles, separated by commas.
Example response: 2,5,7,12,15

Your selection:"""
        
        try:
            selected_indices = self._call_claude_api(prompt, max_tokens=100)
            
            # Parse the response to get article indices
            indices = []
            for num_str in selected_indices.replace(' ', '').split(','):
                try:
                    idx = int(num_str.strip()) - 1  # Convert to 0-based index
                    if 0 <= idx < len(articles):
                        indices.append(idx)
                except ValueError:
                    continue
            
            # Return selected articles
            selected = [articles[i] for i in indices[:max_count]]
            print(f"AI selected {len(selected)} {category} articles from {len(articles)} candidates")
            return selected
            
        except Exception as e:
            print(f"Error in AI selection for {category}: {e}")
            # Fallback to top scored articles
            articles.sort(key=lambda x: x.score, reverse=True)
            return articles[:max_count]
    
    def _call_claude_api(self, prompt: str, max_tokens: int = 150) -> str:
        """Make API call to Claude"""
        headers = {
            'x-api-key': self.anthropic_api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }
        
        data = {
            'model': 'claude-3-haiku-20240307',
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
        else:
            raise Exception(f"API error: {response.status_code} - {response.text}")
    
    def _generate_summary_with_claude(self, article: NewsArticle) -> str:
        """Generate summary using Claude API"""
        prompt = f"""Summarize this {article.category} article in 2-3 concise sentences. 
        Focus on the key technical points and implications.
        
        Title: {article.title}
        Description: {article.description[:500]}
        
        Write a clear, informative summary in English:"""
        
        return self._call_claude_api(prompt, max_tokens=150)
    
    def _clean_text(self, text: str) -> str:
        """Clean HTML and extra whitespace from text"""
        # Remove HTML tags
        text = re.sub('<[^<]+?>', '', text)
        # Remove extra whitespace
        text = ' '.join(text.split())
        return text
    
    def save_articles(self) -> None:
        """Save articles as Jekyll data file"""
        # Save as YAML data file instead of individual markdown files
        self._save_as_data_file()
    
    def _save_as_data_file(self) -> None:
        """Save articles by appending new ones to existing data"""
        import yaml
        
        data_path = Path(__file__).parent.parent / '_data'
        data_path.mkdir(exist_ok=True)
        filepath = data_path / 'news.yml'
        
        # Load existing articles if file exists
        existing_articles = []
        if filepath.exists():
            with open(filepath, 'r', encoding='utf-8') as f:
                existing_data = yaml.safe_load(f) or {}
                existing_articles = existing_data.get('articles', [])
        
        # Prepare new articles
        new_articles = []
        for article in self.articles:
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
        
        with open(filepath, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
        
        print(f"Added {len(unique_new_articles)} new articles to _data/news.yml")
        print(f"Total articles: {len(all_articles)} (skipped {len(new_articles) - len(unique_new_articles)} duplicates)")
    
    def _slugify(self, text: str) -> str:
        """Convert text to URL-friendly slug"""
        text = text.lower()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[-\s]+', '-', text)
        return text.strip('-')

def main():
    """Main execution"""
    print("Starting news fetch process...")
    
    fetcher = NewsFetcher()
    
    # Fetch all feeds
    fetcher.fetch_feeds()
    print(f"Fetched {len(fetcher.articles)} articles")
    
    # Filter and rank
    fetcher.filter_and_rank()
    print(f"Filtered to {len(fetcher.articles)} articles")
    
    # Generate summaries
    fetcher.generate_summaries()
    
    # Save articles
    fetcher.save_articles()
    
    print("News fetch complete!")
    
    # Print summary
    categories = {}
    for article in fetcher.articles:
        if article.category not in categories:
            categories[article.category] = []
        categories[article.category].append(article.title)
    
    for category, titles in categories.items():
        print(f"\n{category.upper()} ({len(titles)} articles):")
        for title in titles[:3]:
            print(f"  - {title[:80]}...")

if __name__ == "__main__":
    main()