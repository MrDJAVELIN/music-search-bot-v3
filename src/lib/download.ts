import fs from "node:fs";
import path from "node:path";
import scdlPkg from "soundcloud-downloader";

interface SoundCloudTrack {
  title: string;
  user?: {
    username?: string;
  };
}

interface SoundCloudClient {
  getInfo(url: string): Promise<SoundCloudTrack>;
  download(url: string): Promise<NodeJS.ReadableStream>;
}

const scdl = scdlPkg as SoundCloudClient;

const tempDir = path.resolve("temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export interface DownloadResult {
  filePath: string;
  filename: string;
}

export async function download(url: string): Promise<DownloadResult> {
  console.log("1. getInfo:", url);

  const track = await scdl.getInfo(url);

  console.log("2. getInfo OK:", track.title);

  const stream = await scdl.download(url);

  console.log("3. stream OK");

  const filePath = path.join(tempDir, `${Date.now()}.mp3`);

  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    stream.on("error", (error) => {
      console.error("STREAM ERROR:", error);
      reject(error);
    });

    file.on("error", (error) => {
      console.error("FILE ERROR:", error);
      reject(error);
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
    filename: `${track.title} - ${track.user?.username ?? "unknown"}.mp3`,
  };
}
