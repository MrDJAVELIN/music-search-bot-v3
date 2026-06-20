export async function search(query, clientId) {
  const res = await fetch(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=10`,
  );

  const data = await res.json();
  return data.collection;
}
