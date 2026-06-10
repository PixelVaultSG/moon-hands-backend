# Moon Hands Website — Improvement Plan v2

**Research date:** 2026-05-24
**Designer references:** Flow, Sahara AI, Composio, Anthropic, Perplexity

---

## Research: Top 5 Design Patterns from Award-Winning Sites

### 1. Flow (wisprflow.ai)
**What works:** Warm cream backgrounds, Playfair Display serif headings, calm micro-animations, editorial feel. No aggressive CTAs.
**Apply to Moon Hands:** Already on brand — our cream/dark palette aligns. Add more serif headings.

### 2. Sahara AI (saharaai.com)
**What works:** Interactive 3D background on hero, grid pattern that responds to mouse, scroll-triggered reveals, floating particles.
**Apply to Moon Hands:** Add subtle animated background to hero (particles/floating elements). Interactive simulator as hero centerpiece.

### 3. Composio (composio.dev)
**What works:** Cinematic scroll fade-in, gradient backgrounds that shift on scroll, technical but beautiful, motion storytelling.
**Apply to Moon Hands:** Scroll-triggered fade-ins for feature sections. Gradient transitions between sections.

### 4. Anthropic (anthropic.com)
**What works:** Massive typography, extreme whitespace, trust-building through minimalism, clean lines.
**Apply to Moon Hands:** Larger hero typography. More breathing room between sections.

### 5. Perplexity (perplexity.ai)
**What works:** Search-as-hero, instant gratification, the product IS the demo.
**Apply to Moon Hands:** Simulator as the hero element — let visitors chat immediately.

---

## Recommended Improvements

### A. Hero Section Redesign

**Current:** Static text + CTA buttons
**Proposed:** Interactive simulator as the hero

```
┌─────────────────────────────────────────────────┐
│                                                  │
│   Moon Hands                              [logo] │
│                                                  │
│   Your clinic's AI receptionist                   │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━                     │
│                                                  │
│   ┌──────────────────────────────────────┐      │
│   │  💬 WhatsApp Simulator               │      │
│   │                                       │      │
│   │  Patient: Hi                          │      │
│   │  ▸ Hey there! Welcome to...          │      │
│   │                                       │      │
│   │  [Type a message...]        [Send]   │      │
│   └──────────────────────────────────────┘      │
│                                                  │
│              [Start Free Trial]                   │
│                                                  │
│   Trusted by 12+ clinics in Singapore            │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Animations:**
- Hero text fades in word-by-word on load (stagger: 0.1s per word)
- Simulator slides up from below with subtle shadow
- Background has slow-moving gold particle field (Canvas/CSS)
- "Trusted by" logos fade in with stagger

### B. Scroll-Triggered Animations

Every section should animate on scroll-into-view:

| Section | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Hero text | Fade up + opacity | 0.8s | ease-out |
| Feature cards | Stagger fade up (0.15s each) | 0.6s | cubic-bezier |
| Stats counter | Count up from 0 | 1.2s | ease-out |
| Testimonials | Slide in from sides | 0.7s | ease-out |
| Pricing cards | Scale up + fade | 0.5s | ease-out |
| CTA section | Glow pulse on button | continuous | ease-in-out |

**Tech:** Use `IntersectionObserver` + CSS transitions. No heavy library needed.

### C. Interactive Buttons

| Button | Hover Effect | Click Effect |
|--------|-------------|--------------|
| Primary CTA | Gold glow expands, text shifts up | Ripple from click point |
| Secondary | Border thickens, background fills | Scale 0.98 |
| Nav links | Underline slides in from left | — |
| Feature cards | Lift + shadow increase | — |
| Pricing card (hover) | Highlighted border glow | — |

### D. Responsive Design Fixes

| Breakpoint | Changes |
|------------|---------|
| Desktop (>1024px) | Full layout, sidebar nav, large hero |
| Tablet (768-1024px) | Stacked features, smaller hero text |
| Mobile (<768px) | Single column, hamburger nav, simulator full-width |
| Small mobile (<480px) | Compact padding, touch-friendly buttons (min 44px) |

**Critical mobile fixes:**
- Simulator must be full-width on mobile
- Touch targets minimum 44x44px
- Font sizes don't go below 14px for readability
- Horizontal scroll eliminated entirely

### E. Visual Effects to Add

1. **Gold particle field** (hero background) — slow-drifting golden dots, subtle
2. **Gradient mesh** (between sections) — warm cream to dark charcoal transition
3. **Typing indicator** (simulator) — animated dots when "AI is typing"
4. **Scroll progress bar** (top of page) — thin gold line showing scroll position
5. **Floating elements** (feature icons) — subtle continuous float animation

### F. Color Refinement

| Element | Current | Proposed |
|---------|---------|----------|
| Primary gold | #D4AF37 | #C9A84C (slightly muted, more premium) |
| Dark background | #0F0F0F | #151515 (warmer dark) |
| Body text | #E8E8E8 | #E5E1D8 (warmer) |
| Muted text | #8A7E72 | #7A7568 (better contrast) |
| Cream background | — | #F5F3EE (for alternating sections) |

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Hero with embedded simulator | 1 day | 🔥 Highest |
| P0 | Scroll-triggered animations | 4 hours | 🔥 High |
| P0 | Responsive fixes (mobile) | 3 hours | 🔥 Critical |
| P1 | Interactive button effects | 2 hours | Medium |
| P1 | Gold particle background | 3 hours | Medium |
| P2 | Scroll progress bar | 30 min | Low |
| P2 | Gradient mesh transitions | 2 hours | Nice-to-have |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/HomePage.tsx` | Complete hero redesign, add animations |
| `src/Simulator.tsx` | Style to match hero, add typing indicator |
| `src/App.tsx` | Add scroll progress bar, global animations |
| `src/index.css` | Add animation keyframes, responsive utilities |
| `tailwind.config.js` | Add custom colors, animation utilities |

---

## Reference Screenshots

Save these for visual reference:
- Flow: wisprflow.ai — serif typography + cream palette
- Sahara AI: saharaai.com — interactive background
- Composio: composio.dev — scroll fade animations

---

*Document created: 2026-05-24*
*Agent: UX Designer + Frontend Developer*
