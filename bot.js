
'use strict';

const tmi = require('tmi.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ==================================================
// НАСТРОЙКИ
// ==================================================

const BOT_USERNAME = 'cgamer_bot';
const CHANNEL = 'cgamer__';
const OAUTH = process.env.TWITCH_OAUTH;

const PORT = Number(process.env.PORT) || 10000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'fish_data.json');

const FISH_COOLDOWN = 15 * 1000;
const COMMAND_COOLDOWN = 1500;

const MAX_TRANSLATE_LENGTH = 450;
const MAX_CHAT_OUTPUT = 350;

const AUTO_TRANSLATE_COOLDOWN = 12000;
const MANUAL_TRANSLATE_COOLDOWN = 5000;

const TRANSLATION_INTERVAL = 1500;
const TRANSLATION_QUEUE_LIMIT = 25;
const TRANSLATION_CACHE_LIMIT = 1000;
const TRANSLATION_CACHE_TTL = 6 * 60 * 60 * 1000;

const TRANSLATION_ERROR_PAUSE = 60000;

const IGNORED_USERS = new Set([
  'cgamer_bot',
  'nightbot',
  'streamelements',
  'moobot',
  'sery_bot',
  'jeetbot'
]);

let isShuttingDown = false;

if (!OAUTH) {
  console.error('ОШИБКА: добавь TWITCH_OAUTH в переменные окружения Render.');
  process.exit(1);
}

// ==================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value) {
  return Number(value).toLocaleString('ru-RU');
}

// ==================================================
// HTTP-СЕРВЕР
// ==================================================

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8'
    });

    res.end('cgamer_bot is online');
    return;
  }

  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8'
  });

  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP-сервер запущен на порту ${PORT}`);
});

// ==================================================
// TWITCH
// ==================================================

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

const TWITCH_CHANNEL = `#${CHANNEL}`;

// ==================================================
// ОТПРАВКА СООБЩЕНИЙ
// ==================================================

function say(message) {
  const text = cleanText(message);

  if (!text || isShuttingDown) return;

  client.say(TWITCH_CHANNEL, text.slice(0, 450))
    .catch(error => {
      console.error('Ошибка отправки сообщения:', error.message);
    });
}

// ==================================================
// ПРОФИЛИ И СОХРАНЕНИЕ
// ==================================================

let profiles = {};

function createProfile() {
  return {
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
}

function normalizeProfile(profile) {
  if (
    !profile ||
    typeof profile !== 'object' ||
    Array.isArray(profile)
  ) {
    return createProfile();
  }

  const defaults = createProfile();

  for (const key of Object.keys(defaults)) {
    if (profile[key] === undefined || profile[key] === null) {
      profile[key] = defaults[key];
    }
  }

  profile.coins = Math.max(0, safeNumber(profile.coins));
  profile.xp = Math.max(0, safeNumber(profile.xp));
  profile.level = Math.max(1, Math.floor(safeNumber(profile.level, 1)));

  profile.fish = Math.max(0, safeNumber(profile.fish));
  profile.rareFish = Math.max(0, safeNumber(profile.rareFish));
  profile.legendaryFish = Math.max(0, safeNumber(profile.legendaryFish));
  profile.totalCatches = Math.max(0, safeNumber(profile.totalCatches));

  profile.lastFish = Math.max(0, safeNumber(profile.lastFish));

  if (!['Обычная', 'Улучшенная', 'Золотая'].includes(profile.rod)) {
    profile.rod = 'Обычная';
  }

  profile.lastDaily = String(profile.lastDaily || '');

  return profile;
}

function loadProfiles() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), {
      recursive: true
    });

    if (!fs.existsSync(DATA_FILE)) {
      profiles = {};
      console.log('Файл профилей отсутствует. Будет создан новый.');
      return;
    }

    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('Неверный формат файла профилей');
    }

    profiles = parsed;

    for (const username of Object.keys(profiles)) {
      profiles[username] = normalizeProfile(profiles[username]);
    }

    console.log(`Загружено профилей: ${Object.keys(profiles).length}`);

  } catch (error) {
    console.error('Ошибка загрузки профилей:', error.message);

    const backupFile = `${DATA_FILE}.corrupted-${Date.now()}`;

    try {
      if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, backupFile);
        console.log(`Резервная копия: ${backupFile}`);
      }
    } catch (backupError) {
      console.error('Ошибка резервного копирования:', backupError.message);
    }

    profiles = {};
  }
}

function saveProfiles() {
  try {
    const directory = path.dirname(DATA_FILE);

    fs.mkdirSync(directory, {
      recursive: true
    });

    const tempFile = `${DATA_FILE}.${process.pid}.tmp`;

    fs.writeFileSync(
      tempFile,
      JSON.stringify(profiles, null, 2),
      'utf8'
    );

    fs.renameSync(tempFile, DATA_FILE);

  } catch (error) {
    console.error('Ошибка сохранения профилей:', error.message);
  }
}

function getProfile(username) {
  const name = cleanText(username).toLowerCase();

  if (!name) {
    throw new Error('Не удалось определить пользователя.');
  }

  if (!Object.prototype.hasOwnProperty.call(profiles, name)) {
    profiles[name] = createProfile();
    saveProfiles();
  }

  profiles[name] = normalizeProfile(profiles[name]);

  return profiles[name];
}

// ==================================================
// ОПЫТ И УРОВНИ
// ==================================================

function addXP(username, amount) {
  const profile = getProfile(username);
  const xpAmount = Math.max(0, Math.floor(safeNumber(amount)));

  if (!xpAmount) return;

  profile.xp += xpAmount;

  let leveledUp = false;

  while (profile.xp >= profile.level * 100) {
    profile.xp -= profile.level * 100;
    profile.level++;
    leveledUp = true;
  }

  saveProfiles();

  if (leveledUp) {
    say(`🎉 @${username}, новый уровень! Теперь у тебя ${profile.level}-й уровень!`);
  }
}

// ==================================================
// РЫБА И УДОЧКИ
// ==================================================

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
  'Обычная': { price: 0, bonus: 0 },
  'Улучшенная': { price: 500, bonus: 5 },
  'Золотая': { price: 1500, bonus: 12 }
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

    if (random < 0) return fish;
  }

  return adjusted[0];
}

function fishCommand(username) {
  const profile = getProfile(username);
  const now = Date.now();

  const remaining = FISH_COOLDOWN - (now - profile.lastFish);

  if (remaining > 0) {
    say(`🎣 @${username}, подожди ${Math.ceil(remaining / 1000)} сек. перед следующей рыбалкой.`);
    return;
  }

  profile.lastFish = now;

  const fish = getRandomFish(profile.rod);

  profile.coins += fish.coins;
  profile.fish++;
  profile.totalCatches++;

  if (fish.rarity === 'редкая') profile.rareFish++;
  if (fish.rarity === 'легендарная') profile.legendaryFish++;

  addXP(username, fish.xp);
  saveProfiles();

  say(`🎣 @${username} поймал ${fish.name}! Редкость: ${fish.rarity}. +${fish.coins} монет, +${fish.xp} XP.`);
}

// ==================================================
// ЕЖЕДНЕВНАЯ НАГРАДА
// ==================================================

function dailyCommand(username) {
  const profile = getProfile(username);

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  if (profile.lastDaily === today) {
    say(`🎁 @${username}, ты уже получил ежедневную награду сегодня.`);
    return;
  }

  const reward = 100;

  profile.coins += reward;
  profile.lastDaily = today;

  saveProfiles();

  say(`🎁 @${username}, ежедневная награда: +${reward} монет! Баланс: ${profile.coins}.`);
}

// ==================================================
// МАГАЗИН
// ==================================================

function shopCommand() {
  say('🛒 Магазин: Обычная — бесплатно; Улучшенная — 500 монет; Золотая — 1500 монет. Покупка: !купить улучшенная или !купить золотая.');
}

function buyRodCommand(username, rodName) {
  const profile = getProfile(username);
  const normalized = cleanText(rodName).toLowerCase();

  let rod;

  if (normalized === 'улучшенная') {
    rod = 'Улучшенная';
  } else if (normalized === 'золотая') {
    rod = 'Золотая';
  } else {
    say(`@${username}, такой удочки нет. Используй !магазин.`);
    return;
  }

  if (profile.rod === rod) {
    say(`@${username}, у тебя уже есть удочка «${rod}».`);
    return;
  }

  const price = rods[rod].price;

  if (profile.coins < price) {
    say(`@${username}, недостаточно монет. Нужно ${price}, у тебя ${profile.coins}.`);
    return;
  }

  profile.coins -= price;
  profile.rod = rod;

  saveProfiles();

  say(`🎣 @${username}, ты купил удочку «${rod}» за ${price} монет!`);
}

// ==================================================
// ПРОФИЛЬ И БАЛАНС
// ==================================================

function profileCommand(username) {
  const p = getProfile(username);

  say(`👤 @${username}: уровень ${p.level}, XP ${p.xp}/${p.level * 100}, монеты ${p.coins}, рыба ${p.fish}, редкая ${p.rareFish}, легендарная ${p.legendaryFish}, всего уловов ${p.totalCatches}, удочка ${p.rod}.`);
}

function balanceCommand(username) {
  const p = getProfile(username);

  say(`💰 @${username}, баланс: ${p.coins} монет. Уровень: ${p.level}. XP: ${p.xp}/${p.level * 100}.`);
}

// ==================================================
// РЕЙТИНГИ
// ==================================================

function topCommand() {
  const top = Object.entries(profiles)
    .map(([name, p]) => [name, normalizeProfile(p)])
    .sort((a, b) => b[1].coins - a[1].coins)
    .slice(0, 5);

  if (!top.length) {
    say('Пока нет игроков в рейтинге.');
    return;
  }

  const result = top.map(([name, p], i) =>
    `${i + 1}. ${name} — ${p.coins} монет`
  );

  say(`🏆 ТОП БОГАЧЕЙ: ${result.join(' | ')}`);
}

function fishTopCommand() {
  const top = Object.entries(profiles)
    .map(([name, p]) => [name, normalizeProfile(p)])
    .sort((a, b) => b[1].totalCatches - a[1].totalCatches)
    .slice(0, 5);

  if (!top.length) {
    say('Пока нет рыбаков в рейтинге.');
    return;
  }

  const result = top.map(([name, p], i) =>
    `${i + 1}. ${name} — ${p.totalCatches} уловов`
  );

  say(`🎣 ТОП РЫБАКОВ: ${result.join(' | ')}`);
}

// ==================================================
// ЯЗЫКИ
// ==================================================

const languages = {
  'английский': 'en',
  'английский язык': 'en',
  'немецкий': 'de',
  'немецкий язык': 'de',
  'французский': 'fr',
  'французский язык': 'fr',
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
  const key = cleanText(value).toLowerCase();
  return languages[key] || key;
}

function parseLanguageAndText(args) {
  const original = args.join(' ').trim();
  const normalized = original.toLowerCase();

  const names = Object.keys(languages)
    .sort((a, b) => b.length - a.length);

  for (const name of names) {
    if (normalized.startsWith(name + ' ')) {
      return {
        language: name,
        message: original.slice(name.length).trim()
      };
    }
  }

  if (args.length >= 2) {
    return {
      language: args[0],
      message: args.slice(1).join(' ').trim()
    };
  }

  return null;
}

// ==================================================
// ПЕРЕВОДЧИК: КЭШ И ОЧЕРЕДЬ
// ==================================================

const translationCache = new Map();
const translationInflight = new Map();
const translationQueue = [];

let translationWorkerRunning = false;
let lastTranslationRequest = 0;
let translationPauseUntil = 0;

function decodeTranslation(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function getTranslationCache(key) {
  const item = translationCache.get(key);

  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    translationCache.delete(key);
    return null;
  }

  return item.value;
}

function setTranslationCache(key, value) {
  if (translationCache.size >= TRANSLATION_CACHE_LIMIT) {
    const oldestKey = translationCache.keys().next().value;

    if (oldestKey) translationCache.delete(oldestKey);
  }

  translationCache.set(key, {
    value,
    expiresAt: Date.now() + TRANSLATION_CACHE_TTL
  });
}

function getRetryPause(error) {
  const retryAfter = error.response?.headers?.['retry-after'];

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 5 * 60 * 1000);
    }
  }

  return TRANSLATION_ERROR_PAUSE;
}

async function requestTranslation(text, from, to) {
  const response = await axios.get(
    'https://api.mymemory.translated.net/get',
    {
      params: {
        q: text,
        langpair: `${from}|${to}`
      },
      timeout: 12000,
      headers: {
        'User-Agent': 'cgamer_bot/1.0'
      }
    }
  );

  if (response.data?.responseStatus !== 200) {
    const error = new Error(
      response.data?.responseDetails || 'Ошибка сервиса перевода'
    );

    if (Number(response.data?.responseStatus) === 429) {
      error.isRateLimit = true;
    }

    throw error;
  }

  const translated = decodeTranslation(
    response.data?.responseData?.translatedText
  ).trim();

  if (!translated) {
    throw new Error('Пустой ответ сервиса перевода');
  }

  return translated;
}

async function processTranslationQueue() {
  if (translationWorkerRunning) return;

  translationWorkerRunning = true;

  try {
    while (translationQueue.length > 0 && !isShuttingDown) {
      const job = translationQueue.shift();

      if (Date.now() < translationPauseUntil) {
        await sleep(translationPauseUntil - Date.now());
      }

      const waitTime = TRANSLATION_INTERVAL -
        (Date.now() - lastTranslationRequest);

      if (waitTime > 0) {
        await sleep(waitTime);
      }

      lastTranslationRequest = Date.now();

      try {
        const result = await requestTranslation(
          job.text,
          job.from,
          job.to
        );

        setTranslationCache(job.key, result);
        job.resolve(result);

      } catch (error) {
        const status = error.response?.status;

        if (status === 429 || error.isRateLimit) {
          translationPauseUntil = Date.now() + getRetryPause(error);

          console.warn(
            `MyMemory ограничил запросы. Пауза ${Math.ceil((translationPauseUntil - Date.now()) / 1000)} сек.`
          );

        } else {
          console.error('Ошибка перевода:', error.message);
        }

        job.resolve(null);
      }

      translationInflight.delete(job.key);
    }

  } finally {
    translationWorkerRunning = false;

    if (translationQueue.length > 0 && !isShuttingDown) {
      setTimeout(processTranslationQueue, 100);
    }
  }
}

function translateText(text, from, to) {
  const clean = cleanText(text);

  if (!clean || clean.length > MAX_TRANSLATE_LENGTH) {
    return Promise.resolve(null);
  }

  if (Buffer.byteLength(clean, 'utf8') > 450) {
    return Promise.resolve(null);
  }

  const key = `${from}|${to}|${clean.toLowerCase()}`;

  const cached = getTranslationCache(key);

  if (cached) {
    return Promise.resolve(cached);
  }

  if (translationInflight.has(key)) {
    return translationInflight.get(key);
  }

  if (translationQueue.length >= TRANSLATION_QUEUE_LIMIT) {
    console.warn('Очередь переводов заполнена.');
    return Promise.resolve(null);
  }

  let resolvePromise;

  const promise = new Promise(resolve => {
    resolvePromise = resolve;
  });

  translationInflight.set(key, promise);

  translationQueue.push({
    key,
    text: clean,
    from,
    to,
    resolve: resolvePromise
  });

  processTranslationQueue();

  return promise;
}

// ==================================================
// АВТОПЕРЕВОД
// ==================================================

const autoTranslateUsers = new Map();
const translatingUsers = new Set();

async function autoTranslateToRussian(username, message) {
  const now = Date.now();
  const last = autoTranslateUsers.get(username) || 0;

  if (now - last < AUTO_TRANSLATE_COOLDOWN) return;
  if (translatingUsers.has(username)) return;
  if (message.trim().length < 8) return;
  if (message.trim().startsWith('!')) return;

  autoTranslateUsers.set(username, now);
  translatingUsers.add(username);

  try {
    const translated = await translateText(
      message,
      'autodetect',
      'ru'
    );

    if (!translated) return;

    const normalized = translated.trim().toLowerCase();
    const original = message.trim().toLowerCase();

    if (normalized === original) return;

    say(`🌐 @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`);

  } finally {
    translatingUsers.delete(username);
  }
}

// ==================================================
// РУЧНОЙ ПЕРЕВОД НА РУССКИЙ
// ==================================================

const manualTranslateUsers = new Map();

async function manualTranslateCommand(username, message) {
  const now = Date.now();
  const last = manualTranslateUsers.get(username) || 0;

  if (now - last < MANUAL_TRANSLATE_COOLDOWN) {
    say(`@${username}, подожди немного перед следующим переводом.`);
    return;
  }

  if (message.length > MAX_TRANSLATE_LENGTH) {
    say(`@${username}, текст слишком длинный. Максимум ${MAX_TRANSLATE_LENGTH} символов.`);
    return;
  }

  manualTranslateUsers.set(username, now);

  const translated = await translateText(
    message,
    'autodetect',
    'ru'
  );

  if (!translated) {
    say(`@${username}, перевод временно недоступен. Попробуй позже.`);
    return;
  }

  say(`🌐 Перевод для @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`);
}

// ==================================================
// ПЕРЕВОД С РУССКОГО
// ==================================================

async function translateFromRussianCommand(username, language, message) {
  const lang = getLanguageCode(language);

  if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/i.test(lang)) {
    say(`@${username}, не удалось распознать язык.`);
    return;
  }

  if (message.length > MAX_TRANSLATE_LENGTH) {
    say(`@${username}, текст слишком длинный. Максимум ${MAX_TRANSLATE_LENGTH} символов.`);
    return;
  }

  const translated = await translateText(message, 'ru', lang);

  if (!translated) {
    say(`@${username}, перевод временно недоступен.`);
    return;
  }

  say(`🌍 Перевод для @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`);
}

// ==================================================
// ВАЛЮТЫ ЦБ РФ
// ==================================================

const currencyNames = {
  'доллар': 'USD',
  'долларов': 'USD',
  'доллара': 'USD',
  'доллар сша': 'USD',
  'usd': 'USD',
  'евро': 'EUR',
  'eur': 'EUR',
  'фунт': 'GBP',
  'фунтов': 'GBP',
  'фунта': 'GBP',
  'gbp': 'GBP',
  'юань': 'CNY',
  'юаней': 'CNY',
  'юаня': 'CNY',
  'cny': 'CNY',
  'лира': 'TRY',
  'лир': 'TRY',
  'лиры': 'TRY',
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

function getCurrencyCode(currency) {
  const value = cleanText(currency).toLowerCase();
  return currencyNames[value] || value.toUpperCase();
}

let currencyCache = null;
let currencyCacheTime = 0;

async function getCurrencyRates() {
  if (
    currencyCache &&
    Date.now() - currencyCacheTime < 10 * 60 * 1000
  ) {
    return currencyCache;
  }

  const response = await axios.get(
    'https://www.cbr-xml-daily.ru/daily_json.js',
    {
      timeout: 10000
    }
  );

  currencyCache = response.data.Valute;
  currencyCacheTime = Date.now();

  return currencyCache;
}

async function currencyCommand(username, currency) {
  const code = getCurrencyCode(currency);

  try {
    const rates = await getCurrencyRates();
    const item = rates[code];

    if (!item) {
      say(`@${username}, валюта ${code} не найдена в данных ЦБ РФ.`);
      return;
    }

    const rate = item.Value / item.Nominal;

    say(`💱 ${item.Name}: ${rate.toFixed(2)} RUB за 1 ${code}. По данным ЦБ РФ.`);

  } catch (error) {
    console.error('Ошибка курса валют:', error.message);
    say('Не удалось получить курс валют.');
  }
}

async function convertCommand(username, amount, currency) {
  const value = Number(String(amount).replace(',', '.'));
  const code = getCurrencyCode(currency);

  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1000000000
  ) {
    say(`@${username}, укажи корректную сумму.`);
    return;
  }

  try {
    const rates = await getCurrencyRates();
    const item = rates[code];

    if (!item) {
      say(`@${username}, валюта ${code} не найдена в данных ЦБ РФ.`);
      return;
    }

    const rate = item.Value / item.Nominal;
    const result = value * rate;

    say(`💰 ${formatNumber(value)} ${code} ≈ ${result.toFixed(2)} RUB. По данным ЦБ РФ.`);

  } catch (error) {
    console.error('Ошибка конвертации:', error.message);
    say('Не удалось выполнить конвертацию.');
  }
}

// ==================================================
// ПОГОДА
// ==================================================

async function weatherCommand(username, city) {
  city = cleanText(city);

  if (!city) {
    say(`@${username}, напиши город. Пример: !погода Москва`);
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

    say(`🌤️ ${city}: ${description}, температура ${current.temp_C}°C, ощущается как ${current.FeelsLikeC}°C, влажность ${current.humidity}%, ветер ${current.windspeedKmph} км/ч.`);

  } catch (error) {
    console.error('Ошибка погоды:', error.message);
    say(`@${username}, не удалось получить погоду для ${city}.`);
  }
}

// ==================================================
// ЧАСОВЫЕ ПОЯСА
// ==================================================

const cityTimeZones = {
  'москва': 'Europe/Moscow',
  'санкт-петербург': 'Europe/Moscow',
  'петербург': 'Europe/Moscow',
  'мурманск': 'Europe/Moscow',
  'архангельск': 'Europe/Moscow',
  'воронеж': 'Europe/Moscow',
  'ростов-на-дону': 'Europe/Moscow',
  'краснодар': 'Europe/Moscow',
  'сочи': 'Europe/Moscow',
  'волгоград': 'Europe/Volgograd',
  'самара': 'Europe/Samara',
  'ижевск': 'Europe/Samara',
  'ульяновск': 'Europe/Ulyanovsk',
  'саратов': 'Europe/Saratov',
  'астрахань': 'Europe/Astrakhan',
  'казань': 'Europe/Moscow',
  'набережные челны': 'Europe/Moscow',
  'киров': 'Europe/Kirov',
  'екатеринбург': 'Asia/Yekaterinburg',
  'челябинск': 'Asia/Yekaterinburg',
  'уфа': 'Asia/Yekaterinburg',
  'тюмень': 'Asia/Yekaterinburg',
  'ханты-мансийск': 'Asia/Yekaterinburg',
  'сургут': 'Asia/Yekaterinburg',
  'пермь': 'Asia/Yekaterinburg',
  'омск': 'Asia/Omsk',
  'барнаул': 'Asia/Barnaul',
  'кемерово': 'Asia/Novokuznetsk',
  'томск': 'Asia/Tomsk',
  'новосибирск': 'Asia/Novosibirsk',
  'красноярск': 'Asia/Krasnoyarsk',
  'иркутск': 'Asia/Irkutsk',
  'улан-удэ': 'Asia/Irkutsk',
  'чита': 'Asia/Chita',
  'якутск': 'Asia/Yakutsk',
  'владивосток': 'Asia/Vladivostok',
  'хабаровск': 'Asia/Vladivostok',
  'южно-сахалинск': 'Asia/Sakhalin',
  'магадан': 'Asia/Magadan',
  'камчатка': 'Asia/Kamchatka',
  'петропавловск-камчатский': 'Asia/Kamchatka',
  'калининград': 'Europe/Kaliningrad',

  'минск': 'Europe/Minsk',
  'киев': 'Europe/Kyiv',
  'варшава': 'Europe/Warsaw',
  'берлин': 'Europe/Berlin',
  'лондон': 'Europe/London',
  'амстердам': 'Europe/Amsterdam',
  'брюссель': 'Europe/Brussels',
  'лиссабон': 'Europe/Lisbon',
  'прага': 'Europe/Prague',
  'вена': 'Europe/Vienna',
  'цюрих': 'Europe/Zurich',
  'стокгольм': 'Europe/Stockholm',
  'хельсинки': 'Europe/Helsinki',
  'афины': 'Europe/Athens',
  'париж': 'Europe/Paris',
  'рим': 'Europe/Rome',
  'мадрид': 'Europe/Madrid',
  'стамбул': 'Europe/Istanbul',

  'нью-йорк': 'America/New_York',
  'лос-анджелес': 'America/Los_Angeles',
  'чикаго': 'America/Chicago',
  'торонто': 'America/Toronto',
  'ванкувер': 'America/Vancouver',
  'монреаль': 'America/Toronto',
  'мехико': 'America/Mexico_City',
  'сан-паулу': 'America/Sao_Paulo',
  'буэнос-айрес': 'America/Argentina/Buenos_Aires',

  'дубай': 'Asia/Dubai',
  'доха': 'Asia/Qatar',
  'эр-рияд': 'Asia/Riyadh',
  'дели': 'Asia/Kolkata',
  'мумбаи': 'Asia/Kolkata',
  'джакарта': 'Asia/Jakarta',
  'гонконг': 'Asia/Hong_Kong',
  'тайбэй': 'Asia/Taipei',
  'манила': 'Asia/Manila',
  'перт': 'Australia/Perth',
  'сидней': 'Australia/Sydney',
  'мельбурн': 'Australia/Melbourne',
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

// ==================================================
// ВРЕМЯ
// ==================================================

function timeCommand(username, city) {
  city = cleanText(city);

  if (!city) {
    say(`@${username}, укажи город. Пример: !время Москва`);
    return;
  }

  const key = city.toLowerCase();
  const timeZone = cityTimeZones[key];

  if (!timeZone) {
    say(`@${username}, город пока отсутствует в списке часовых поясов.`);
    return;
  }

  try {
    const now = new Date();

    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(now);

    const date = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(now);

    say(`🕒 ${city}: ${time}, ${date}.`);

  } catch (error) {
    console.error('Ошибка времени:', error.message);
    say('Не удалось определить время.');
  }
}

// ==================================================
// ПОМОЩЬ
// ==================================================

function helpCommand() {
  say('📚 Команды: !профиль, !баланс, !рыбалка, !ежедневно, !магазин, !купить улучшенная, !купить золотая, !топ, !топрыбаки, !погода город, !время город, !курс USD, !конверт 100 USD, !перевод текст, !на английский текст.');
}

// ==================================================
// ЗАЩИТА ОТ СПАМА
// ==================================================

const commandCooldowns = new Map();

function isOnCooldown(username, command, cooldown = COMMAND_COOLDOWN) {
  const key = `${username}:${command}`;
  const now = Date.now();
  const last = commandCooldowns.get(key) || 0;

  if (now - last < cooldown) {
    return true;
  }

  commandCooldowns.set(key, now);

  if (commandCooldowns.size > 5000) {
    for (const [oldKey, timestamp] of commandCooldowns) {
      if (now - timestamp > 60 * 60 * 1000) {
        commandCooldowns.delete(oldKey);
      }
    }
  }

  return false;
}

// ==================================================
// ОБРАБОТКА СООБЩЕНИЙ
// ==================================================

client.on('message', async (channel, tags, message, self) => {
  if (self || isShuttingDown) return;

  const username = String(tags.username || '').toLowerCase();

  if (!username || IGNORED_USERS.has(username)) return;

  const text = cleanText(message);

  if (!text || text.length > 500) return;

  if (String(channel).toLowerCase() !== TWITCH_CHANNEL.toLowerCase()) {
    return;
  }

  // Обычные сообщения: автоматический перевод
  if (!text.startsWith('!')) {
    autoTranslateToRussian(username, text).catch(error => {
      console.error('Ошибка автоперевода:', error.message);
    });

    return;
  }

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (isOnCooldown(username, command)) return;

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
        shopCommand();
        break;

      case '!купить':
      case '!buy':
        if (!args[0]) {
          say(`@${username}, напиши !купить улучшенная или !купить золотая.`);
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
          say(`@${username}, пример: !курс USD`);
        } else {
          await currencyCommand(username, args[0]);
        }
        break;

      case '!конверт':
      case '!money':
        if (args.length < 2) {
          say(`@${username}, пример: !конверт 100 USD`);
        } else {
          await convertCommand(username, args[0], args[1]);
        }
        break;

      case '!перевод':
      case '!translate':
        if (!args.length) {
          say(`@${username}, пример: !перевод Hello, how are you?`);
        } else {
          await manualTranslateCommand(username, args.join(' '));
        }
        break;

      case '!на':
        if (args.length < 2) {
          say(`@${username}, пример: !на английский Привет, как дела?`);
        } else {
          const parsed = parseLanguageAndText(args);

          if (!parsed || !parsed.message) {
            say(`@${username}, пример: !на английский язык Привет, как дела?`);
          } else {
            await translateFromRussianCommand(
              username,
              parsed.language,
              parsed.message
            );
          }
        }
        break;

      default:
        break;
    }

  } catch (error) {
    console.error(`Ошибка команды ${command}:`, error.message);
  }
});

// ==================================================
// ЗАПУСК
// ==================================================

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

// ==================================================
// ЗАВЕРШЕНИЕ РАБОТЫ
// ==================================================

function shutdown(signal) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`Получен ${signal}. Сохраняю данные и отключаю бота...`);

  saveProfiles();

  // Завершаем ожидающие переводы
  while (translationQueue.length > 0) {
    const job = translationQueue.shift();
    job.resolve(null);
    translationInflight.delete(job.key);
  }

  const forceExit = setTimeout(() => {
    process.exit(1);
  }, 10000);

  forceExit.unref();

  Promise.resolve()
    .then(() => client.disconnect())
    .catch(error => {
      console.error('Ошибка отключения Twitch:', error.message);
    })
    .finally(() => {
      server.close(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });

      setTimeout(() => {
        process.exit(0);
      }, 1500).unref();
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', error => {
  console.error('Критическая ошибка:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  console.error('Необработанная ошибка Promise:', reason);
});
