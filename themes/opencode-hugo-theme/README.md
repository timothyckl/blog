# OpenCode Terminal Brutalist

A Hugo theme based on the [opencode.ai](https://opencode.ai) design system — dark canvas, monospace-first typography, rule-based separation, and strict border aesthetics.

## Features

- Persistent light and dark colour modes
- IBM Plex Mono via Google Fonts (Berkeley Mono swap-in supported)
- 1080px bordered page shell
- Responsive with full-screen mobile nav overlay
- Focus-visible rings and keyboard-navigable
- Bio-led homepage with an optional experience timeline
- Framed post listings with dates
- Theme-aware image shortcode
- Social link icons in the navigation
- RSS feed

## Installation

```bash
cd your-hugo-site
git submodule add https://github.com/timothyckl/opencode-hugo-theme themes/opencode-hugo-theme
```

Or clone directly into `themes/`.

Set in `hugo.toml`:

```toml
theme = "opencode-hugo-theme"
```

## Configuration

Full example `hugo.toml`:

```toml
baseURL = '/'
title = "Site Title"
theme = "opencode-hugo-theme"
author = "Your Name"
copyright = "© Your Name. All rights reserved."

[params]
  noindex = false
  mainSections = ["posts"]
  description = "A short description used in page metadata."
  homeLabel = "Home"

[[params.experience]]
  period = "2025 – Present"
  role = "Job title"
  organisation = "Organisation"
  description = "Optional role description."

[[params.socialLinks]]
  icon = "fa-brands fa-github"
  title = "GitHub"
  url = "https://github.com/username"

[[params.socialLinks]]
  icon = "fa-solid fa-envelope"
  title = "Email"
  url = "mailto:you@example.com"

[menu]
  [[menu.main]]
    name = "Posts"
    url = "/posts/"
    weight = 1
```

The homepage introduction comes from `content/_index.md`. For example:

```md
Hi, I'm Your Name.

I write about software, research, and the things I learn along the way.
```

Use paired light and dark illustrations in Markdown with:

```go-html-template
{{</* theme-image dark="images/example-dark.png" light="images/example.png" alt="Example" */>}}
```

## Fonts

The theme uses **IBM Plex Mono** (loaded from Google Fonts) as the default monospace family. If you hold a Berkeley Mono license and want the full brand experience, override `--font-mono-brand` in a custom stylesheet:

```css
:root {
  --font-mono-brand: "Berkeley Mono", "IBM Plex Mono", ui-monospace, monospace;
}
```

## Content

Posts go in `content/posts/`. Front matter supports:

```toml
+++
date = '2026-01-01T12:00:00+08:00'
draft = false
title = 'Post Title'
toc = true      # enable table of contents
+++
```

Add a filename to a fenced code block with Hugo attributes:

````md
```json {filename="opencode.jsonc"}
{
  "model": "anthropic/claude-sonnet-4-5"
}
```
````

## License

MIT
