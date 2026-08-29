import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import scdlPkg from "soundcloud-downloader";

const scdl = scdlPkg.default ?? scdlPkg;

const tempDir = path.resolve("temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export async function download(url) {
  const track = await scdl.getInfo(url);
  const stream = await scdl.download(url);

  const filePath = path.join(tempDir, `${Date.now()}.mp3`);

  await pipeline(stream, fs.createWriteStream(filePath));

  const stat = await fs.promises.stat(filePath);

  if (stat.size === 0) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw new Error("Downloaded file is empty");
  }

  console.log(`Downloaded: ${filePath} (${stat.size} bytes)`);

  const artist = track.user?.username || track.user?.permalink || "unknown";

  return {
    filePath,
    filename: `${track.title} - ${artist}`,
  };
}
