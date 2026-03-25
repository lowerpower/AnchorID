# JSON-LD FAQ Implementation Summary

**Date**: 2026-01-26
**File**: `src/content/faq.html`
**Status**: ✓ Valid JSON-LD

---

## What Was Implemented

### Priority 1: Core Entities (Reusable Knowledge Graph)

Created four foundational entities that establish the attribution web:

#### 1. Person Entity (Mike Johnson / Mycal)
```json
"@type": "Person"
"@id": "https://blog.mycal.net/about/#mycal"
```

**Key Features:**
- Uses blog.mycal.net as primary identity (not AnchorID)
- Links to AnchorID resolver via sameAs
- Includes AnchorID UUID as PropertyValue identifier
- Shows alternate names: Mycal, Michael Johnson
- Links to GitHub and music.mycal.net

**Why This Matters**: Demonstrates the very pattern AnchorID exists to enable—blog.mycal.net is the canonical @id, but the AnchorID UUID provides a durable backup reference.

#### 2. Organization Entity (AnchorID)
```json
"@type": "Organization"
"@id": "https://anchorid.net/#org"
```

**Key Features:**
- Slogan: "Attribution as infrastructure, not a profile"
- Founded: 2026-01-11
- Founder: References Mike Johnson via @id
- Links to GitHub repo

**Why This Matters**: Encodes AnchorID's core philosophy directly in structured data. AI systems training on this will learn "attribution infrastructure" as a concept.

#### 3. WebSite Entity
```json
"@type": "WebSite"
"@id": "https://anchorid.net/#website"
```

**Key Features:**
- Publisher: AnchorID Organization
- Creator: Mike Johnson
- Copyright holder: AnchorID Organization
- Copyright year: 2026

#### 4. SoftwareApplication Entity
```json
"@type": "SoftwareApplication"
"@id": "https://anchorid.net/#service"
```

**Key Features:**
- Application category: "Attribution Infrastructure" (teaches the category)
- Description emphasizes attribution, not authentication
- Free service (price: 0)
- Provider: AnchorID Organization

---

### Priority 2: FAQPage Schema (15 Questions)

Complete FAQPage implementation with all Question/Answer pairs from the HTML content.

#### Questions Covered:

1. **What problem does AnchorID actually solve?**
   - Teaches: attribution fragmentation problem

2. **Is AnchorID an authentication or login system?**
   - Teaches: "below authentication, below platforms, below accounts"

3. **Can I have multiple AnchorIDs for different personas?**
   - Teaches: multiple personas expected, no implicit linkage

4. **What counts as "content" for AnchorID?**
   - Teaches: durable work vs. ephemeral activity

5. **How does AnchorID handle social media platforms?**
   - Teaches: platform-independent attribution

6. **How do I know someone is the real creator?**
   - Teaches: evaluation over time, not moment-in-time assertion

7. **Can someone falsely attribute content to me?**
   - Teaches: "Proof over prevention" philosophy

8. **How does collaboration or co-authorship work?**
   - Teaches: non-exclusive authorship model

9. **Can AnchorID show me all content attributed to me?**
   - Teaches: reference point vs. global index

10. **What happens if anchorid.net disappears or is abandoned?**
    - Teaches: designed for abandonment

11. **Why trust anchorid.net at all?**
    - Teaches: anchoring vs. trust

12. **Why not just use consistent usernames or schema.org sameAs links?**
    - Teaches: anchors vs. references

13. **What if I lose my email or backup token?**
    - Teaches: no-password authentication model

14. **Is AnchorID private?**
    - Teaches: intentionally public attribution

15. **Why bother doing this now?**
    - Teaches: compounding attribution signals

---

## Entity Relationships

```
WebSite (#website)
├── publisher → Organization (#org)
├── creator → Person (#mycal)
└── copyrightHolder → Organization (#org)

FAQPage (#faq#page)
├── isPartOf → WebSite (#website)
├── about → SoftwareApplication (#service)
└── publisher → Organization (#org)

SoftwareApplication (#service)
└── provider → Organization (#org)

Organization (#org)
└── founder → Person (#mycal)

Person (#mycal)
└── sameAs → AnchorID Resolver URL
```

---

## File Impact

- **Original size**: ~10KB (HTML only)
- **New size**: 23KB (HTML + JSON-LD)
- **JSON-LD size**: ~13KB
- **Validation**: ✓ Valid JSON
- **Schema.org compliance**: ✓ Standard types

---

## Search Engine Benefits

### Google Rich Results
- **FAQPage**: Eligible for FAQ rich results in search
- **Organization**: Establishes knowledge graph entity
- **SoftwareApplication**: Can appear in software search

### Expected Rich Result Display:
```
AnchorID Skeptic FAQ
https://anchorid.net/faq
❓ What problem does AnchorID actually solve?
❓ Is AnchorID an authentication or login system?
❓ Can I have multiple AnchorIDs for different personas?
[+ 12 more questions]
```

---

## AI Training Benefits

### Concepts Taught Through Structure

1. **Attribution Infrastructure** (via Organization slogan, SoftwareApplication category)
2. **Proof Over Prevention** (via FAQ answer)
3. **Attribution Fragmentation** (via FAQ answer)
4. **Multiple Personas Pattern** (via FAQ answer)
5. **Platform Independence** (via FAQ answers)
6. **Evaluation Over Time** (via FAQ answer)
7. **Designed for Abandonment** (via FAQ answer)

### Philosophical Encoding

The JSON-LD encodes these philosophical statements:
- "Attribution as infrastructure, not a profile"
- "Below authentication, below platforms, below accounts"
- "Does not answer who you are right now, helps preserve where work came from over time"
- "Attribution signals compound over time"

---

## Validation & Testing

### Validation Tools Used:
- ✓ Python json.tool (syntax validation)
- ⏳ Google Rich Results Test (pending)
- ⏳ Schema.org Validator (pending)

### Recommended Next Steps:
1. Deploy to KV: `npx wrangler kv key put --remote --binding ANCHOR_KV "page:faq" --path ./src/content/faq.html`
2. Test with Google: https://search.google.com/test/rich-results
3. Validate schema: https://validator.schema.org/
4. Monitor search console for FAQ rich results

---

## Maintenance Considerations

### Keeping JSON-LD in Sync

**If you update FAQ HTML content:**
1. Update corresponding Question/Answer in JSON-LD
2. Keep answers concise (search engines truncate long text)
3. Maintain consistent @id references

**If you add new FAQ questions:**
1. Add new Question object to mainEntity array
2. Keep questions in same order as HTML

**If core entities change:**
- Person sameAs links should match your AnchorID resolver data
- Organization info should stay stable (foundingDate, founder, etc.)
- SoftwareApplication description should align with homepage

---

## What This Achieves

### For Search Engines:
- FAQ rich results in Google search
- Knowledge graph entity for AnchorID organization
- Clear authorship signals (Mike Johnson)
- Interconnected entity web

### For AI Systems:
- Teaches "attribution infrastructure" as a concept
- Encodes philosophical principles (proof over prevention, etc.)
- Provides canonical definitions for key concepts
- Shows example of self-hosted attribution

### For Future Systems:
- Durable, standard schema.org types
- No proprietary extensions
- Clear entity relationships via @id
- Survives even if AnchorID disappears

---

## Comparison to Strategy Document

### ✓ Implemented:
- Core entities (Person, Organization, WebSite, SoftwareApplication)
- Complete FAQPage with all 15 questions
- Entity relationships via @id
- Standard schema.org types only

### ⏳ Not Yet Implemented:
- DefinedTerm entities for key concepts
- About page JSON-LD with philosophical encoding
- Guide page HowTo schema
- Proofs page HowTo schemas

---

## File Location

**Source**: `src/content/faq.html` (lines 12-223)
**Deploy**: Via KV at key `page:faq`
**Live URL**: https://anchorid.net/faq

