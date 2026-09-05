interface SoundCloudTrack {
  id: number;
  title: string;
  permalink_url?: string;
  user?: {
    username?: string;
    permalink?: string;
  };
}

interface ITunesResult {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
}

interface ITunesResponse {
  resultCount: number;
  results: ITunesResult[];
}

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  artwork: string | null;
  duration: number | null;
  url: string;
  source: "soundcloud";
}

async function getMetadata(
  title: string,
  artist: string,
): Promise<ITunesResult | null> {
  const url = new URL("https://itunes.apple.com/search");

  url.searchParams.set("term", `${artist} ${title}`);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`iTunes API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as ITunesResponse;

    return data.results[0] ?? null;
  } catch (error) {
    console.error("iTunes metadata error:", error);
    return null;
  }
}

export async function search(
  query: string,
  clientId: string,
): Promise<Track[]> {
  const url = new URL("https://api-v2.soundcloud.com/search");

  url.searchParams.set("q", query);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("limit", "10");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`SoundCloud API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    collection: SoundCloudTrack[];
  };

  const tracks = data.collection
    .filter((track) => track.permalink_url)
    .slice(0, 10);

  return Promise.all(
    tracks.map(async (track) => {
      const artist = track.user?.username ?? track.user?.permalink ?? "Unknown";

      const metadata = await getMetadata(track.title, artist);

      return {
        id: track.id,

        title: metadata?.trackName ?? track.title,

        artist: metadata?.artistName ?? artist,

        album: metadata?.collectionName ?? null,

        artwork: metadata?.artworkUrl100
          ? metadata.artworkUrl100.replace("100x100bb", "600x600bb")
          : null,

        duration: metadata?.trackTimeMillis ?? null,

        url: track.permalink_url!,

        source: "soundcloud" as const,
      };
    }),
  );
}
