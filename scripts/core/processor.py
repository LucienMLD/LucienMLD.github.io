"""
Article processing pipeline for categorization, filtering, and ranking
"""

import logging
import re
from typing import Dict, List

from .models import NewsArticle

logger = logging.getLogger(__name__)


class ArticleProcessor:
    """Handles article processing pipeline: categorization, deduplication, filtering"""
    
    def __init__(self, ai_service, target_categories: Dict, config_settings: Dict):
        self.ai_service = ai_service
        self.target_categories = target_categories
        self.config_settings = config_settings
        self.max_articles_per_category = config_settings.get('default_max_articles', 5)
    
    def process_articles(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Main processing pipeline for articles"""
        if not articles:
            return []
        
        logger.info(f"Processing {len(articles)} articles...")
        
        # Step 1: Categorize articles
        articles = self._categorize_articles(articles)
        
        # Step 2: Handle similarity detection and deduplication
        articles = self._handle_similar_articles(articles)
        
        # Step 3: Calculate scores
        articles = self._calculate_scores(articles)
        
        # Step 4: Filter and rank articles
        articles = self._filter_and_rank(articles)
        
        logger.info(f"Processing complete: {len(articles)} articles selected")
        return articles
    
    def _categorize_articles(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Categorize articles using AI or fallback methods"""
        if self.ai_service.is_available:
            try:
                logger.info("Using AI to categorize articles...")
                self._ai_categorize_batch(articles)
            except Exception as e:
                logger.error(f"AI categorization failed: {e}. Using fallback...")
                self._fallback_categorization(articles)
        else:
            logger.info("AI service not available. Using fallback categorization...")
            self._fallback_categorization(articles)
        
        return articles
    
    def _ai_categorize_batch(self, articles: List[NewsArticle]) -> None:
        """Categorize articles using AI in batches"""
        if not articles:
            return
        
        # Process in batches to avoid token limits
        batch_size = 20  # Increased batch size for faster processing
        for i in range(0, len(articles), batch_size):
            batch = articles[i:i + batch_size]
            
            # Prepare article data for AI service
            articles_data = []
            for article in batch:
                articles_data.append({
                    'title': article.title,
                    'source': article.source,
                    'description': article.description
                })
            
            try:
                categories = self.ai_service.batch_categorize(articles_data, self.target_categories)
                
                # Assign categories to articles
                for j, article in enumerate(batch):
                    if j < len(categories):
                        article.category = categories[j]
                    else:
                        # Fallback for this article
                        article.category = self._fallback_single_categorization(article)
                        
                logger.info(f"Categorized batch {i//batch_size + 1}/{(len(articles)-1)//batch_size + 1}")
                
            except Exception as e:
                logger.error(f"Error categorizing batch {i//batch_size + 1}: {e}")
                # Fallback for this batch
                for article in batch:
                    article.category = self._fallback_single_categorization(article)
    
    def _fallback_categorization(self, articles: List[NewsArticle]) -> None:
        """Fallback categorization using keywords when AI is not available"""
        for article in articles:
            article.category = self._fallback_single_categorization(article)
    
    def _fallback_single_categorization(self, article: NewsArticle) -> str:
        """Fallback categorization for a single article using keywords"""
        title_lower = article.title.lower()
        description_lower = article.description.lower()
        combined_text = f"{title_lower} {description_lower}"
        
        category_scores = {}
        
        # Score each category based on keyword matches
        for category, info in self.target_categories.items():
            score = 0
            for keyword in info['keywords']:
                if keyword in combined_text:
                    score += 1
            category_scores[category] = score
        
        # Return category with highest score, use configured default if no matches
        if max(category_scores.values()) == 0:
            return self.config_settings.get('default_category', 'webdev')
        
        return max(category_scores, key=category_scores.get)
    
    def _handle_similar_articles(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Handle similar articles detection and deduplication"""
        unique_articles = []
        
        for article in articles:
            # Check for similar articles (same topic)
            is_similar = False
            for existing_article in unique_articles:
                if article.is_similar_to(existing_article, self if self.ai_service.is_available else None):
                    is_similar = True
                    # Keep the one with higher score (after calculating scores)
                    # For now, we'll just keep the first one and skip duplicates
                    logger.debug(f"Skipping similar article: '{article.title}' (similar to '{existing_article.title}')")
                    break
            
            if not is_similar:
                unique_articles.append(article)
        
        logger.info(f"Removed {len(articles) - len(unique_articles)} similar articles")
        return unique_articles
    
    def _calculate_scores(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Calculate scores for all articles"""
        for article in articles:
            # Use a default source weight of 1.0 since we don't have feed_info here
            article.calculate_score(1.0, self.target_categories, self.config_settings)
        
        return articles
    
    def _filter_and_rank(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Filter duplicates and rank articles by importance"""
        # Remove similar titles (>80% similarity)
        logger.info(f"Removing similar articles from {len(articles)} articles...")
        articles = self._remove_similar_articles(articles)
        logger.info(f"After deduplication: {len(articles)} articles")
        
        if not articles:
            return []
        
        # Use AI to select the most important articles if API is available
        # Temporarily disabled for performance - using basic scoring instead
        if False and self.ai_service.is_available:
            logger.info("Using AI to select most important articles...")
            articles = self._ai_curate_articles(articles)
        else:
            logger.info("No API - using basic scoring...")
            # Fallback to basic scoring
            articles.sort(key=lambda x: x.score, reverse=True)
            
            # Keep top articles per category
            filtered = []
            category_counts = {}
            
            # Initialize all categories from TARGET_CATEGORIES
            for category in self.target_categories.keys():
                category_counts[category] = 0
            
            for article in articles:
                if article.category in category_counts:
                    # Get max_articles for this specific category, fallback to global default
                    max_articles = self.target_categories.get(article.category, {}).get('max_articles', self.max_articles_per_category)
                    if category_counts[article.category] < max_articles:
                        filtered.append(article)
                        category_counts[article.category] += 1
            
            articles = filtered
        
        return articles
    
    def _remove_similar_articles(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Remove articles with similar titles"""
        unique_articles = []
        seen_titles = []
        
        for article in articles:
            is_duplicate = False
            for seen_title in seen_titles:
                if self._similarity(article.title, seen_title) > 0.8:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                unique_articles.append(article)
                seen_titles.append(article.title)
        
        return unique_articles
    
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
    
    def _ai_curate_articles(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Use Claude AI to select the most important articles"""
        try:
            # Group articles by category
            cybersecurity_articles = [a for a in articles if a.category == 'cybersecurity']
            ai_articles = [a for a in articles if a.category == 'ai']
            webdev_articles = [a for a in articles if a.category == 'webdev']
            
            selected_articles = []
            
            # Select articles for each category
            if cybersecurity_articles:
                cyber_selected = self._ai_select_category_articles(
                    cybersecurity_articles, 'cybersecurity', self.max_articles_per_category
                )
                selected_articles.extend(cyber_selected)
            
            if ai_articles:
                ai_selected = self._ai_select_category_articles(
                    ai_articles, 'ai', self.max_articles_per_category
                )
                selected_articles.extend(ai_selected)
            
            if webdev_articles:
                webdev_selected = self._ai_select_category_articles(
                    webdev_articles, 'webdev', self.max_articles_per_category
                )
                selected_articles.extend(webdev_selected)
            
            return selected_articles
            
        except Exception as e:
            logger.error(f"Error in AI curation: {e}")
            logger.info("Falling back to basic scoring...")
            # Fallback to basic scoring
            articles.sort(key=lambda x: x.score, reverse=True)
            return articles[:self.max_articles_per_category * 3]  # 3 categories
    
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
            'ai': """
Prioritize articles that are:
- Major AI model releases or breakthroughs
- Important AI research findings
- Significant AI tool or platform updates
- AI regulation or policy changes
- Industry-changing AI developments
- New AI applications or use cases""",
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
            selected_indices = self.ai_service.call_claude(prompt, max_tokens=100)
            
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
            logger.info(f"AI selected {len(selected)} {category} articles from {len(articles)} candidates")
            return selected
            
        except Exception as e:
            logger.error(f"Error in AI selection for {category}: {e}")
            # Fallback to top scored articles
            articles.sort(key=lambda x: x.score, reverse=True)
            return articles[:max_count]