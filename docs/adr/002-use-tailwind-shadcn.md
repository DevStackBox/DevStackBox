# ADR 002 — Use Tailwind CSS + shadcn/ui for Styling

**Status:** Accepted  
**Date:** 2024

---

## Decision

Use Tailwind CSS for utility-based styling and shadcn/ui for component primitives. No custom CSS frameworks or component libraries.

---

## Context

DevStackBox needs a consistent, maintainable UI with:

- Dark and light mode support
- Accessible components (dialogs, menus, tooltips)
- Responsive layout
- Fast iteration (no design system to build from scratch)

---

## Options Considered

| Option                   | Pros                                                           | Cons                                         |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------- |
| **Tailwind + shadcn/ui** | Utility-first, tree-shaken, owned components, Radix primitives | Need to install components individually      |
| Material UI              | Large component set                                            | Heavy, opinionated design, hard to customize |
| Ant Design               | Comprehensive                                                  | Very opinionated, difficult dark mode        |
| Chakra UI                | Good DX                                                        | Runtime CSS-in-JS, performance concerns      |
| Custom CSS               | Full control                                                   | Slow to build, inconsistent                  |

---

## Decision Rationale

1. **shadcn/ui is not a dependency** — it generates components into `src/components/ui/`. The code is owned by the project. No external package to break.
2. **Tailwind dark mode** works perfectly with shadcn/ui's CSS variable approach — one `dark` class on `<html>` switches the entire theme.
3. **Radix UI primitives** under shadcn/ui handle accessibility (keyboard navigation, ARIA, focus management) without custom code.
4. **Tree-shaking**: Tailwind purges unused classes. Final CSS bundle is tiny.
5. **Industry adoption**: Both tools have massive community, active development, and extensive docs.

---

## Consequences

- All styling must use Tailwind classes. No `style={}` props or `*.module.css` files except `globals.css`.
- New UI components must be added via `npx shadcn add <component>` — never manually created or copied from other sources.
- The `src/components/ui/` directory is auto-generated. Do NOT manually edit files there.
- Dark mode is implemented via Tailwind's `dark:` prefix. Every new UI element must include `dark:` variants.
- Framer Motion is used for all animations (ADR 001 note: CSS animations are not used).
