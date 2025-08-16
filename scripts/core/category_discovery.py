"""
Category discovery module for identifying emerging topics and trends
"""

import logging
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple, Optional
import json
from pathlib import Path

from .models import NewsArticle

logger = logging.getLogger(__name__)


class CategoryDiscovery:
    """Discovers emerging categories and trends from articles"""
    
    def __init__(self, ai_service=None, min_cluster_size: int = 3):
        """
        Initialize category discovery
        
        Args:
            ai_service: AIServiceManager instance for advanced analysis
            min_cluster_size: Minimum articles needed to suggest a new category
        """
        self.ai_service = ai_service
        self.min_cluster_size = min_cluster_size
        self.discovered_patterns = {}
        self.term_frequencies = Counter()
        self.emerging_topics = []
        
        # Load discovery history
        self.history_file = Path(__file__).parent.parent / 'data' / 'category_discovery.json'
        self.load_history()
    
    def analyze_uncategorized_patterns(self, articles: List[NewsArticle]) -> Dict:
        """
        Analyze articles to find patterns not matching existing categories
        
        Returns:
            Dictionary with discovered patterns and suggested categories
        """
        logger.info(f"Analyzing {len(articles)} articles for emerging patterns...")
        
        # Extract uncategorized or weakly categorized articles
        uncategorized = self._identify_uncategorized_articles(articles)
        
        if not uncategorized:
            logger.info("No uncategorized patterns found")
            return {}
        
        # Extract key terms and phrases
        self._extract_key_terms(uncategorized)
        
        # Find clusters of related articles
        clusters = self._cluster_similar_articles(uncategorized)
        
        # Generate category suggestions
        suggestions = self._generate_category_suggestions(clusters)
        
        # Use AI for advanced pattern recognition if available
        if self.ai_service and self.ai_service.is_available:
            suggestions = self._enhance_with_ai_analysis(suggestions, uncategorized)
        
        # Save discovery history
        self.save_history(suggestions)
        
        return suggestions
    
    def _identify_uncategorized_articles(self, articles: List[NewsArticle]) -> List[NewsArticle]:
        """Identify articles that don't strongly match existing categories"""
        uncategorized = []
        
        for article in articles:
            # Check if article has low confidence score or generic category
            if (article.score < 0.5 or 
                article.category == 'webdev' or  # Often used as default
                hasattr(article, 'category_confidence') and article.category_confidence < 0.7):
                uncategorized.append(article)
        
        logger.info(f"Found {len(uncategorized)} potentially uncategorized articles")
        return uncategorized
    
    def _extract_key_terms(self, articles: List[NewsArticle]) -> None:
        """Extract key terms and phrases from articles"""
        # Common tech terms to boost
        tech_terms = {
            'quantum', 'blockchain', 'metaverse', 'web3', 'defi', 'nft', 
            'edge computing', 'iot', '5g', '6g', 'ar', 'vr', 'xr',
            'mlops', 'devsecops', 'fintech', 'healthtech', 'edtech',
            'sustainability', 'green tech', 'climate tech', 'robotics',
            'autonomous', 'drone', 'satellite', 'space tech'
        }
        
        for article in articles:
            text = f"{article.title} {article.description}".lower()
            
            # Extract multi-word tech terms
            for term in tech_terms:
                if term in text:
                    self.term_frequencies[term] += 2  # Boost known tech terms
            
            # Extract single words (excluding common words)
            words = re.findall(r'\b[a-z]{4,}\b', text)
            for word in words:
                if word not in self._get_stop_words():
                    self.term_frequencies[word] += 1
            
            # Extract camelCase and PascalCase terms (common in tech)
            tech_names = re.findall(r'\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b', article.title + ' ' + article.description)
            for name in tech_names:
                self.term_frequencies[name.lower()] += 1.5
    
    def _cluster_similar_articles(self, articles: List[NewsArticle]) -> List[List[NewsArticle]]:
        """Cluster articles based on shared terms and topics"""
        clusters = []
        clustered = set()
        
        for i, article in enumerate(articles):
            if i in clustered:
                continue
            
            cluster = [article]
            clustered.add(i)
            
            # Find similar articles
            for j, other in enumerate(articles[i+1:], i+1):
                if j in clustered:
                    continue
                
                if self._articles_share_topic(article, other):
                    cluster.append(other)
                    clustered.add(j)
            
            if len(cluster) >= self.min_cluster_size:
                clusters.append(cluster)
        
        logger.info(f"Found {len(clusters)} article clusters")
        return clusters
    
    def _articles_share_topic(self, article1: NewsArticle, article2: NewsArticle) -> bool:
        """Check if two articles share significant terms"""
        text1 = f"{article1.title} {article1.description}".lower()
        text2 = f"{article2.title} {article2.description}".lower()
        
        # Extract significant terms from both
        terms1 = set(re.findall(r'\b[a-z]{4,}\b', text1)) - self._get_stop_words()
        terms2 = set(re.findall(r'\b[a-z]{4,}\b', text2)) - self._get_stop_words()
        
        # Calculate overlap
        if not terms1 or not terms2:
            return False
        
        overlap = len(terms1 & terms2)
        min_terms = min(len(terms1), len(terms2))
        
        # Consider articles related if they share 20%+ of terms (lowered threshold)
        return (overlap / min_terms) > 0.2
    
    def _generate_category_suggestions(self, clusters: List[List[NewsArticle]]) -> Dict:
        """Generate category suggestions from article clusters"""
        suggestions = {}
        
        for i, cluster in enumerate(clusters):
            # Extract common terms from cluster
            cluster_terms = Counter()
            for article in cluster:
                text = f"{article.title} {article.description}".lower()
                words = re.findall(r'\b[a-z]{4,}\b', text)
                for word in words:
                    if word not in self._get_stop_words():
                        cluster_terms[word] += 1
            
            # Get top terms
            top_terms = cluster_terms.most_common(5)
            
            # Generate category name from top terms
            category_name = self._generate_category_name(top_terms)
            
            # Create suggestion
            suggestions[category_name] = {
                'name': category_name,
                'article_count': len(cluster),
                'key_terms': [term for term, _ in top_terms],
                'sample_titles': [article.title for article in cluster[:3]],
                'confidence': self._calculate_confidence(cluster, top_terms),
                'discovered_at': datetime.now().isoformat()
            }
        
        return suggestions
    
    def _generate_category_name(self, top_terms: List[Tuple[str, int]]) -> str:
        """Generate a meaningful category name from top terms"""
        if not top_terms:
            return "emerging_tech"
        
        # Special handling for known term combinations
        term_set = {term.lower() for term, _ in top_terms}
        
        # Check for specific technology areas
        if {'quantum', 'computing'} & term_set:
            return "quantum_computing"
        elif {'blockchain', 'crypto', 'defi', 'nft'} & term_set:
            return "blockchain_crypto"
        elif {'climate', 'sustainability', 'green', 'carbon'} & term_set:
            return "climate_tech"
        elif {'space', 'satellite', 'rocket', 'aerospace'} & term_set:
            return "space_tech"
        elif {'robot', 'robotics', 'automation', 'autonomous'} & term_set:
            return "robotics_automation"
        elif {'health', 'medical', 'biotech', 'pharma'} & term_set:
            return "health_tech"
        elif {'fintech', 'payment', 'banking', 'finance'} & term_set:
            return "fintech"
        
        # Default: use most common term
        return f"{top_terms[0][0]}_tech"
    
    def _calculate_confidence(self, cluster: List[NewsArticle], top_terms: List[Tuple[str, int]]) -> float:
        """Calculate confidence score for category suggestion"""
        # Factors: cluster size, term frequency, term uniqueness
        size_score = min(1.0, len(cluster) / 10)  # Max at 10 articles
        
        # Term frequency score
        if top_terms:
            avg_freq = sum(freq for _, freq in top_terms) / len(top_terms)
            freq_score = min(1.0, avg_freq / 10)  # Max at avg 10 occurrences
        else:
            freq_score = 0
        
        # Combine scores
        confidence = (size_score * 0.5) + (freq_score * 0.5)
        return round(confidence, 2)
    
    def _enhance_with_ai_analysis(self, suggestions: Dict, articles: List[NewsArticle]) -> Dict:
        """Use AI to enhance category suggestions"""
        if not suggestions or not self.ai_service.is_available:
            return suggestions
        
        try:
            # Prepare data for AI analysis
            suggestions_text = json.dumps(suggestions, indent=2)
            sample_articles = "\n".join([f"- {a.title}" for a in articles[:10]])
            
            prompt = f"""Analyze these discovered article patterns and improve the category suggestions:

Current suggestions:
{suggestions_text}

Sample uncategorized articles:
{sample_articles}

Please:
1. Validate if these are genuine emerging categories
2. Improve the category names to be more descriptive
3. Identify any patterns I might have missed
4. Rate each suggestion (keep/improve/discard)

Return a JSON object with improved suggestions."""

            response = self.ai_service.call_claude(prompt, max_tokens=500)
            
            # Parse AI response
            try:
                # Extract JSON from response
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    ai_suggestions = json.loads(json_match.group())
                    # Merge AI enhancements with original suggestions
                    for key in suggestions:
                        if key in ai_suggestions:
                            suggestions[key].update(ai_suggestions[key])
            except json.JSONDecodeError:
                logger.warning("Could not parse AI suggestions as JSON")
            
            logger.info("Enhanced suggestions with AI analysis")
            
        except Exception as e:
            logger.error(f"AI enhancement failed: {e}")
        
        return suggestions
    
    def _get_stop_words(self) -> Set[str]:
        """Get common stop words to exclude from analysis"""
        return {
            'the', 'and', 'for', 'with', 'this', 'that', 'from', 'will',
            'have', 'been', 'more', 'about', 'after', 'also', 'than',
            'their', 'which', 'these', 'could', 'would', 'should', 'there',
            'where', 'when', 'what', 'into', 'through', 'under', 'over',
            'article', 'news', 'report', 'says', 'according', 'new', 'data'
        }
    
    def load_history(self) -> None:
        """Load discovery history from file"""
        if self.history_file.exists():
            try:
                with open(self.history_file, 'r') as f:
                    data = json.load(f)
                    self.discovered_patterns = data.get('patterns', {})
                    self.emerging_topics = data.get('topics', [])
                logger.info(f"Loaded {len(self.discovered_patterns)} historical patterns")
            except Exception as e:
                logger.error(f"Error loading history: {e}")
    
    def save_history(self, new_suggestions: Dict) -> None:
        """Save discovery history to file"""
        try:
            # Update patterns
            for key, value in new_suggestions.items():
                if key not in self.discovered_patterns:
                    self.discovered_patterns[key] = value
                    self.emerging_topics.append({
                        'name': key,
                        'discovered': datetime.now().isoformat(),
                        'confidence': value.get('confidence', 0)
                    })
            
            # Create data directory if needed
            self.history_file.parent.mkdir(exist_ok=True)
            
            # Save to file
            with open(self.history_file, 'w') as f:
                json.dump({
                    'patterns': self.discovered_patterns,
                    'topics': self.emerging_topics,
                    'last_updated': datetime.now().isoformat()
                }, f, indent=2)
            
            logger.info(f"Saved {len(new_suggestions)} new category suggestions")
            
        except Exception as e:
            logger.error(f"Error saving history: {e}")
    
    def get_trending_categories(self, days: int = 7) -> List[Dict]:
        """Get recently trending categories"""
        cutoff_date = datetime.now() - timedelta(days=days)
        trending = []
        
        for topic in self.emerging_topics:
            try:
                discovered_date = datetime.fromisoformat(topic['discovered'])
                if discovered_date > cutoff_date:
                    trending.append(topic)
            except:
                continue
        
        # Sort by confidence
        trending.sort(key=lambda x: x.get('confidence', 0), reverse=True)
        return trending[:5]  # Top 5 trending
    
    def suggest_category_updates(self, existing_categories: Dict) -> Dict:
        """Suggest updates to existing categories based on discoveries"""
        updates = {}
        
        for pattern_name, pattern_data in self.discovered_patterns.items():
            # Check if this pattern has high confidence and enough articles
            if (pattern_data.get('confidence', 0) > 0.7 and 
                pattern_data.get('article_count', 0) >= 5):
                
                # Check if it's not already in existing categories
                if pattern_name not in existing_categories:
                    updates[pattern_name] = {
                        'action': 'add',
                        'category': {
                            'description': f"Emerging category for {pattern_name} articles",
                            'keywords': pattern_data.get('key_terms', []),
                            'priority': 'medium',
                            'max_articles': 3,
                            'score_multiplier': 1.0
                        },
                        'reason': f"Found {pattern_data['article_count']} articles with {pattern_data['confidence']*100:.0f}% confidence"
                    }
        
        return updates