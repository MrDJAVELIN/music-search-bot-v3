import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "dotenv";
import { createReadStream } from "node:fs";
import crypto from "node:crypto";

import { search } from "./lib/search.js";
import getSoundCloudClientId from "./lib/clientId.js";
import { download, removeFile } from "./lib/downloader.js";
import { saveTrack, getTrack } from "./lib/db.js";
import { downloadQueue } from "./lib/queue.js";

config();

const token = process.env.TOKEN;

if (!token) {
  throw new Error("TOKEN is not set in .env");
}

const bot = new Telegraf(token);

let clientId = await getSoundCloudClientId();

console.log("Bot started");

bot.start(async (ctx) => {
  await ctx.reply(
    `🎵 SoundCloud Downloader

Поиск и скачивание треков из SoundCloud.

Отправьте название трека, чтобы начать.`,
  );
});

bot.on(message("text"), async (ctx) => {
  const text = ctx.message.text.trim();

  if (!text) return;

  const chat = ctx.chat;

  if (!chat) return;

  const isPrivate = chat.type === "private";

  if (!isPrivate && !text.startsWith("/msearch")) {
    return;
  }

  const query = isPrivate ? text : text.replace(/^\/msearch/, "").trim();

  if (!query) {
    if (!isPrivate) {
      await ctx.reply("Использование: /msearch название трека");
    }

    return;
  }

  try {
    const list = await search(query, clientId);

    if (!list.length) {
      if (isPrivate) {
        await ctx.reply("Ничего не найдено");
      }

      return;
    }

    const buttons = list.map((track) => {
      const id = crypto.randomUUID().slice(0, 8);

      saveTrack(id, {
        url: track.url,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
      });

      return Markup.button.callback(
        `${track.title.slice(0, 40)} - ${track.artist}`,
        `track:${id}`,
      );
    });

    await ctx.reply(
      "🎵 Выбери трек:",
      Markup.inlineKeyboard(buttons, {
        columns: 1,
      }),
    );
  } catch (error) {
    console.error("SEARCH ERROR:", error);

    try {
      console.log("Refreshing SoundCloud Client ID...");

      clientId = await getSoundCloudClientId();

      console.log("SoundCloud Client ID refreshed");

      const list = await search(query, clientId);

      if (!list.length) {
        if (isPrivate) {
          await ctx.reply("Ничего не найдено");
        }

        return;
      }

      const buttons = list.map((track) => {
        const id = crypto.randomUUID().slice(0, 8);

        saveTrack(id, {
          url: track.url,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.artwork,
        });

        return Markup.button.callback(
          `${track.title.slice(0, 40)} - ${track.artist}`,
          `track:${id}`,
        );
      });

      await ctx.reply(
        "🎵 Выбери трек:",
        Markup.inlineKeyboard(buttons, {
          columns: 1,
        }),
      );
    } catch (retryError) {
      console.error("SEARCH RETRY ERROR:", retryError);

      await ctx.reply("❌ Ошибка поиска");
    }
  }
});

bot.action(/^track:(.+)$/, async (ctx) => {
  if (!ctx.chat) return;

  const chatId = ctx.chat.id;
  const id = ctx.match[1];

  const data = getTrack(id);

  if (!data) {
    await ctx.answerCbQuery("Трек не найден");
    return;
  }

  await ctx.answerCbQuery("Добавлено в очередь");

  const msg = await ctx.reply(`⏳ Ожидание скачивания...\n\n${data.title}`);

  downloadQueue.add(async () => {
    const start = Date.now();

    try {
      const stats = downloadQueue.stats;

      console.log(
        `Download started: ${data.title} | running=${stats.running} waiting=${stats.waiting}`,
      );

      await ctx.telegram.editMessageText(
        chatId,
        msg.message_id,
        undefined,
        `⬇️ Скачивание...\n\n${data.title}`,
      );

      console.log(`Downloading: ${data.url}`);

      const result = await download(data.url, {
        title: data.title,
        artist: data.artist,
        album: data.album,
        artwork: data.artwork,
      });

      console.log(`Download finished: ${result.filePath}`);

      const fileSize = (
        (await Bun.file(result.filePath).size) /
        1024 /
        1024
      ).toFixed(2);

      console.log(`File size: ${fileSize} MB`);

      await ctx.telegram.sendAudio(
        chatId,
        {
          source: createReadStream(result.filePath),
          filename: `${data.title}.mp3`,
        },
        {
          title: data.title,
          performer: data.artist,
        },
      );

      const time = ((Date.now() - start) / 1000).toFixed(1);

      await ctx.telegram.editMessageText(
        chatId,
        msg.message_id,
        undefined,
        `✅ ${data.title}\n\nЗагружено за ${time}s`,
      );

      console.log(`Upload finished: ${data.title} (${time}s)`);

      await removeFile(result.filePath);
    } catch (error) {
      console.error(`DOWNLOAD ERROR [${data.title}]:`, error);

      try {
        await ctx.telegram.editMessageText(
          chatId,
          msg.message_id,
          undefined,
          `❌ Не удалось скачать:\n${data.title}`,
        );
      } catch (editError) {
        console.error("Failed to edit error message:", editError);
      }
    }
  });
});

bot.catch((error) => {
  console.error("BOT ERROR:", error);
});

bot.launch();

process.once("SIGINT", () => {
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
});
