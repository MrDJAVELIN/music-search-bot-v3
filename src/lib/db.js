import fs from "fs";

const FILE = "./lists.json";

function readDB() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

function writeDB(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function saveTrack(id, data) {
  const db = readDB();

  db[id] = {
    url: data.url,
    title: data.title,
    artist: data.artist,
    createdAt: Date.now(),
  };

  writeDB(db);
}

export function getTrack(id) {
  const db = readDB();
  return db[id];
}
