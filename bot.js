const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Список админов (массив чисел из переменной окружения)
const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(id => id.trim());

// Проверка, является ли пользователь админом
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId.toString());
}

// Основное меню
const adminMenu = Markup.keyboard([['Опубликовать товар🛒']]).resize();

// Клавиатура для публикации товара
const adminMenuWithPublishProduct = Markup.keyboard([
  ['Опубликовать товар🛒', 'Предосмотр публикации'],
  ['Отменить'],
])
  .resize()
  .oneTime();

// Клавиатура с кнопкой "Отменить"
const adminMenuWithCancel = Markup.keyboard([['Отменить']])
  .resize()
  .oneTime();

// Структура для отслеживания состояния публикации товара
let pendingPost = { media: [], description: null, state: 'awaiting_media' };
let currentAction = null;

// Старт бота
bot.start(ctx => {
  if (isAdmin(ctx.from.id)) {
    ctx.reply('Добро пожаловать! Выберите действие из меню.', adminMenu);
  } else {
    ctx.reply('Извините, у вас нет доступа к этому боту.');
  }
});

// Обработка фото (по одному)
bot.on('photo', async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  if (
    currentAction === 'publishing_product' &&
    pendingPost.state === 'awaiting_media'
  ) {
    const photo = ctx.message.photo.pop();
    pendingPost.media.push({ type: 'photo', media: photo.file_id });

    await ctx.reply(
      'Фото получено! Можете отправить ещё фото/видео или введите описание товара.',
      adminMenuWithCancel
    );
  }
});

// Обработка видео
bot.on('video', async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  if (
    currentAction === 'publishing_product' &&
    pendingPost.state === 'awaiting_media'
  ) {
    const video = ctx.message.video;
    pendingPost.media.push({ type: 'video', media: video.file_id });

    await ctx.reply(
      'Видео получено! Можете отправить ещё фото/видео или введите описание товара.',
      adminMenuWithCancel
    );
  }
});

// Обработка альбома (несколько фото сразу)
bot.on('media_group', async ctx => {
  if (!isAdmin(ctx.from.id)) return;

  if (
    currentAction === 'publishing_product' &&
    pendingPost.state === 'awaiting_media'
  ) {
    ctx.message.photo.forEach(p =>
      pendingPost.media.push({ type: 'photo', media: p.file_id })
    );
    await ctx.reply(
      'Альбом получен! Можете отправить ещё фото/видео или введите описание товара.',
      adminMenuWithCancel
    );
  }
});

// Обработка текста
bot.on('text', async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const text = ctx.message.text;

  // Отмена действия
  if (text === 'Отменить') {
    pendingPost = { media: [], description: null, state: 'awaiting_media' };
    currentAction = null;
    await ctx.reply('Действие отменено. Вы можете начать заново.', adminMenu);
    return;
  }

  // Начало публикации товара
  if (text === 'Опубликовать товар🛒') {
    currentAction = 'publishing_product';

    if (pendingPost.state === 'awaiting_media') {
      await ctx.reply('Отправьте фото или видео товара.', adminMenuWithCancel);
    } else if (pendingPost.state === 'ready_to_publish') {
      // Публикация
      const mediaGroup = pendingPost.media.map((item, index) => ({
        type: item.type,
        media: item.media,
        caption:
          index === 0
            ? `✨🅽🅴🆆✨\n---------------------------------\n🛍️ ${
                pendingPost.description || 'Описание отсутствует.'
              }\n---------------------------------`
            : undefined,
        parse_mode: index === 0 ? 'HTML' : undefined,
      }));

      try {
        await ctx.telegram.sendMediaGroup('@idealshoplnr', mediaGroup);

        pendingPost = {
          media: [],
          description: null,
          state: 'awaiting_media',
        };
        await ctx.reply('Товар успешно опубликован!', adminMenu);
      } catch (error) {
        console.error('Ошибка публикации товара:', error);
        await ctx.reply('Ошибка публикации товара.', adminMenu);
      }
    }
    return;
  }

  // Ввод описания товара
  if (
    currentAction === 'publishing_product' &&
    pendingPost.media.length > 0 &&
    pendingPost.state === 'awaiting_media'
  ) {
    pendingPost.description = text;
    pendingPost.state = 'ready_to_publish';

    await ctx.reply(
      'Описание добавлено! Теперь выберите "Предосмотр публикации" или "Опубликовать товар".',
      adminMenuWithPublishProduct
    );
    return;
  }

  // Предпросмотр публикации
  if (
    text === 'Предосмотр публикации' &&
    currentAction === 'publishing_product'
  ) {
    if (pendingPost.state === 'ready_to_publish') {
      const mediaGroup = pendingPost.media.map((item, index) => ({
        type: item.type,
        media: item.media,
        caption:
          index === 0
            ? `✨🅽🅴🆆✨\n---------------------------------\n🛍️ ${
                pendingPost.description || 'Описание отсутствует.'
              }\n---------------------------------`
            : undefined,
        parse_mode: index === 0 ? 'HTML' : undefined,
      }));

      await ctx.replyWithMediaGroup(mediaGroup);
      await ctx.reply(
        'Предпросмотр готов. Опубликуйте товар или отмените.',
        adminMenuWithPublishProduct
      );
    } else {
      await ctx.reply(
        'Сначала добавьте фото/видео и описание товара.',
        adminMenuWithCancel
      );
    }
    return;
  }

  // Любой другой текст
  await ctx.reply('Пожалуйста, выберите действие из меню.', adminMenu);
});

// --- Запуск (универсальный) ---
if (process.env.RENDER_EXTERNAL_URL) {
  // Render (webhook)
  const app = express();
  app.use(bot.webhookCallback('/secret-path'));

  bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/secret-path`);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Webhook server is running on port ${port}`);
  });
} else {
  // Локально (polling)
  bot.launch();
  console.log('Бот запущен локально через polling');
}

// Корректное завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
