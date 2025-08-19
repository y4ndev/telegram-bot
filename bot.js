const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // Ваш Telegram ID

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
let pendingPost = { photos: [], description: null, state: 'awaiting_photo' };
let currentAction = null;

// Старт бота
bot.start(ctx => {
  if (ctx.from.id.toString() === ADMIN_ID) {
    ctx.reply('Добро пожаловать! Выберите действие из меню.', adminMenu);
  } else {
    ctx.reply('Извините, у вас нет доступа к этому боту.');
  }
});

// Обработка фото (по одному)
bot.on('photo', async ctx => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;

  if (
    currentAction === 'publishing_product' &&
    pendingPost.state === 'awaiting_photo'
  ) {
    const photo = ctx.message.photo.pop();
    pendingPost.photos.push(photo.file_id);

    await ctx.reply(
      'Фото получено! Можете отправить ещё или введите описание товара.',
      adminMenuWithCancel
    );
  }
});

// Обработка альбома (несколько фото сразу)
bot.on('media_group', async ctx => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;

  if (
    currentAction === 'publishing_product' &&
    pendingPost.state === 'awaiting_photo'
  ) {
    ctx.message.photo.forEach(p => pendingPost.photos.push(p.file_id));
    await ctx.reply(
      'Альбом получен! Можете отправить ещё фото или введите описание товара.',
      adminMenuWithCancel
    );
  }
});

// Обработка текста
bot.on('text', async ctx => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  const text = ctx.message.text;

  // Отмена действия
  if (text === 'Отменить') {
    pendingPost = { photos: [], description: null, state: 'awaiting_photo' };
    currentAction = null;
    await ctx.reply('Действие отменено. Вы можете начать заново.', adminMenu);
    return;
  }

  // Начало публикации товара
  if (text === 'Опубликовать товар🛒') {
    currentAction = 'publishing_product';

    if (pendingPost.state === 'awaiting_photo') {
      await ctx.reply('Отправьте фото товара.', adminMenuWithCancel);
    } else if (pendingPost.state === 'ready_to_publish') {
      // Публикация
      const mediaGroup = pendingPost.photos.map((fileId, index) => ({
        type: 'photo',
        media: fileId,
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
          photos: [],
          description: null,
          state: 'awaiting_photo',
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
    pendingPost.photos.length > 0 &&
    pendingPost.state === 'awaiting_photo'
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
      const mediaGroup = pendingPost.photos.map((fileId, index) => ({
        type: 'photo',
        media: fileId,
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
        'Сначала добавьте фото и описание товара.',
        adminMenuWithCancel
      );
    }
    return;
  }

  // Любой другой текст
  await ctx.reply('Пожалуйста, выберите действие из меню.', adminMenu);
});

bot.launch();
console.log('Бот запущен!');
