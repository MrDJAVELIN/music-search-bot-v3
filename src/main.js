import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import crypto from "crypto";
import { config } from "dotenv";

import { search } from "./lib/search.js";
import getSoundCloudClientId from "./lib/clientId.js";
import { download } from "./lib/download.js";
import { saveTrack, getTrack } from "./lib/db.js";

config();

const bot = new Telegraf(process.env.TOKEN);

let clientId = await getSoundCloudClientId();
const isPrivate = (ctx) => ctx.chat?.type === "private";

bot.start(async (ctx) => {
  await ctx.reply(
    `🎵 SoundCloud Downloader

    Поиск и скачивание треков из SoundCloud.

    Отправьте название трека, чтобы начать.
`,
  );
});

bot.on("message", async (ctx) => {
  const text = ctx.message.text?.trim();
  if (!text) return;

  const isPrivate = ctx.chat?.type === "private";

  if (!isPrivate && !text.startsWith("/msearch")) {
    return;
  }

  const query = isPrivate ? text : text.replace("/msearch", "").trim();

  if (!query) return;

  const list = await search(query, clientId);
  const tracks = (list || []).filter((t) => t?.permalink_url).slice(0, 10);

  if (!tracks.length) {
    if (isPrivate) return ctx.reply("Ничего не найдено");
    return;
  }

  const buttons = tracks.map((t) => {
    const id = crypto.randomUUID().slice(0, 8);

    const artist = t.user?.username || t.user?.permalink || "unknown";

    saveTrack(id, {
      url: t.permalink_url,
      title: t.title,
      artist,
    });

    return Markup.button.callback(
      `${t.title.slice(0, 40)} - ${artist}`,
      `track:${id}`,
    );
  });

  await ctx.reply(
    "Выбери трек:",
    Markup.inlineKeyboard(buttons, { columns: 1 }),
  );
});

bot.action(/^track:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const data = getTrack(id);

  if (!data) {
    return ctx.reply("Трек не найден");
  }

  const { url, title, artist } = data;

  await ctx.answerCbQuery("Скачивание...");

  const msg = await ctx.reply("⏳ Загрузка...");

  const start = Date.now();

  try {
    console.log("1. Starting download");

    const { filePath } = await download(url);

    console.log("2. Download finished:", filePath);

    const file = fs.readFileSync(filePath);

    console.log("3. File loaded:", file.length, "bytes");
    console.log("4. Starting Telegram upload");

    await ctx.replyWithAudio(
      {
        source: file,
        filename: `${title}.mp3`,
      },
      {
        title,
        performer: artist,
      },
    );

    console.log("5. Telegram upload OK");

    const time = ((Date.now() - start) / 1000).toFixed(1);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      undefined,
      `✅ ${title} - ${artist} (${time}s)`,
    );

    fs.unlink(filePath, () => {});
  } catch (e) {
    console.error("DOWNLOAD/UPLOAD ERROR:", e);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      undefined,
      "❌ Ошибка загрузки",
    );
  }
});

bot.launch();
