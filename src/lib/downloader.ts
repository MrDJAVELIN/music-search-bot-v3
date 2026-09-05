import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";

export interface DownloadResult {
  filePath: string;
}

export interface DownloadOptions {
  title?: string;
  artist?: string;
  album?: string | null;
  artwork?: string | null;
}

const TEMP_DIR = path.resolve("./temp");

async function runProcess(command: string, args: string[]): Promise<string> {
  const process = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command} exited with code ${exitCode}\n${stderr}`);
  }

  return stdout;
}

async function downloadArtwork(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download artwork: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();

  await Bun.write(filePath, buffer);
}

async function embedMetadata(
  inputPath: string,
  outputPath: string,
  options: DownloadOptions,
  artworkPath?: string,
): Promise<void> {
  const args = ["-y", "-i", inputPath];

  if (artworkPath) {
    args.push("-i", artworkPath);
  }

  args.push("-map", "0:a");

  if (artworkPath) {
    args.push(
      "-map",
      "1:v",
      "-c:v",
      "mjpeg",
      "-disposition:v:0",
      "attached_pic",
    );
  }

  args.push("-c:a", "copy", "-id3v2_version", "3");

  if (options.title) {
    args.push("-metadata", `title=${options.title}`);
  }

  if (options.artist) {
    args.push("-metadata", `artist=${options.artist}`);
  }

  if (options.album) {
    args.push("-metadata", `album=${options.album}`);
  }

  args.push(outputPath);

  await runProcess("ffmpeg", args);
}

export async function download(
  url: string,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  await mkdir(TEMP_DIR, { recursive: true });

  const id = crypto.randomUUID();

  const inputPath = path.join(TEMP_DIR, `${id}-source.mp3`);

  const outputPath = path.join(TEMP_DIR, `${id}.mp3`);

  const artworkPath = path.join(TEMP_DIR, `${id}-cover.jpg`);

  try {
    await runProcess("yt-dlp", [
      "--no-playlist",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "192K",
      "-o",
      inputPath,
      url,
    ]);

    if (!(await Bun.file(inputPath).exists())) {
      throw new Error(`Downloaded file not found: ${inputPath}`);
    }

    let hasArtwork = false;

    if (options.artwork) {
      try {
        console.log("Downloading artwork...");

        await downloadArtwork(options.artwork, artworkPath);

        hasArtwork = true;

        console.log("Artwork downloaded");
      } catch (error) {
        console.error("Artwork download failed:", error);
      }
    }

    console.log("Embedding metadata...");

    await embedMetadata(
      inputPath,
      outputPath,
      options,
      hasArtwork ? artworkPath : undefined,
    );

    console.log("Metadata embedded");

    await removeFile(inputPath);

    if (hasArtwork) {
      await removeFile(artworkPath);
    }

    if (!(await Bun.file(outputPath).exists())) {
      throw new Error(`Processed file not found: ${outputPath}`);
    }

    return {
      filePath: outputPath,
    };
  } catch (error) {
    await removeFile(inputPath);
    await removeFile(artworkPath);
    await removeFile(outputPath);

    throw error;
  }
}

export async function removeFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Файл уже удалён
  }
}
