import { createMcpHandler } from "mcp-handler";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const USER_AGENT = "reddit-mcp/1.0 (read-only personal research)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

type FeedItem = {
  title?: string;
  link?: string | { "@_href"?: string };
  id?: string;
  updated?: string;
  published?: string;
  content?: string;
  summary?: string;
  author?: { name?: string } | string;
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    return String(v["#text"] ?? v["__cdata"] ?? "");
  }

  return "";
}

function linkOf(link: FeedItem["link"]): string {
  if (!link) return "";

  if (typeof link === "string") {
    return link;
  }

  return link["@_href"] ?? "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFeed(xml: string) {
  const data = parser.parse(xml);
  const feed = data.feed ?? {};

  return asArray<FeedItem>(feed.entry).map((item) => ({
    title: text(item.title),
    url: linkOf(item.link),
    id: text(item.id),
    date: text(item.updated ?? item.published),
    author:
      typeof item.author === "string"
        ? item.author
        : text(item.author?.name),
    content: stripHtml(text(item.content ?? item.summary)),
  }));
}

async function fetchReddit(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept":
        "application/atom+xml,application/rss+xml,text/xml;q=0.9,*/*;q=0.5",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Reddit RSS returned HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchWithFallback(url: string): Promise<string> {
  try {
    return await fetchReddit(url);
  } catch {
    const fallback = url.replace(
      "https://www.reddit.com/",
      "https://old.reddit.com/"
    );

    return fetchReddit(fallback);
  }
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "search_reddit",
    {
      title: "Search Reddit",
      description:
        "Search public Reddit posts using Reddit's RSS search feed. Read-only. Returns up to 25 results.",
      inputSchema: z.object({
        query: z.string().min(1).max(200),
        sort: z
          .enum(["relevance", "new", "hot", "top"])
          .default("relevance"),
        time: z
          .enum(["hour", "day", "week", "month", "year", "all"])
          .default("all"),
      }),
    },
    async ({ query, sort, time }) => {
      const url =
        `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}` +
        `&sort=${sort}&t=${time}&limit=25`;

      const xml = await fetchWithFallback(url);
      const results = parseFeed(xml);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                source: url,
                count: results.length,
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_subreddit",
    {
      title: "Get Subreddit Feed",
      description:
        "Read public posts from a subreddit via its RSS feed.",
      inputSchema: z.object({
        subreddit: z.string().regex(/^[A-Za-z0-9_]{2,50}$/),
        sort: z.enum(["new", "hot", "top"]).default("new"),
      }),
    },
    async ({ subreddit, sort }) => {
      const url =
        `https://www.reddit.com/r/${subreddit}/${sort}/.rss?limit=25`;

      const xml = await fetchWithFallback(url);
      const results = parseFeed(xml);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                subreddit,
                source: url,
                count: results.length,
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_post_comments",
    {
      title: "Get Post Comments",
      description:
        "Read the public RSS feed for a Reddit post's comment thread. Provide a Reddit post URL or post ID.",
      inputSchema: z.object({
        post: z.string().min(1).max(500),
      }),
    },
    async ({ post }) => {
      let id = post.trim();

      const match = id.match(/comments\/([a-z0-9]+)/i);

      if (match) {
        id = match[1];
      }

      const url =
        `https://www.reddit.com/comments/` +
        `${encodeURIComponent(id)}/.rss?limit=100`;

      const xml = await fetchWithFallback(url);
      const results = parseFeed(xml);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                post: id,
                source: url,
                count: results.length,
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
});

export { handler as GET, handler as POST };
