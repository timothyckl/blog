# timothyckl

Personal blog built with [Hugo](https://gohugo.io/) and the OpenCode theme.

## Run locally

Install Hugo, then:

```bash
git clone git@github.com:timothyckl/blog.git
cd blog
hugo server -D
```

The site will be available at <http://localhost:1313>.

## Write a post

```bash
hugo new content posts/my-first-post.md
```

Posts live in `content/posts/`. New posts are drafts by default; set
`draft = false` in the front matter when they are ready to publish.

## Project structure

```text
.
├── archetypes/              # content templates
├── content/                 # posts and pages
├── static/                  # images and custom styles
├── themes/opencode-hugo-theme/
└── hugo.toml                # site configuration
```
