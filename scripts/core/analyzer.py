"""
Content analysis for article summarization and content processing
"""

import logging
import re
from typing import List

from .models import NewsArticle

logger = logging.getLogger(__name__)


class ContentAnalyzer:
    """Handles content analysis, summarization, and text processing"""
    
    def __init__(self, ai_service):
        self.ai_service = ai_service
    
    def generate_summaries(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Generate AI summaries for articles with batch processing"""
        if not articles:
            return articles
        
        if not self.ai_service.is_available:
            logger.warning("AI service not available. Using descriptions as summaries.")
            for article in articles:
                article.summary = self.clean_text(article.description)[:200] + "..."
            return articles
        
        try:
            # Batch process summaries to reduce API calls
            logger.info(f"Generating summaries for {len(articles)} articles...")
            self._generate_batch_summaries(articles)
        except Exception as e:
            logger.error(f"Error in batch summary generation: {e}")
            # Fallback to descriptions
            for article in articles:
                article.summary = self.clean_text(article.description)[:200] + "..."
        
        return articles
    
    def _generate_batch_summaries(self, articles: List[NewsArticle]) -> None:
        """Generate summaries for multiple articles in one API call"""
        if not articles:
            return
        
        # Prepare article data for AI service
        articles_data = []
        for article in articles:
            articles_data.append({
                'title': article.title,
                'description': article.description,
                'category': article.category
            })
        
        try:
            summaries = self.ai_service.batch_summarize(articles_data)
            
            # Assign summaries to articles
            for i, article in enumerate(articles):
                if i < len(summaries) and summaries[i].strip():
                    article.summary = summaries[i].strip()
                else:
                    # Fallback for missing summaries
                    article.summary = self.clean_text(article.description)[:200] + "..."
                    
            logger.info(f"Generated {len(summaries)} summaries in batch")
            
        except Exception as e:
            logger.error(f"Batch summary generation failed: {e}")
            raise
    
    def clean_text(self, text: str) -> str:
        """Clean HTML and extra whitespace from text"""
        if not text:
            return ""
        
        # Remove HTML tags
        text = re.sub('<[^<]+?>', '', text)
        # Remove extra whitespace
        text = ' '.join(text.split())
        return text
    
    def extract_keywords(self, articles: List[NewsArticle]) -> dict:
        """Extract common keywords from articles by category"""
        keywords_by_category = {}
        
        for article in articles:
            if article.category not in keywords_by_category:
                keywords_by_category[article.category] = []
            
            # Simple keyword extraction from title and description
            text = f"{article.title} {article.description}".lower()
            words = re.findall(r'\b[a-zA-Z]{4,}\b', text)  # Words with 4+ characters
            
            # Filter out common words
            stop_words = {
                'this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 
                'were', 'said', 'each', 'which', 'their', 'time', 'about', 'would',
                'there', 'could', 'other', 'more', 'very', 'what', 'know', 'just',
                'first', 'into', 'over', 'think', 'also', 'your', 'work', 'life'
            }
            
            filtered_words = [word for word in words if word not in stop_words and len(word) > 3]
            keywords_by_category[article.category].extend(filtered_words)
        
        # Count frequency and get top keywords for each category
        for category in keywords_by_category:
            word_count = {}
            for word in keywords_by_category[category]:
                word_count[word] = word_count.get(word, 0) + 1
            
            # Get top 10 most frequent keywords
            top_keywords = sorted(word_count.items(), key=lambda x: x[1], reverse=True)[:10]
            keywords_by_category[category] = [word for word, count in top_keywords]
        
        return keywords_by_category
    
    def analyze_trends(self, articles: List[NewsArticle]) -> dict:
        """Analyze trends in articles"""
        trends = {
            'total_articles': len(articles),
            'by_category': {},
            'by_source': {},
            'by_day': {},
            'average_score': 0
        }
        
        total_score = 0
        
        for article in articles:
            # Count by category
            if article.category not in trends['by_category']:
                trends['by_category'][article.category] = 0
            trends['by_category'][article.category] += 1
            
            # Count by source
            if article.source not in trends['by_source']:
                trends['by_source'][article.source] = 0
            trends['by_source'][article.source] += 1
            
            # Count by day
            day = article.published.strftime('%Y-%m-%d')
            if day not in trends['by_day']:
                trends['by_day'][day] = 0
            trends['by_day'][day] += 1
            
            total_score += article.score
        
        # Calculate average score
        if articles:
            trends['average_score'] = round(total_score / len(articles), 3)
        
        return trends
    
    def validate_article_quality(self, article: NewsArticle) -> dict:
        """Validate and score article quality"""
        quality_score = 0.0
        issues = []
        
        # Check title quality
        if not article.title or len(article.title) < 10:
            issues.append("Title too short")
        elif len(article.title) > 200:
            issues.append("Title too long")
        else:
            quality_score += 0.2
        
        # Check description quality
        if not article.description or len(article.description) < 50:
            issues.append("Description too short")
        else:
            quality_score += 0.3
        
        # Check URL validity
        if not article.url or not (article.url.startswith('http://') or article.url.startswith('https://')):
            issues.append("Invalid URL")
        else:
            quality_score += 0.1
        
        # Check source
        if not article.source:
            issues.append("Missing source")
        else:
            quality_score += 0.1
        
        # Check date
        if not article.published:
            issues.append("Missing publication date")
        else:
            quality_score += 0.1
        
        # Check category
        if article.category == 'uncategorized':
            issues.append("Not categorized")
        else:
            quality_score += 0.1
        
        # Check for potential spam indicators
        spam_words = ['click here', 'limited time', 'act now', 'free money', 'get rich']
        title_lower = article.title.lower()
        for spam_word in spam_words:
            if spam_word in title_lower:
                issues.append(f"Potential spam: '{spam_word}'")
                quality_score -= 0.2
        
        return {
            'quality_score': max(0, min(1, quality_score)),
            'issues': issues,
            'is_valid': quality_score >= 0.5 and len(issues) <= 2
        }