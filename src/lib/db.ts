import fs from "node:fs";
import path from "node:path";

const DATA_DIR = "./data";
const FILE = path.join(DATA_DIR, "tracks.json");

export interface Track {
  url: string;
  title: string;
  artist: string;
  album: string | null;
  artwork: string | null;
}

type Database = Record<string, Track>;

function ensureDb(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, "{}");
  }
}

function readDb(): Database {
  ensureDb();

  return JSON.parse(fs.readFileSync(FILE, "utf-8")) as Database;
}

function writeDb(data: Database): void {
  ensureDb();

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function saveTrack(id: string, track: Track): void {
  const db = readDb();

  db[id] = track;

  writeDb(db);
}

export function getTrack(id: string): Track | null {
  const db = readDb();

  return db[id] ?? null;
}

export function deleteTrack(id: string): void {
  const db = readDb();

  delete db[id];

  writeDb(db);
}
