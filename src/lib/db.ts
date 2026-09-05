import fs from "node:fs";
import path from "node:path";

interface TrackData {
  url: string;
  title: string;
  artist: string;
}

interface SavedTrack extends TrackData {
  createdAt: number;
}

type Database = Record<string, SavedTrack>;

const DATA_DIR = "/app/data";
const FILE = path.join(DATA_DIR, "lists.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDB(): Database {
  if (!fs.existsSync(FILE)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(FILE, "utf-8")) as Database;
}

function writeDB(data: Database): void {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function saveTrack(id: string, data: TrackData): void {
  const db = readDB();

  db[id] = {
    url: data.url,
    title: data.title,
    artist: data.artist,
    createdAt: Date.now(),
  };

  writeDB(db);
}

export function getTrack(id: string): SavedTrack | undefined {
  const db = readDB();

  return db[id];
}
