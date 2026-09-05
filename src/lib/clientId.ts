export default async function getSoundCloudClientId(): Promise<string | null> {
  const targetUrl = "https://soundcloud.com";
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": userAgent,
      },
    });

    const html = await response.text();

    const scriptRegex = /src="([^"]+\/assets\/[^"]+\.js)"/g;
    const scriptUrls: string[] = [];

    let match: RegExpExecArray | null;

    while ((match = scriptRegex.exec(html)) !== null) {
      scriptUrls.push(match[1]);
    }

    scriptUrls.reverse();

    const clientIdRegex = /client_id[:=]"([a-zA-Z0-9]{32})"/;

    for (const scriptUrl of scriptUrls) {
      const scriptRes = await fetch(scriptUrl, {
        headers: {
          "User-Agent": userAgent,
        },
      });

      const scriptCode = await scriptRes.text();

      const idMatch = scriptCode.match(clientIdRegex);

      if (idMatch?.[1]) {
        return idMatch[1];
      }
    }

    throw new Error("Client ID pattern not found within asset scripts.");
  } catch (error) {
    console.error(
      "Extraction failed:",
      error instanceof Error ? error.message : error,
    );

    return null;
  }
}
