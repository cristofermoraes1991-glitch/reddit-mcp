# Reddit MCP

Read-only MCP server that lets an MCP-compatible client such as Claude query public Reddit RSS feeds.

## Tools

- `search_reddit` — search public Reddit posts
- `get_subreddit` — read a subreddit feed
- `get_post_comments` — read a post's public comment feed

## Deploy

This project is designed for Vercel/Next.js and exposes the MCP endpoint at:

`/api/mcp`

No Reddit API key is required. It uses public RSS/Atom feeds. Reddit may rate-limit unauthenticated RSS requests, so availability is not guaranteed.

The server is read-only: it cannot post, vote, message users, or access private Reddit data.
