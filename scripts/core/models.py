"""
Core models for the news fetcher system
"""

import hashlib
import logging
from datetime import datetime
from typing import List

logger = logging.getLogger(__name__)


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
        if news_processor and news_processor.ai_service.is_available:
            try:
                prompt = f"""Compare these two news articles and determine if they cover the same topic or event.

Article 1: "{self.title}"
Article 2: "{other_article.title}"

Respond with only "YES" if they cover the same topic/event (like the same security patch, same product release, same incident), or "NO" if they are different topics.

Examples:
- "Microsoft Patch Tuesday August 2025" vs "Microsoft fixes 107 vulnerabilities in August update" → YES
- "Chrome 116 released" vs "Firefox 117 released" → NO
- "New iPhone announced" vs "Apple announces new iPhone" → YES"""

                result = news_processor.ai_service.call_claude(prompt, max_tokens=10)
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
    
    def calculate_score(self, source_weight: float, target_categories: dict = None, config_settings: dict = None) -> float:
        """Calculate article score based on various factors"""
        # Freshness score (0-1, newer is better)
        age_hours = (datetime.now() - self.published).total_seconds() / 3600
        freshness_score = max(0, 1 - (age_hours / 48))  # 48 hours = score 0
        
        # Keyword relevance score (simplified)
        relevance_score = 0.5  # Base score
        
        # Use TARGET_CATEGORIES for keyword matching
        if target_categories and self.category in target_categories:
            keywords = target_categories[self.category]['keywords']
            title_lower = self.title.lower()
            description_lower = self.description.lower()
            combined_text = f"{title_lower} {description_lower}"
            
            for keyword in keywords:
                if keyword in combined_text:
                    relevance_score += 0.1
        
        relevance_score = min(1.0, relevance_score)
        
        # Final score calculation with category multiplier
        base_score = (freshness_score * 0.3) + (source_weight * 0.3) + (relevance_score * 0.4)
        
        # Apply category-specific score multiplier
        if target_categories and self.category in target_categories:
            score_multiplier = target_categories[self.category].get('score_multiplier', 1.0)
            base_score *= score_multiplier
        
        # Apply time-based bonuses/penalties from config
        if config_settings:
            if age_hours < 6:  # Recent article boost
                base_score += config_settings.get('recent_article_boost', 0)
            elif age_hours > 24:  # Old article penalty  
                base_score += config_settings.get('old_article_penalty', 0)
        
        self.score = max(0, base_score)  # Ensure score is not negative
        return self.score