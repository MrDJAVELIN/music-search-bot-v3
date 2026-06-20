import fs from "fs";
import path from "path";
import scdlPkg from "soundcloud-downloader";

const scdl = scdlPkg.default ?? scdlPkg;

const tempDir = path.resolve("temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

export async function download(url) {
  const track = await scdl.getInfo(url);

  const stream = await scdl.download(url);

  const filePath = path.join(tempDir, `${Date.now()}.mp3`);

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    stream.pipe(file);

    file.on("finish", resolve);
    file.on("error", reject);
  });

  const artist = track.user?.username || track.user?.permalink || "unknown";

  return {
    filePath,
    filename: `${track.title} - ${artist}`,
  };
}
