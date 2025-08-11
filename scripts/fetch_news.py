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
from datetime import datetime, timedelta
from pathlib import Path
import re
from typing import List, Dict, Optional
import time

# Configuration
RSS_FEEDS = {
    'cybersecurity': [
        {'url': 'https://www.cert.ssi.gouv.fr/feed/', 'source': 'CERT-FR', 'weight': 1.0},
        {'url': 'https://www.ssi.gouv.fr/feed/', 'source': 'ANSSI', 'weight': 1.0},
        {'url': 'https://www.cisa.gov/uscert/ncas/current-activity.xml', 'source': 'CISA', 'weight': 0.9},
        {'url': 'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml', 'source': 'NCSC UK', 'weight': 0.9},
        {'url': 'https://krebsonsecurity.com/feed/', 'source': 'Krebs on Security', 'weight': 0.8},
        {'url': 'https://www.schneier.com/blog/atom.xml', 'source': 'Schneier on Security', 'weight': 0.8},
        {'url': 'https://feeds.arstechnica.com/arstechnica/security', 'source': 'Ars Technica', 'weight': 0.7},
    ],
    'webdev': [
        {'url': 'https://web.dev/feed.xml', 'source': 'Web.dev', 'weight': 1.0},
        {'url': 'https://developer.mozilla.org/en-US/blog/rss.xml', 'source': 'MDN Blog', 'weight': 1.0},
        {'url': 'https://developer.chrome.com/feeds/blog.xml', 'source': 'Chrome Developers', 'weight': 0.9},
        {'url': 'https://webkit.org/feed/', 'source': 'WebKit Blog', 'weight': 0.9},
        {'url': 'https://www.smashingmagazine.com/feed', 'source': 'Smashing Magazine', 'weight': 0.8},
        {'url': 'https://css-tricks.com/feed/', 'source': 'CSS-Tricks', 'weight': 0.7},
        {'url': 'https://alistapart.com/main/feed/', 'source': 'A List Apart', 'weight': 0.7},
    ]
}

# Max articles per category per day
MAX_ARTICLES_PER_CATEGORY = 5
# Days to look back for articles
DAYS_LOOKBACK = 2

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
        
    def fetch_feeds(self) -> None:
        """Fetch all RSS feeds"""
        cutoff_date = datetime.now() - timedelta(days=DAYS_LOOKBACK)
        
        for category, feeds in RSS_FEEDS.items():
            print(f"Fetching {category} feeds...")
            for feed_info in feeds:
                try:
                    self._fetch_single_feed(feed_info, category, cutoff_date)
                    time.sleep(1)  # Rate limiting
                except Exception as e:
                    print(f"Error fetching {feed_info['source']}: {e}")
    
    def _fetch_single_feed(self, feed_info: Dict, category: str, cutoff_date: datetime) -> None:
        """Fetch a single RSS feed"""
        feed = feedparser.parse(feed_info['url'])
        
        for entry in feed.entries[:10]:  # Limit entries per feed
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
                
                # Check for duplicates
                if article.content_hash not in self.seen_hashes:
                    article.calculate_score(feed_info['weight'])
                    self.articles.append(article)
                    self.seen_hashes.add(article.content_hash)
                    
            except Exception as e:
                print(f"Error processing entry: {e}")
    
    def _parse_date(self, entry) -> Optional[datetime]:
        """Parse various date formats from RSS feeds"""
        date_fields = ['published_parsed', 'updated_parsed', 'created_parsed']
        
        for field in date_fields:
            if hasattr(entry, field) and getattr(entry, field):
                try:
                    return datetime(*getattr(entry, field)[:6])
                except:
                    continue
        return None
    
    def filter_and_rank(self) -> None:
        """Filter duplicates and rank articles by score"""
        # Remove similar titles (>80% similarity)
        self._remove_similar_articles()
        
        # Sort by score
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
        """Generate AI summaries for articles"""
        if not self.anthropic_api_key:
            print("Warning: ANTHROPIC_API_KEY not set. Using descriptions as summaries.")
            for article in self.articles:
                article.summary = self._clean_text(article.description)[:200] + "..."
            return
        
        for article in self.articles:
            try:
                summary = self._generate_summary_with_claude(article)
                article.summary = summary
                time.sleep(2)  # Rate limiting for API
            except Exception as e:
                print(f"Error generating summary for {article.title}: {e}")
                article.summary = self._clean_text(article.description)[:200] + "..."
    
    def _generate_summary_with_claude(self, article: NewsArticle) -> str:
        """Generate summary using Claude API"""
        headers = {
            'x-api-key': self.anthropic_api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }
        
        prompt = f"""Summarize this {article.category} article in 2-3 concise sentences. 
        Focus on the key technical points and implications.
        
        Title: {article.title}
        Description: {article.description[:500]}
        
        Write a clear, informative summary in English:"""
        
        data = {
            'model': 'claude-3-haiku-20240307',
            'max_tokens': 150,
            'messages': [
                {'role': 'user', 'content': prompt}
            ]
        }
        
        response = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers=headers,
            json=data
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['content'][0]['text'].strip()
        else:
            raise Exception(f"API error: {response.status_code}")
    
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
        """Save articles as YAML data file"""
        import yaml
        
        # Create data structure
        data = {
            'last_updated': datetime.now().isoformat(),
            'articles': []
        }
        
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
            data['articles'].append(article_data)
        
        # Save to _data/news.yml
        data_path = Path(__file__).parent.parent / '_data'
        data_path.mkdir(exist_ok=True)
        filepath = data_path / 'news.yml'
        
        with open(filepath, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
        
        print(f"Saved {len(self.articles)} articles to _data/news.yml")
    
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