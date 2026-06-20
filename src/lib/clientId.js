export default async function getSoundCloudClientId() {
  const targetUrl = "https://soundcloud.com";
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  try {
    // 1. Fetch the main SoundCloud homepage HTML source
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": userAgent },
    });
    const html = await response.text();

    // 2. Extract all asset script URLs loaded at the bottom of the page
    // Looks for src="https://sndcdn.com"
    const scriptRegex = /src="([^"]+\/assets\/[^"]+\.js)"/g;
    const scriptUrls = [];
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
      scriptUrls.push(match[1]);
    }

    // Reverse the array to scan the most vital framework bundles first
    scriptUrls.reverse();

    // 3. Scan each JavaScript file for the client_id pattern
    // Looks for client_id:"YOUR_CLIENT_ID" or client_id="YOUR_CLIENT_ID"
    const clientIdRegex = /client_id[:=]"([a-zA-Z0-9]{32})"/;

    for (const scriptUrl of scriptUrls) {
      const scriptRes = await fetch(scriptUrl, {
        headers: { "User-Agent": userAgent },
      });
      const scriptCode = await scriptRes.text();

      const idMatch = scriptCode.match(clientIdRegex);
      if (idMatch && idMatch[1]) {
        return idMatch[1]; // Found the 32-character alpha-numeric string!
      }
    }

    throw new Error("Client ID pattern not found within asset scripts.");
  } catch (error) {
    console.error("Extraction failed:", error.message);
    return null;
  }
}
