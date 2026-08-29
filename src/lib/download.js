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
  console.log("1. getInfo:", url);

  const track = await scdl.getInfo(url);
  console.log("2. getInfo OK:", track.title);

  const stream = await scdl.download(url);
  console.log("3. stream OK");

  const filePath = path.join(tempDir, `${Date.now()}.mp3`);

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    stream.on("error", (err) => {
      console.error("STREAM ERROR:", err);
      reject(err);
    });

    file.on("error", (err) => {
      console.error("FILE ERROR:", err);
      reject(err);
    });

    file.on("finish", () => {
      console.log("4. FILE FINISHED");
      resolve();
    });

    stream.pipe(file);
  });

  const stat = fs.statSync(filePath);

  console.log("5. FILE SIZE:", stat.size);

  return {
    filePath,
    filename: `${track.title} - ${track.user?.username || "unknown"}.mp3`,
  };
}
