export interface BraveSearchOptions {
  apiKey: string;
  query: string;
  count?: number;
  country?: string;
  freshness?: "day" | "week" | "month" | "year";
}

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

interface BraveApiResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
      page_age?: string;
    }>;
  };
}

const freshnessMap: Record<NonNullable<BraveSearchOptions["freshness"]>, string> = {
  day: "pd", week: "pw", month: "pm", year: "py"
};

export async function searchWeb(options: BraveSearchOptions): Promise<WebSearchResult[]> {
  if (!options.apiKey.trim()) throw new Error("BRAVE_SEARCH_API_KEY is not configured");
  if (!options.query.trim()) throw new Error("Search query must not be empty");

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", options.query);
  url.searchParams.set("count", String(Math.min(Math.max(options.count ?? 8, 1), 20)));
  if (options.country) url.searchParams.set("country", options.country);
  if (options.freshness) url.searchParams.set("freshness", freshnessMap[options.freshness]);

  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": options.apiKey },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Brave Search API returned HTTP " + response.status + ": " + detail.slice(0, 500));
  }

  const payload = await response.json() as BraveApiResponse;
  return (payload.web?.results ?? [])
    .filter((item) => Boolean(item.title && item.url))
    .map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      description: item.description ?? "",
      ...(item.age || item.page_age ? { age: item.age ?? item.page_age } : {})
    }));
}

export function formatSearchResults(results: WebSearchResult[]): string {
  if (results.length === 0) return "No search results found.";
  return results.map((item, index) => [
    (index + 1) + ". " + item.title,
    item.url,
    item.description,
    item.age ? "Published/updated: " + item.age : ""
  ].filter(Boolean).join("\n")).join("\n\n");
}
