interface SearchTrack {
  id: number;
  title: string;
  permalink_url: string;
  user: {
    username: string;
  };
}

interface SearchResponse {
  collection: SearchTrack[];
}

export async function search(
  query: string,
  clientId: string,
): Promise<SearchTrack[]> {
  const res = await fetch(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      query,
    )}&client_id=${clientId}&limit=10`,
  );

  if (!res.ok) {
    throw new Error(`SoundCloud API error: ${res.status}`);
  }

  const data = (await res.json()) as SearchResponse;

  return data.collection;
}
