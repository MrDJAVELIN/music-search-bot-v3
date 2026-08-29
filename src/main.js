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
    `SoundCloud Downloader

Бот для поиска и загрузки музыки из SoundCloud.

Функционал:
— поиск треков по названию
— выбор из результатов поиска
— загрузка и отправка аудиофайла в Telegram

Для начала работы отправьте название трека.`,
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
    await ctx.reply("Трек не найден");
    return;
  }

  const { url, title, artist } = data;

  // Callback Telegram нужно закрыть максимально быстро.
  try {
    await ctx.answerCbQuery("Скачивание...");
  } catch (e) {
    console.error("answerCbQuery error:", e);
  }

  const msg = await ctx.reply("⏳ Загрузка...");
  let filePath;

  try {
    const start = Date.now();

    const result = await download(url);
    filePath = result.filePath;

    const time = ((Date.now() - start) / 1000).toFixed(1);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      undefined,
      `📤 Отправляю файл...`,
    );

    await ctx.replyWithAudio(
      {
        source: fs.readFileSync(filePath),
        filename: `${title}.mp3`,
      },
      {
        title,
        performer: artist,
      },
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      undefined,
      `✅ ${title} - ${artist} (${time}s)`,
    );
  } catch (e) {
    console.error("Download/send error:", e);

    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        undefined,
        "❌ Ошибка загрузки",
      );
    } catch (editError) {
      console.error("Failed to edit status message:", editError);
    }
  } finally {
    if (filePath) {
      fs.unlink(filePath, (err) => {
        if (err) console.error("Failed to delete file:", err);
      });
    }
  }
});

bot.launch();
