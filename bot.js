const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');

// =====================================
// RENDER SERVER
// =====================================

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Twitch Bot is running!');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP сервер запущен на порту ${PORT}`);
});

// =====================================
// TWITCH SETTINGS
// =====================================

const TWITCH_OAUTH = (process.env.TWITCH_OAUTH || '').trim();

if (!TWITCH_OAUTH) {
  console.error('Не задан TWITCH_OAUTH в Render!');
  process.exit(1);
}

const client = new tmi.Client({
  options: {
    debug: true
  },
  connection: {
    reconnect: true,
    secure: true
  },
  identity: {
    username: 'cgamer_bot',
    password: TWITCH_OAUTH.startsWith('oauth:')
      ? TWITCH_OAUTH
      : `oauth:${TWITCH_OAUTH}`
  },
  channels: ['cgamer__']
});

// =====================================
// HELPERS
// =====================================

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

async function safeSay(channel, message) {
  try {
    await client.say(channel, message);
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error.message);
  }
}

const ignoredUsers = new Set([
  'cgamer_bot',
  'nightbot',
  'streamelements',
  'moobot',
  'sery_bot',
  'jeetbot'
]);

// =====================================
// TIME
// =====================================

const timeZones = {
  'москва': 'Europe/Moscow',
  'москве': 'Europe/Moscow',
  'мск': 'Europe/Moscow',
  'казань': 'Europe/Moscow',
  'казани': 'Europe/Moscow',
  'набережные челны': 'Europe/Moscow',
  'набережных челнах': 'Europe/Moscow',
  'челны': 'Europe/Moscow',
  'санкт петербург': 'Europe/Moscow',
  'питер': 'Europe/Moscow',
  'екатеринбург': 'Asia/Yekaterinburg',
  'новосибирск': 'Asia/Novosibirsk',
  'омск': 'Asia/Omsk',
  'лондон': 'Europe/London',
  'париж': 'Europe/Paris',
  'берлин': 'Europe/Berlin',
  'варшава': 'Europe/Warsaw',
  'нью йорк': 'America/New_York',
  'лос анджелес': 'America/Los_Angeles',
  'токио': 'Asia/Tokyo'
};

function getTime(city) {
  const key = normalizeText(city).toLowerCase();
  const zone = timeZones[key];

  if (!zone) return null;

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

// =====================================
// CURRENCY
// =====================================

const currencyDict = {
  'доллар': 'USD',
  'доллара': 'USD',
  'долларов': 'USD',
  'бакс': 'USD',
  'баксов': 'USD',
  'usd': 'USD',

  'евро': 'EUR',
  'eur': 'EUR',

  'рубль': 'RUB',
  'рубля': 'RUB',
  'рублей': 'RUB',
  'руб': 'RUB',
  'rub': 'RUB',

  'фунт': 'GBP',
  'фунта': 'GBP',
  'фунтов': 'GBP',
  'gbp': 'GBP',

  'юань': 'CNY',
  'юаня': 'CNY',
  'юаней': 'CNY',
  'cny': 'CNY',

  'тенге': 'KZT',
  'kzt': 'KZT'
};

function currencyCode(value) {
  const key = normalizeText(value).toLowerCase();
  return currencyDict[key] || key.toUpperCase();
}

let cbrCache = null;
let cbrCacheTime = 0;

async function getCBRRates() {
  const now = Date.now();

  if (cbrCache && now - cbrCacheTime < 10 * 60 * 1000) {
    return cbrCache;
  }

  try {
    const response = await axios.get(
      'https://www.cbr-xml-daily.ru/daily_json.js',
      { timeout: 10000 }
    );

    cbrCache = response.data;
    cbrCacheTime = now;

    return cbrCache;
  } catch (error) {
    console.error('Ошибка курсов валют:', error.message);
    return cbrCache;
  }
}

async function convertMoney(amount, from, to) {
  const rates = await getCBRRates();

  if (!rates) return null;

  const fromCode = currencyCode(from);
  const toCode = currencyCode(to);

  if (fromCode === toCode) return Number(amount);

  function rubValue(code) {
    if (code === 'RUB') return 1;

    const item = rates.Valute?.[code];

    if (!item) return null;

    return Number(item.Value) / Number(item.Nominal);
  }

  const fromRub = rubValue(fromCode);
  const toRub = rubValue(toCode);

  if (fromRub === null || toRub === null) return null;

  return Number(amount) * fromRub / toRub;
}

// =====================================
// WEATHER
// =====================================

const weatherCache = new Map();

async function getWeather(city) {
  const cityName = normalizeText(city);

  if (!cityName) return null;

  const key = cityName.toLowerCase();
  const cached = weatherCache.get(key);

  if (cached && Date.now() - cached.time < 10 * 60 * 1000) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `https://wttr.in/${encodeURIComponent(cityName)}`,
      {
        params: { format: 'j1' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      }
    );

    const current = response.data?.current_condition?.[0];

    if (!current) return null;

    const data = {
      city: cityName,
      temp: current.temp_C,
      feels: current.FeelsLikeC,
      humidity: current.humidity,
      wind: current.windspeedKmph
    };

    weatherCache.set(key, {
      time: Date.now(),
      data
    });

    return data;
  } catch (error) {
    console.error('Ошибка погоды:', error.message);

    if (cached) return cached.data;

    return null;
  }
}

// =====================================
// TRANSLATION
// =====================================

const supportedLanguages = new Set([
  'ru', 'en', 'de', 'fr', 'es',
  'it', 'pl', 'uk', 'tr', 'ja',
  'ko', 'zh'
]);

const translationCache = new Map();

async function translateText(target, text) {
  target = String(target || '').trim().toLowerCase();
  text = normalizeText(text);

  if (!supportedLanguages.has(target) || !text) {
    return null;
  }

  if (text.length > 500) {
    text = text.slice(0, 500);
  }

  const cacheKey = `${target}:${text.toLowerCase()}`;

  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  try {
    const response = await axios.get(
      'https://api.mymemory.translated.net/get',
      {
        params: {
          q: text,
          langpair: `ru|${target}`
        },
        timeout: 15000
      }
    );

    const translated = response.data?.responseData?.translatedText;

    if (!translated) return null;

    translationCache.set(cacheKey, translated);

    if (translationCache.size > 500) {
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
    }

    return translated;
  } catch (error) {
    console.error('Ошибка перевода:', error.message);
    return null;
  }
}

// =====================================
// FISHING GAME
// =====================================

const fishingResults = [
  { text: '🐟 Поймал карася! Хороший улов!', weight: 10 },
  { text: '🐠 Поймал окуня!', weight: 10 },
  { text: '🐡 Поймал леща!', weight: 10 },
  { text: '🐟 Поймал плотву!', weight: 10 },
  { text: '🎣 Поймал щуку!', weight: 8 },
  { text: '🐟 Поймал большого сома!', weight: 5 },
  { text: '🐬 Неожиданно! Попался дельфин. Отпустил обратно!', weight: 2 },
  { text: '💎 На крючке оказался сундук с сокровищами!', weight: 2 },
  { text: '🍀 Золотая рыбка! Невероятная удача!', weight: 1 },
  { text: '🐟 Двойной улов! Сразу две рыбки!', weight: 5 },
  { text: '🌿 Поймал водоросли...', weight: 8 },
  { text: '🪨 Вытащил камень. Зато тяжёлый!', weight: 5 },
  { text: '🥾 Вместо рыбы вытащил старый сапог 😂', weight: 5 },
  { text: '🌊 Рыба сорвалась с крючка!', weight: 7 },
  { text: '🎣 Сегодня клёва нет. Попробуй ещё раз!', weight: 7 },
  { text: '🦈 Что-то огромное потянуло леску и скрылось!', weight: 2 },
  { text: '💦 Поплавок ушёл под воду, но рыбы нет!', weight: 3 }
];

function fishing() {
  const totalWeight = fishingResults.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  let random = Math.random() * totalWeight;

  for (const item of fishingResults) {
    random -= item.weight;

    if (random <= 0) {
      return item.text;
    }
  }

  return '🌊 Сегодня без улова!';
}

// Защита от слишком частого использования рыбалки
const fishingCooldown = new Map();
const FISHING_COOLDOWN_MS = 15000;

// =====================================
// COMMAND HANDLER
// =====================================

async function handleCommand(channel, username, message) {
  const parts = message.trim().split(/\s+/);
  const command = parts[0].toLowerCase();

  // HELP
  if (command === '!помощь' || command === '!help') {
    await safeSay(
      channel,
      '🤖 Команды: !время город | !погода город | !курс USD | !деньги 100 доллар рубль | !перевод en текст | !рыбалка'
    );
    return true;
  }

  // TIME
  if (command === '!время' || command === '!time') {
    const city = parts.slice(1).join(' ');

    if (!city) {
      await safeSay(channel, '🕐 Использование: !время Казань');
      return true;
    }

    const time = getTime(city);

    if (!time) {
      await safeSay(channel, `❌ Город "${city}" не найден.`);
      return true;
    }

    await safeSay(channel, `🕐 Время в ${city}: ${time}`);
    return true;
  }

  // WEATHER
  if (command === '!погода' || command === '!weather') {
    const city = parts.slice(1).join(' ');

    if (!city) {
      await safeSay(
        channel,
        '🌤️ Использование: !погода Набережные Челны'
      );
      return true;
    }

    const weather = await getWeather(city);

    if (!weather) {
      await safeSay(
        channel,
        '⚠️ Не удалось получить погоду. Попробуйте позже.'
      );
      return true;
    }

    await safeSay(
      channel,
      `🌤️ ${weather.city}: ${weather.temp}°C, ощущается ${weather.feels}°C, влажность ${weather.humidity}%, ветер ${weather.wind} км/ч`
    );

    return true;
  }

  // CURRENCY RATE
  if (command === '!курс' || command === '!rate') {
    const code = currencyCode(parts[1] || 'USD');
    const rates = await getCBRRates();

    if (!rates) {
      await safeSay(channel, '⚠️ Не удалось получить курсы валют.');
      return true;
    }

    if (code === 'RUB') {
      await safeSay(channel, '💰 1 RUB = 1 RUB');
      return true;
    }

    const item = rates.Valute?.[code];

    if (!item) {
      await safeSay(channel, `❌ Валюта ${code} не найдена.`);
      return true;
    }

    const value = Number(item.Value) / Number(item.Nominal);

    await safeSay(
      channel,
      `💰 1 ${code} = ${value.toFixed(2)} RUB`
    );

    return true;
  }

  // MONEY CONVERSION
  if (command === '!деньги' || command === '!money') {
    if (parts.length < 4) {
      await safeSay(
        channel,
        '💰 Использование: !деньги 100 доллар рубль'
      );
      return true;
    }

    const amount = Number(parts[1]);

    if (!Number.isFinite(amount) || amount <= 0) {
      await safeSay(channel, '❌ Укажите правильную сумму.');
      return true;
    }

    const from = parts[2];
    const to = parts[3];

    const result = await convertMoney(amount, from, to);

    if (result === null) {
      await safeSay(
        channel,
        '❌ Не удалось выполнить конвертацию.'
      );
      return true;
    }

    await safeSay(
      channel,
      `💱 ${amount} ${currencyCode(from)} ≈ ${result.toFixed(2)} ${currencyCode(to)}`
    );

    return true;
  }

  // TRANSLATION
  if (command === '!перевод' || command === '!translate') {
    if (parts.length < 3) {
      await safeSay(
        channel,
        '🌐 Использование: !перевод en Привет как дела'
      );
      return true;
    }

    const target = parts[1];
    const text = parts.slice(2).join(' ');

    const translated = await translateText(target, text);

    if (!translated) {
      await safeSay(channel, '⚠️ Не удалось выполнить перевод.');
      return true;
    }

    await safeSay(channel, `🌐 ${translated}`);
    return true;
  }

  // FISHING
  if (
    command === '!рыбалка' ||
    command === '!рыба' ||
    command === '!fish'
  ) {
    const now = Date.now();
    const lastUse = fishingCooldown.get(username) || 0;
    const remaining = FISHING_COOLDOWN_MS - (now - lastUse);

    if (remaining > 0) {
      await safeSay(
        channel,
        `🎣 ${username}, подожди ${Math.ceil(remaining / 1000)} сек. перед следующей рыбалкой!`
      );
      return true;
    }

    fishingCooldown.set(username, now);

    const result = fishing();

    await safeSay(
      channel,
      `🎣 ${username} закинул удочку! ${result}`
    );

    return true;
  }

  return false;
}

// =====================================
// TWITCH MESSAGE
// =====================================

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const username = (tags.username || '').toLowerCase();

  if (ignoredUsers.has(username)) return;

  const text = normalizeText(message);

  if (!text || !text.startsWith('!')) return;

  console.log(`Команда от ${username}: ${text}`);

  try {
    await handleCommand(channel, username, text);
  } catch (error) {
    console.error('Ошибка команды:', error.message);

    await safeSay(
      channel,
      '⚠️ Произошла ошибка при выполнении команды.'
    );
  }
});

// =====================================
// TWITCH EVENTS
// =====================================

client.on('connected', (address, port) => {
  console.log(`Подключено к Twitch: ${address}:${port}`);
  console.log('================================');
  console.log('TWITCH BOT ПОДКЛЮЧЁН!');
  console.log('Канал: cgamer__');
  console.log('Погода включена');
  console.log('Валюты включены');
  console.log('Время включено');
  console.log('Перевод включён');
  console.log('Рыбалка включена');
  console.log('================================');
});

client.on('join', (channel, username, self) => {
  if (self) {
    console.log(`Бот вошёл в канал ${channel}`);
  }
});

client.on('disconnected', reason => {
  console.log(`Twitch отключён: ${reason}`);
});

client.on('reconnect', () => {
  console.log('Переподключение к Twitch...');
});

// =====================================
// GLOBAL ERRORS
// =====================================

process.on('unhandledRejection', error => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

// =====================================
// CONNECT
// =====================================

client.connect().catch(error => {
  console.error('Ошибка подключения к Twitch:', error);
});
