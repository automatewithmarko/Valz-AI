const responses = [
  `## Brand Valuation Analysis

Based on the information provided, here's a preliminary assessment:

**Estimated Brand Value**: $2.4M - $3.1M

### Key Factors:
- **Market Position**: Strong presence in the AI/tech sector
- **Brand Recognition**: Growing awareness with 15% QoQ increase
- **Customer Loyalty**: Net Promoter Score of 72 (Excellent)
- **Digital Presence**: Consistent engagement across platforms

### Recommendations:
1. Invest in thought leadership content
2. Strengthen trademark portfolio
3. Expand brand partnerships in adjacent markets

> *This is a preliminary estimate. For a comprehensive valuation, consider providing your financial data and market research.*`,

  `## Brand DNA Strength Analysis

Your brand DNA shows several strong characteristics:

### Core Strengths
| Attribute | Score | Benchmark |
|-----------|-------|-----------|
| Innovation | 8.7/10 | Top 15% |
| Trust | 7.9/10 | Top 25% |
| Relevance | 8.2/10 | Top 20% |
| Differentiation | 9.1/10 | Top 10% |

### Key Insights:
- **Differentiation** is your standout metric — your brand occupies a unique position that competitors find difficult to replicate
- **Trust** has room for growth. Consider investing in:
  - Customer testimonial campaigns
  - Third-party certifications
  - Transparent communication initiatives

### Action Items:
1. Double down on what makes you unique
2. Build social proof through case studies
3. Launch a brand ambassador program`,

  `## Brand Value Growth Strategy

Here's a comprehensive roadmap to increase your brand value over the next 12 months:

### Phase 1: Foundation (Months 1-3)
- **Audit current brand assets** — logo, messaging, visual identity
- **Define brand voice guidelines** — ensure consistency across channels
- **Benchmark against competitors** — identify gaps and opportunities

### Phase 2: Amplification (Months 4-8)
- **Content marketing push** — thought leadership articles, whitepapers
- **Strategic partnerships** — co-branding with complementary brands
- **Community building** — engage audiences through events and social media

### Phase 3: Optimization (Months 9-12)
- **Measure brand sentiment** — NPS surveys, social listening
- **Refine positioning** — adjust based on market feedback
- **Expand reach** — enter adjacent markets or demographics

### Projected Impact:
With consistent execution, brands typically see a **15-30% increase** in perceived value within 12 months.

> *Would you like me to dive deeper into any of these phases?*`,

  `## Competitive Brand Analysis

Here's how your brand stacks up against key competitors:

### Market Position Matrix

| Brand | Value Est. | Growth | Sentiment |
|-------|-----------|--------|-----------|
| **Your Brand** | $2.8M | +18% | Positive |
| Competitor A | $4.1M | +12% | Neutral |
| Competitor B | $1.9M | +22% | Positive |
| Competitor C | $3.5M | -3% | Declining |

### Competitive Advantages:
- **Speed of innovation** — you ship 2x faster than the industry average
- **Customer intimacy** — your support satisfaction scores are 15 points above average
- **Digital-first approach** — stronger online presence than legacy competitors

### Vulnerabilities:
- **Brand awareness** is lower than top competitors (addressed through marketing investment)
- **Enterprise credibility** could be strengthened with case studies and certifications

### Strategic Recommendations:
1. Target Competitor C's dissatisfied customers with a migration campaign
2. Study Competitor B's growth tactics — similar trajectory but different approach
3. Differentiate from Competitor A on speed and customer experience`,

  `## Brand Perception Survey Analysis

Based on recent sentiment data, here's a breakdown of how your brand is perceived:

### Overall Sentiment Score: **7.8 / 10** *(Above Average)*

### Perception by Category:

**Product Quality** — ★★★★☆ (4.2/5)
Your customers consistently rate product quality highly. Key drivers include reliability and modern design.

**Customer Service** — ★★★★★ (4.6/5)
This is your strongest category. Response times and resolution quality are exceptional.

**Value for Money** — ★★★☆☆ (3.4/5)
This is an area for improvement. Some customers feel pricing doesn't match perceived value.

**Innovation** — ★★★★☆ (4.1/5)
You're seen as a forward-thinking brand, especially in AI and automation capabilities.

### Demographic Breakdown:
- **18-34**: Most enthusiastic segment (8.2/10 sentiment)
- **35-54**: Strong loyalty but desire more enterprise features
- **55+**: Lower awareness, significant growth opportunity

### Recommendations:
1. Address value perception through tiered pricing or free trials
2. Create age-specific marketing campaigns
3. Leverage customer service excellence in marketing materials`
];

export function getRandomResponse(): string {
  return responses[Math.floor(Math.random() * responses.length)];
}

export function generateChatTitle(message: string): string {
  const cleaned = message.replace(/[^\w\s]/g, "").trim();
  const words = cleaned.split(/\s+/).slice(0, 6);
  return words.join(" ") + (cleaned.split(/\s+/).length > 6 ? "..." : "");
}
