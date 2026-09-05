import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "dotenv";
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

/**
 * Отправка аудио через curl.
 *
 * Это обход проблемы Bun + Telegraf/node-fetch,
 * из-за которой загрузка больших multipart-файлов
 * может завершаться ECONNRESET.
 */
async function sendAudio(
  chatId: number,
  token: string,
  filePath: string,
  title: string,
  artist: string,
): Promise<void> {
  console.log(`Uploading to Telegram via curl: ${filePath}`);

  const process = Bun.spawn(
    [
      "curl",
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--retry",
      "3",
      "--retry-delay",
      "2",
      "-X",
      "POST",
      `https://api.telegram.org/bot${token}/sendAudio`,
      "-F",
      `chat_id=${chatId}`,
      "-F",
      `audio=@${filePath};type=audio/mpeg`,
      "-F",
      `title=${title}`,
      "-F",
      `performer=${artist}`,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `Telegram upload failed (${exitCode}): ${stderr || stdout}`,
    );
  }

  let response: {
    ok?: boolean;
    description?: string;
  };

  try {
    response = JSON.parse(stdout);
  } catch {
    throw new Error(`Invalid Telegram response: ${stdout}`);
  }

  if (!response.ok) {
    throw new Error(
      `Telegram API error: ${response.description ?? "Unknown error"}`,
    );
  }

  console.log("Telegram upload successful");
}

/**
 * Создаёт кнопки для найденных треков
 * и сохраняет информацию о них в DB.
 */
function createTrackButtons(list: Awaited<ReturnType<typeof search>>) {
  return list.map((track) => {
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
}

/**
 * Поиск треков.
 */
async function performSearch(query: string, isPrivate: boolean): Promise<void> {
  try {
    const list = await search(query, clientId);

    if (!list.length) {
      if (isPrivate) {
        throw new Error("NOT_FOUND");
      }

      return;
    }

    const buttons = createTrackButtons(list);

    return;
  } catch (error) {
    console.error("SEARCH ERROR:", error);
    throw error;
  }
}

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

  /**
   * В группах поиск работает только через /msearch.
   *
   * В личке можно просто отправить:
   * "дворцовый мост"
   */
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
    let list;

    try {
      list = await search(query, clientId);
    } catch (error) {
      console.error("SEARCH ERROR:", error);

      console.log("Refreshing SoundCloud Client ID...");

      clientId = await getSoundCloudClientId();

      console.log("SoundCloud Client ID refreshed");

      list = await search(query, clientId);
    }

    if (!list.length) {
      if (isPrivate) {
        await ctx.reply("Ничего не найдено");
      }

      return;
    }

    const buttons = createTrackButtons(list);

    await ctx.reply(
      "🎵 Выбери трек:",
      Markup.inlineKeyboard(buttons, {
        columns: 1,
      }),
    );
  } catch (error) {
    console.error("SEARCH RETRY ERROR:", error);

    await ctx.reply("❌ Ошибка поиска");
  }
});

/**
 * Нажатие на кнопку трека.
 */
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

  const msg = await ctx.reply(
    `⏳ Ожидание скачивания...

${data.title}`,
  );

  downloadQueue.add(async () => {
    const start = Date.now();

    try {
      const stats = downloadQueue.stats;

      console.log(
        `Download started: ${data.title} | running=${stats.running} waiting=${stats.waiting}`,
      );

      /**
       * Обновляем сообщение перед скачиванием.
       */
      try {
        await ctx.telegram.editMessageText(
          chatId,
          msg.message_id,
          undefined,
          `⬇️ Скачивание...

${data.title}`,
        );
      } catch (error) {
        console.error("Failed to update download message:", error);
      }

      console.log(`Downloading: ${data.url}`);

      /**
       * yt-dlp + FFmpeg.
       */
      const result = await download(data.url, {
        title: data.title,
        artist: data.artist,
        album: data.album,
        artwork: data.artwork,
      });

      console.log(`Download finished: ${result.filePath}`);

      /**
       * Проверяем файл.
       */
      const file = Bun.file(result.filePath);

      if (!(await file.exists())) {
        throw new Error(`Downloaded file does not exist: ${result.filePath}`);
      }

      const fileSize = ((await file.size) / 1024 / 1024).toFixed(2);

      console.log(`File size: ${fileSize} MB`);

      /**
       * Отправляем MP3 через curl,
       * а не через Telegraf/Bun fetch.
       */
      await sendAudio(chatId, token, result.filePath, data.title, data.artist);

      const time = ((Date.now() - start) / 1000).toFixed(1);

      console.log(`Upload finished: ${data.title} (${time}s)`);

      /**
       * Обновляем сообщение после успешной загрузки.
       */
      try {
        await ctx.telegram.editMessageText(
          chatId,
          msg.message_id,
          undefined,
          `✅ ${data.title}

Загружено за ${time}s`,
        );
      } catch (error) {
        console.error("Failed to update success message:", error);
      }

      /**
       * Удаляем MP3 после отправки.
       */
      await removeFile(result.filePath);

      console.log(`Temporary file removed: ${result.filePath}`);
    } catch (error) {
      console.error(`DOWNLOAD ERROR [${data.title}]:`, error);

      /**
       * Если что-то упало — пытаемся удалить
       * временный файл.
       */
      try {
        if (data) {
          // result может не существовать,
          // поэтому отдельная очистка здесь
          // не требуется — downloader чистит свои temp-файлы.
        }
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }

      try {
        await ctx.telegram.editMessageText(
          chatId,
          msg.message_id,
          undefined,
          `❌ Не удалось скачать:

${data.title}`,
        );
      } catch (editError) {
        console.error("Failed to edit error message:", editError);
      }
    }
  });
});

/**
 * Глобальная обработка ошибок Telegraf.
 */
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
