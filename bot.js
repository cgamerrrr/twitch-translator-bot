'use strict';

const tmi = require('tmi.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ==================== НАСТРОЙКИ ====================

const BOT_USERNAME = 'cgamer_bot';
const CHANNEL = 'cgamer__';
const OAUTH = process.env.TWITCH_OAUTH;

const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'fish_data.json');

const FISH_COOLDOWN = 15 * 1000;
const AUTO_TRANSLATE_COOLDOWN = 8000;

const IGNORED_USERS = new Set([
  'cgamer_bot',
  'nightbot',
  'streamelements',
  'moobot',
  'sery_bot',
  'jeetbot'
]);

if (!OAUTH) {
  console.error('ОШИБКА: добавь TWITCH_OAUTH в переменные окружения Render.');
  process.exit(1);
}

// ==================== HTTP-СЕРВЕР RENDER ====================

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('cgamer_bot is online');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP-сервер запущен на порту ${PORT}`);
});

// ==================== TWITCH ====================

const client = new tmi.Client({
  options: {
    debug: false
  },
  connection: {
    reconnect: true,
    secure: true
  },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH
  },
  channels: [CHANNEL]
});

// ==================== ПРОФИЛИ И СОХРАНЕНИЕ ====================

let profiles = {};

function loadProfiles() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      profiles = JSON.parse(data);

      if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
        profiles = {};
      }
    } else {
      profiles = {};
    }

    console.log(`Загружено профилей: ${Object.keys(profiles).length}`);
  } catch (error) {
    console.error('Ошибка загрузки профилей:', error.message);
    profiles = {};
  }
}

function saveProfiles() {
  try {
    const tempFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(profiles, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (error) {
    console.error('Ошибка сохранения профилей:', error.message);
  }
}

function getProfile(username) {
  const name = username.toLowerCase();

  if (!profiles[name]) {
    profiles[name] = {
      coins: 100,
      xp: 0,
      level: 1,
      fish: 0,
      rareFish: 0,
      legendaryFish: 0,
      totalCatches: 0,
      rod: 'Обычная',
      lastFish: 0,
      lastDaily: '',
      createdAt: Date.now()
    };

    saveProfiles();
  }

  const p = profiles[name];

  // Совместимость со старыми профилями
  p.coins = Number(p.coins) || 0;
  p.xp = Number(p.xp) || 0;
  p.level = Number(p.level) || 1;
  p.fish = Number(p.fish) || 0;
  p.rareFish = Number(p.rareFish) || 0;
  p.legendaryFish = Number(p.legendaryFish) || 0;
  p.totalCatches = Number(p.totalCatches) || 0;
  p.rod = p.rod || 'Обычная';
  p.lastFish = Number(p.lastFish) || 0;
  p.lastDaily = p.lastDaily || '';

  return p;
}

// ==================== ОПЫТ И УРОВНИ ====================

function addXP(username, amount) {
  const profile = getProfile(username);

  profile.xp += amount;

  let leveledUp = false;

  while (profile.xp >= profile.level * 100) {
    profile.xp -= profile.level * 100;
    profile.level++;
    leveledUp = true;
  }

  saveProfiles();

  if (leveledUp) {
    client.say(
      `#${CHANNEL}`,
      `🎉 @${username}, новый уровень! Теперь у тебя ${profile.level}-й уровень!`
    );
  }
}

// ==================== РЫБА И УДОЧКИ ====================

const fishList = [
  { name: 'Карась', rarity: 'обычная', chance: 30, coins: 10, xp: 5 },
  { name: 'Окунь', rarity: 'обычная', chance: 25, coins: 12, xp: 6 },
  { name: 'Плотва', rarity: 'обычная', chance: 20, coins: 8, xp: 4 },
  { name: 'Щука', rarity: 'редкая', chance: 10, coins: 35, xp: 15 },
  { name: 'Судак', rarity: 'редкая', chance: 7, coins: 45, xp: 20 },
  { name: 'Сом', rarity: 'редкая', chance: 5, coins: 60, xp: 25 },
  { name: 'Золотая рыба', rarity: 'легендарная', chance: 2, coins: 150, xp: 60 },
  { name: 'Мифическая рыба', rarity: 'легендарная', chance: 1, coins: 250, xp: 100 }
];

const rods = {
  'Обычная': {
    price: 0,
    bonus: 0
  },
  'Улучшенная': {
    price: 500,
    bonus: 5
  },
  'Золотая': {
    price: 1500,
    bonus: 12
  }
};

function getRandomFish(rod) {
  const bonus = rods[rod]?.bonus || 0;

  const adjusted = fishList.map(fish => {
    let chance = fish.chance;

    if (fish.rarity === 'редкая' || fish.rarity === 'легендарная') {
      chance += bonus;
    }

    return { ...fish, chance };
  });

  const total = adjusted.reduce((sum, fish) => sum + fish.chance, 0);
  let random = Math.random() * total;

  for (const fish of adjusted) {
    random -= fish.chance;

    if (random <= 0) {
      return fish;
    }
  }

  return adjusted[0];
}

function formatTime(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${seconds} сек.`;
}

function fishCommand(username) {
  const profile = getProfile(username);
  const now = Date.now();
  const remaining = FISH_COOLDOWN - (now - profile.lastFish);

  if (remaining > 0) {
    client.say(
      `#${CHANNEL}`,
      `🎣 @${username}, подожди ещё ${formatTime(remaining)} перед следующей рыбалкой.`
    );
    return;
  }

  profile.lastFish = now;

  const fish = getRandomFish(profile.rod);

  profile.coins += fish.coins;
  profile.totalCatches++;

  if (fish.rarity === 'обычная') {
    profile.fish++;
  } else if (fish.rarity === 'редкая') {
    profile.rareFish++;
  } else {
    profile.legendaryFish++;
  }

  addXP(username, fish.xp);
  saveProfiles();

  let rarityText = '';

  if (fish.rarity === 'редкая') {
    rarityText = ' ✨ РЕДКАЯ РЫБА!';
  } else if (fish.rarity === 'легендарная') {
    rarityText = ' 🌟 ЛЕГЕНДАРНАЯ РЫБА!';
  }

  client.say(
    `#${CHANNEL}`,
    `🎣 @${username} поймал: ${fish.name}!${rarityText} +${fish.coins} монет, +${fish.xp} XP.`
  );
}

// ==================== ЕЖЕДНЕВНАЯ НАГРАДА ====================

function getMoscowDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function dailyCommand(username) {
  const profile = getProfile(username);
  const today = getMoscowDate();

  if (profile.lastDaily === today) {
    client.say(
      `#${CHANNEL}`,
      `🎁 @${username}, ты уже забирал ежедневную награду. Приходи завтра!`
    );
    return;
  }

  profile.lastDaily = today;
  profile.coins += 200;

  addXP(username, 25);
  saveProfiles();

  client.say(
    `#${CHANNEL}`,
    `🎁 @${username} получил ежедневную награду: +200 монет и +25 XP!`
  );
}

// ==================== ЭКОНОМИКА ====================

function balanceCommand(username) {
  const p = getProfile(username);

  client.say(
    `#${CHANNEL}`,
    `💰 @${username}: ${p.coins} монет | Уровень ${p.level} | XP: ${p.xp}/${p.level * 100}`
  );
}

function profileCommand(username) {
  const p = getProfile(username);

  client.say(
    `#${CHANNEL}`,
    `👤 @${username} | 💰 ${p.coins} монет | ⭐ Уровень ${p.level} | XP ${p.xp}/${p.level * 100} | 🐟 Рыба: ${p.fish} | ✨ Редкая: ${p.rareFish} | 🌟 Легендарная: ${p.legendaryFish} | 🎣 Удочка: ${p.rod} | Всего уловов: ${p.totalCatches}`
  );
}

function shopCommand(username) {
  client.say(
    `#${CHANNEL}`,
    `🛒 Магазин удочек: !купить улучшенную — 500 монет; !купить золотую — 1500 монет. Текущая удочка: ${getProfile(username).rod}.`
  );
}

function buyRodCommand(username, rodName) {
  const profile = getProfile(username);
  const rodKey = Object.keys(rods).find(
    key => key.toLowerCase() === rodName.toLowerCase()
  );

  if (!rodKey || rodKey === 'Обычная') {
    client.say(`#${CHANNEL}`, `@${username}, такой удочки нет. Напиши !магазин.`);
    return;
  }

  const rod = rods[rodKey];

  if (profile.rod === rodKey) {
    client.say(`#${CHANNEL}`, `@${username}, у тебя уже есть эта удочка.`);
    return;
  }

  const currentPower = rods[profile.rod]?.bonus || 0;

  if (rod.bonus <= currentPower) {
    client.say(`#${CHANNEL}`, `@${username}, у тебя уже есть удочка не хуже этой.`);
    return;
  }

  if (profile.coins < rod.price) {
    client.say(
      `#${CHANNEL}`,
      `@${username}, не хватает монет. Нужно ${rod.price}, у тебя ${profile.coins}.`
    );
    return;
  }

  profile.coins -= rod.price;
  profile.rod = rodKey;

  saveProfiles();

  client.say(
    `#${CHANNEL}`,
    `🎣 @${username} купил удочку «${rodKey}» за ${rod.price} монет!`
  );
}

// ==================== ТОП ИГРОКОВ ====================

function topCommand() {
  const top = Object.entries(profiles)
    .sort((a, b) => b[1].coins - a[1].coins)
    .slice(0, 5);

  if (!top.length) {
    client.say(`#${CHANNEL}`, 'Пока нет игроков в рейтинге.');
    return;
  }

  const result = top.map(([name, p], i) =>
    `${i + 1}. ${name} — ${p.coins} монет`
  );

  client.say(`#${CHANNEL}`, `🏆 ТОП БОГАЧЕЙ: ${result.join(' | ')}`);
}

function fishTopCommand() {
  const top = Object.entries(profiles)
    .sort((a, b) => b[1].totalCatches - a[1].totalCatches)
    .slice(0, 5);

  if (!top.length) {
    client.say(`#${CHANNEL}`, 'Пока нет рыбаков в рейтинге.');
    return;
  }

  const result = top.map(([name, p], i) =>
    `${i + 1}. ${name} — ${p.totalCatches} уловов`
  );

  client.say(`#${CHANNEL}`, `🎣 ТОП РЫБАКОВ: ${result.join(' | ')}`);
}

// ==================== ЯЗЫКИ И ПЕРЕВОД ====================

const languages = {
  'английский': 'en',
  'английский язык': 'en',
  'немецкий': 'de',
  'французский': 'fr',
  'испанский': 'es',
  'итальянский': 'it',
  'польский': 'pl',
  'китайский': 'zh-CN',
  'японский': 'ja',
  'корейский': 'ko',
  'турецкий': 'tr',
  'украинский': 'uk',
  'белорусский': 'be',
  'казахский': 'kk',
  'португальский': 'pt',
  'арабский': 'ar',
  'чешский': 'cs',
  'нидерландский': 'nl',
  'голландский': 'nl',
  'шведский': 'sv',
  'греческий': 'el',
  'хинди': 'hi',
  'вьетнамский': 'vi',
  'румынский': 'ro',
  'финский': 'fi',
  'норвежский': 'no',
  'русский': 'ru',
  'тайский': 'th',
  'иврит': 'he',
  'индонезийский': 'id',
  'болгарский': 'bg',
  'сербский': 'sr',
  'словацкий': 'sk',
  'венгерский': 'hu',
  'датский': 'da',
  'персидский': 'fa',
  'грузинский': 'ka',
  'армянский': 'hy',
  'эстонский': 'et',
  'латышский': 'lv',
  'литовский': 'lt'
};

function getLanguageCode(value) {
  const key = value.toLowerCase().trim();
  return languages[key] || key;
}

async function translateText(text, from, to) {
  try {
    const response = await axios.get(
      'https://api.mymemory.translated.net/get',
      {
        params: {
          q: text,
          langpair: `${from}|${to}`
        },
        timeout: 10000
      }
    );

    const translated = response.data?.responseData?.translatedText;

    if (!translated) {
      throw new Error('Пустой ответ сервиса перевода');
    }

    return translated;
  } catch (error) {
    console.error('Ошибка перевода:', error.message);
    return null;
  }
}

const autoTranslateUsers = new Map();

async function autoTranslateToRussian(username, message) {
  const now = Date.now();
  const last = autoTranslateUsers.get(username) || 0;

  if (now - last < AUTO_TRANSLATE_COOLDOWN) {
    return;
  }

  // Не переводим короткие сообщения
  if (message.trim().length < 8) {
    return;
  }

  // Не отправляем в перевод сообщения, состоящие только из команд
  if (message.trim().startsWith('!')) {
    return;
  }

  // Автоматический перевод иностранных сообщений
  const translated = await translateText(message, 'autodetect', 'ru');

  if (!translated) {
    return;
  }

  const normalized = translated.trim().toLowerCase();
  const original = message.trim().toLowerCase();

  // Не дублируем сообщение, если оно уже на русском
  if (normalized === original) {
    return;
  }

  autoTranslateUsers.set(username, now);

  client.say(
    `#${CHANNEL}`,
    `🌐 @${username}: ${translated.slice(0, 350)}`
  );
}

async function manualTranslateCommand(username, message) {
  const translated = await translateText(message, 'autodetect', 'ru');

  if (!translated) {
    client.say(`#${CHANNEL}`, `@${username}, не удалось выполнить перевод.`);
    return;
  }

  client.say(
    `#${CHANNEL}`,
    `🌐 Перевод для @${username}: ${translated.slice(0, 350)}`
  );
}

async function translateFromRussianCommand(username, language, message) {
  const lang = getLanguageCode(language);

  if (!/^[a-z-]{2,10}$/i.test(lang)) {
    client.say(`#${CHANNEL}`, `@${username}, не удалось распознать язык.`);
    return;
  }

  const translated = await translateText(message, 'ru', lang);

  if (!translated) {
    client.say(`#${CHANNEL}`, `@${username}, перевод не выполнен.`);
    return;
  }

  client.say(
    `#${CHANNEL}`,
    `🌍 Перевод для @${username}: ${translated.slice(0, 350)}`
  );
}

// ==================== ВАЛЮТЫ ЦБ РФ ====================

const currencyNames = {
  'доллар': 'USD',
  'долларов': 'USD',
  'доллара': 'USD',
  'usd': 'USD',
  'евро': 'EUR',
  'eur': 'EUR',
  'фунт': 'GBP',
  'фунтов': 'GBP',
  'gbp': 'GBP',
  'юань': 'CNY',
  'юаней': 'CNY',
  'cny': 'CNY',
  'лира': 'TRY',
  'лир': 'TRY',
  'try': 'TRY',
  'тенге': 'KZT',
  'kzt': 'KZT',
  'дирхам': 'AED',
  'aed': 'AED',
  'иена': 'JPY',
  'иен': 'JPY',
  'jpy': 'JPY',
  'франк': 'CHF',
  'chf': 'CHF'
};

async function getCurrencyRates() {
  const response = await axios.get(
    'https://www.cbr-xml-daily.ru/daily_json.js',
    { timeout: 10000 }
  );

  return response.data.Valute;
}

async function currencyCommand(username, currency) {
  const code = currencyNames[currency.toLowerCase()] || currency.toUpperCase();

  try {
    const rates = await getCurrencyRates();
    const item = rates[code];

    if (!item) {
      client.say(
        `#${CHANNEL}`,
        `@${username}, валюта ${code} не найдена в данных ЦБ РФ.`
      );
      return;
    }

    const rate = item.Value / item.Nominal;

    client.say(
      `#${CHANNEL}`,
      `💱 ${item.Name}: ${rate.toFixed(2)} RUB за 1 ${code}. По данным ЦБ РФ.`
    );
  } catch (error) {
    console.error('Ошибка курса валют:', error.message);
    client.say(`#${CHANNEL}`, 'Не удалось получить курс валют.');
  }
}

async function convertCommand(username, amount, currency) {
  const value = Number(amount);
  const code = currencyNames[currency.toLowerCase()] || currency.toUpperCase();

  if (!Number.isFinite(value) || value <= 0 || value > 1000000000) {
    client.say(`#${CHANNEL}`, `@${username}, укажи корректную сумму.`);
    return;
  }

  try {
    const rates = await getCurrencyRates();
    const item = rates[code];

    if (!item) {
      client.say(`#${CHANNEL}`, `Валюта ${code} не найдена в данных ЦБ РФ.`);
      return;
    }

    const rate = item.Value / item.Nominal;
    const result = value * rate;

    client.say(
      `#${CHANNEL}`,
      `💰 ${value} ${code} ≈ ${result.toFixed(2)} RUB. По данным ЦБ РФ.`
    );
  } catch (error) {
    console.error('Ошибка конвертации:', error.message);
    client.say(`#${CHANNEL}`, 'Не удалось выполнить конвертацию.');
  }
}

// ==================== ПОГОДА ====================

async function weatherCommand(username, city) {
  if (!city) {
    client.say(`#${CHANNEL}`, `@${username}, напиши город. Пример: !погода Москва`);
    return;
  }

  try {
    const response = await axios.get(
      `https://wttr.in/${encodeURIComponent(city)}`,
      {
        params: {
          format: 'j1',
          lang: 'ru'
        },
        timeout: 12000
      }
    );

    const current = response.data.current_condition?.[0];

    if (!current) {
      throw new Error('Нет данных о погоде');
    }

    const description =
      current.lang_ru?.[0]?.value ||
      current.weatherDesc?.[0]?.value ||
      'Нет описания';

    const temp = current.temp_C;
    const feels = current.FeelsLikeC;
    const humidity = current.humidity;
    const wind = current.windspeedKmph;

    client.say(
      `#${CHANNEL}`,
      `🌤️ ${city}: ${description}, температура ${temp}°C, ощущается как ${feels}°C, влажность ${humidity}%, ветер ${wind} км/ч.`
    );
  } catch (error) {
    console.error('Ошибка погоды:', error.message);
    client.say(`#${CHANNEL}`, `@${username}, не удалось получить погоду для ${city}.`);
  }
}

// ==================== ВРЕМЯ В ГОРОДАХ ====================

const cityTimeZones = {
  'москва': 'Europe/Moscow',
  'санкт-петербург': 'Europe/Moscow',
  'казань': 'Europe/Moscow',
  'набережные челны': 'Europe/Moscow',
  'киров': 'Europe/Kirov',
  'екатеринбург': 'Asia/Yekaterinburg',
  'челябинск': 'Asia/Yekaterinburg',
  'уфа': 'Asia/Yekaterinburg',
  'пермь': 'Asia/Yekaterinburg',
  'омск': 'Asia/Omsk',
  'новосибирск': 'Asia/Novosibirsk',
  'красноярск': 'Asia/Krasnoyarsk',
  'иркутск': 'Asia/Irkutsk',
  'якутск': 'Asia/Yakutsk',
  'владивосток': 'Asia/Vladivostok',
  'магадан': 'Asia/Magadan',
  'камчатка': 'Asia/Kamchatka',
  'калининград': 'Europe/Kaliningrad',
  'минск': 'Europe/Minsk',
  'киев': 'Europe/Kyiv',
  'варшава': 'Europe/Warsaw',
  'берлин': 'Europe/Berlin',
  'лондон': 'Europe/London',
  'париж': 'Europe/Paris',
  'рим': 'Europe/Rome',
  'мадрид': 'Europe/Madrid',
  'стамбул': 'Europe/Istanbul',
  'нью-йорк': 'America/New_York',
  'лос-анджелес': 'America/Los_Angeles',
  'чикаго': 'America/Chicago',
  'торонто': 'America/Toronto',
  'дубай': 'Asia/Dubai',
  'токио': 'Asia/Tokyo',
  'пекин': 'Asia/Shanghai',
  'шанхай': 'Asia/Shanghai',
  'сеул': 'Asia/Seoul',
  'бангкок': 'Asia/Bangkok',
  'сингапур': 'Asia/Singapore',
  'алматы': 'Asia/Almaty',
  'астана': 'Asia/Almaty',
  'ташкент': 'Asia/Tashkent'
};

function timeCommand(username, city) {
  if (!city) {
    client.say(`#${CHANNEL}`, `@${username}, укажи город. Пример: !время Москва`);
    return;
  }

  const key = city.toLowerCase().trim();
  const timeZone = cityTimeZones[key];

  if (!timeZone) {
    client.say(
      `#${CHANNEL}`,
      `@${username}, город пока отсутствует в списке часовых поясов.`
    );
    return;
  }

  try {
    const now = new Date();

    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    const date = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(now);

    client.say(`#${CHANNEL}`, `🕒 ${city}: ${time}, ${date}.`);
  } catch (error) {
    console.error('Ошибка времени:', error.message);
    client.say(`#${CHANNEL}`, 'Не удалось определить время.');
  }
}

// ==================== ПОМОЩЬ ====================

function helpCommand() {
  client.say(
    `#${CHANNEL}`,
    '📚 Команды: !профиль, !баланс, !рыбалка, !ежедневно, !магазин, !купить улучшенную, !купить золотую, !топ, !топрыбаки, !погода город, !время город, !курс USD, !конверт 100 USD, !перевод текст, !на английский текст.'
  );
}

// ==================== ЗАЩИТА ОТ СПАМА ====================

const commandCooldowns = new Map();

function isOnCooldown(username, command, cooldown = 1500) {
  const key = `${username}:${command}`;
  const now = Date.now();
  const last = commandCooldowns.get(key) || 0;

  if (now - last < cooldown) {
    return true;
  }

  commandCooldowns.set(key, now);
  return false;
}

// ==================== ОБРАБОТКА СООБЩЕНИЙ ====================

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const username = (tags.username || '').toLowerCase();

  if (!username || IGNORED_USERS.has(username)) {
    return;
  }

  const text = message.trim();

  if (!text) return;

  // Автоматический перевод обычных сообщений
  if (!text.startsWith('!')) {
    await autoTranslateToRussian(username, text);
    return;
  }

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (isOnCooldown(username, command)) {
    return;
  }

  try {
    switch (command) {
      case '!помощь':
      case '!help':
        helpCommand();
        break;

      case '!профиль':
      case '!profile':
        profileCommand(username);
        break;

      case '!баланс':
      case '!balance':
        balanceCommand(username);
        break;

      case '!рыбалка':
      case '!рыба':
      case '!fish':
        fishCommand(username);
        break;

      case '!ежедневно':
      case '!daily':
        dailyCommand(username);
        break;

      case '!магазин':
      case '!shop':
        shopCommand(username);
        break;

      case '!купить':
      case '!buy':
        if (!args[0]) {
          client.say(`#${CHANNEL}`, `@${username}, напиши !купить улучшенную или !купить золотую.`);
        } else {
          buyRodCommand(username, args.join(' '));
        }
        break;

      case '!топ':
      case '!top':
        topCommand();
        break;

      case '!топрыбаки':
      case '!fishtop':
        fishTopCommand();
        break;

      case '!погода':
      case '!weather':
        await weatherCommand(username, args.join(' '));
        break;

      case '!время':
      case '!time':
        timeCommand(username, args.join(' '));
        break;

      case '!курс':
      case '!rate':
        if (!args[0]) {
          client.say(`#${CHANNEL}`, `@${username}, пример: !курс USD`);
        } else {
          await currencyCommand(username, args[0]);
        }
        break;

      case '!конверт':
      case '!money':
        if (args.length < 2) {
          client.say(`#${CHANNEL}`, `@${username}, пример: !конверт 100 USD`);
        } else {
          await convertCommand(username, args[0], args[1]);
        }
        break;

      case '!перевод':
      case '!translate':
        if (!args.length) {
          client.say(`#${CHANNEL}`, `@${username}, пример: !перевод Hello, how are you?`);
        } else {
          await manualTranslateCommand(username, args.join(' '));
        }
        break;

      case '!на':
        if (args.length < 2) {
          client.say(`#${CHANNEL}`, `@${username}, пример: !на английский Привет, как дела?`);
        } else {
          const language = args[0];
          const translationText = args.slice(1).join(' ');
          await translateFromRussianCommand(username, language, translationText);
        }
        break;

      default:
        break;
    }
  } catch (error) {
    console.error(`Ошибка команды ${command}:`, error);
  }
});

// ==================== ПОДКЛЮЧЕНИЕ ====================

loadProfiles();

client.on('connected', (address, port) => {
  console.log(`Подключено к Twitch: ${address}:${port}`);
  console.log(`Бот работает в канале ${CHANNEL}`);
});

client.on('disconnected', reason => {
  console.log('Отключение от Twitch:', reason);
});

client.on('notice', (channel, msgid, message) => {
  console.log('Twitch notice:', msgid, message);
});

client.on('error', error => {
  console.error('Ошибка Twitch:', error);
});

client.connect().catch(error => {
  console.error('Не удалось подключиться к Twitch:', error);
});

// Сохраняем профили при штатном завершении
process.on('SIGINT', () => {
  saveProfiles();
  client.disconnect().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  saveProfiles();
  client.disconnect().finally(() => process.exit(0));
});
