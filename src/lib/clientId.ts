const SOUNDCLOUD_URL = "https://soundcloud.com";

function extractClientId(text: string): string | null {
  const patterns = [
    /client_id[=:]["']?([a-zA-Z0-9_-]{20,})/,
    /client_id%3D([a-zA-Z0-9_-]{20,})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export default async function getSoundCloudClientId(): Promise<string> {
  const response = await fetch(SOUNDCLOUD_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch SoundCloud: ${response.status}`);
  }

  const html = await response.text();

  // Сначала проверяем сам HTML
  const directClientId = extractClientId(html);

  if (directClientId) {
    console.log("SoundCloud Client ID found in HTML");

    return directClientId;
  }

  // Затем ищем JS-бандлы
  const scriptUrls = [
    ...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g),
  ].map((match) => match[1]);

  for (const url of scriptUrls) {
    const scriptUrl = new URL(url, SOUNDCLOUD_URL).href;

    try {
      const scriptResponse = await fetch(scriptUrl);

      if (!scriptResponse.ok) continue;

      const script = await scriptResponse.text();

      const clientId = extractClientId(script);

      if (clientId) {
        console.log("SoundCloud Client ID found in JS");

        return clientId;
      }
    } catch {
      // продолжаем искать в следующем bundle
    }
  }

  throw new Error("SoundCloud Client ID not found");
}
