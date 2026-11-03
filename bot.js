
const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');

// ========================================
// RENDER HTTP SERVER
// ========================================

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Twitch Bot is running!');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
});

// ========================================
// TWITCH SETTINGS
// ========================================

const token = (process.env.TWITCH_OAUTH || '').trim();

if (!token) {
  console.error('❌ Не задан TWITCH_OAUTH в Render!');
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
    password: token.startsWith('oauth:')
      ? token
      : `oauth:${token}`
  },
  channels: ['cgamer__']
});

// ========================================
// COMMON FUNCTIONS
// ========================================

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeSay(channel, message) {
  try {
    if (!message) return;

    await client.say(
      channel,
      String(message).slice(0, 450)
    );
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error.message);
  }
}

// ========================================
// CURRENCY DICTIONARY
// ========================================

const currencyDict = {
  'рубль': 'RUB',
  'рубля': 'RUB',
  'рублей': 'RUB',
  'руб': 'RUB',
  'rub': 'RUB',

  'доллар': 'USD',
  'доллара': 'USD',
  'долларов': 'USD',
  'доллары': 'USD',
  'usd': 'USD',

  'евро': 'EUR',
  'eur': 'EUR',

  'фунт': 'GBP',
  'фунта': 'GBP',
  'фунтов': 'GBP',
  'gbp': 'GBP',

  'юань': 'CNY',
  'юаня': 'CNY',
  'юаней': 'CNY',
  'cny': 'CNY'
};

function getCurrency(value) {
  const key = normalize(value);
  return currencyDict[key] || key.toUpperCase();
}

// ========================================
// CITY TIMEZONES
// ========================================

const cities = {
  'москва': 'Europe/Moscow',
  'казань': 'Europe/Moscow',
  'набережные челны': 'Europe/Moscow',
  'челны': 'Europe/Moscow',

  'лондон': 'Europe/London',
  'берлин': 'Europe/Berlin',
  'варшава': 'Europe/Warsaw',
  'париж': 'Europe/Paris',
  'мадрид': 'Europe/Madrid',
  'рим': 'Europe/Rome',
  'амстердам': 'Europe/Amsterdam',
  'стамбул': 'Europe/Istanbul',

  'нью-йорк': 'America/New_York',
  'нью йорк': 'America/New_York',
  'new york': 'America/New_York',
  'чикаго': 'America/Chicago',
  'лос-анджелес': 'America/Los_Angeles',
  'лос анджелес': 'America/Los_Angeles',
  'вашингтон': 'America/New_York',
  'торонто': 'America/Toronto',

  'пекин': 'Asia/Shanghai',
  'шанхай': 'Asia/Shanghai',
  'токио': 'Asia/Tokyo',
  'сеул': 'Asia/Seoul',
  'бангкок': 'Asia/Bangkok',
  'дубай': 'Asia/Dubai',
  'дели': 'Asia/Kolkata',
  'нью-дели': 'Asia/Kolkata',
  'сингапур': 'Asia/Singapore',
  'сидней': 'Australia/Sydney'
};

function getTime(city) {
  const timezone = cities[normalize(city)];

  if (!timezone) return null;

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

// ========================================
// WEATHER
// ========================================

const weatherCodes = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Туман с изморозью',
  51: 'Морось',
  53: 'Умеренная морось',
  55: 'Сильная морось',
  56: 'Ледяная морось',
  57: 'Сильная ледяная морось',
  61: 'Небольшой дождь',
  63: 'Дождь',
  65: 'Сильный дождь',
  66: 'Ледяной дождь',
  67: 'Сильный ледяной дождь',
  71: 'Небольшой снег',
  73: 'Снег',
  75: 'Сильный снег',
  77: 'Снежные зёрна',
  80: 'Ливень',
  81: 'Сильный ливень',
  82: 'Очень сильный ливень',
  85: 'Снегопад',
  86: 'Сильный снегопад',
  95: 'Гроза',
  96: 'Гроза с градом',
  99: 'Сильная гроза с градом'
};

async function getWeather(city) {
  try {
    const geo = await axios.get(
      'https://geocoding-api.open-meteo.com/v1/search',
      {
        params: {
          name: city,
          count: 1,
          language: 'ru',
          format: 'json'
        },
        timeout: 10000
      }
    );

    if (!geo.data.results?.length) {
      return `❌ Город "${city}" не найден.`;
    }

    const place = geo.data.results[0];

    const response = await axios.get(
      'https://api.open-meteo.com/v1/forecast',
      {
        params: {
          latitude: place.latitude,
          longitude: place.longitude,
          current:
            'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
          temperature_unit: 'celsius',
          wind_speed_unit: 'kmh',
          timezone: 'auto'
        },
        timeout: 10000
      }
    );

    const current = response.data.current;

    if (!current) {
      return '⚠️ Данные о погоде недоступны.';
    }

    const description =
      weatherCodes[current.weather_code] || 'Неизвестно';

    return `🌤️ ${place.name}: ${description}, 🌡️ ${Math.round(current.temperature_2m)}°C, ощущается ${Math.round(current.apparent_temperature)}°C, 💧 ${current.relative_humidity_2m}%, 💨 ветер ${Math.round(current.wind_speed_10m)} км/ч`;

  } catch (error) {
    console.error('Weather error:', error.message);
    return '⚠️ Ошибка сервиса погоды.';
  }
}

// ========================================
// CURRENCY RATES
// ========================================

let currencyCache = null;
let currencyCacheTime = 0;

async function getRates() {
  try {
    if (
      currencyCache &&
      Date.now() - currencyCacheTime < 10 * 60 * 1000
    ) {
      return currencyCache;
    }

    const response = await axios.get(
      'https://www.cbr-xml-daily.ru/daily_json.js',
      { timeout: 10000 }
    );

    currencyCache = response.data.Valute;
    currencyCacheTime = Date.now();

    return currencyCache;

  } catch (error) {
    console.error('Currency error:', error.message);
    return null;
  }
}

async function getRate(currency) {
  const rates = await getRates();

  if (!rates) {
    return '⚠️ Не удалось получить курсы валют.';
  }

  currency = getCurrency(currency);

  if (currency === 'RUB') {
    return '💵 Российский рубль: 1.00 ₽';
  }

  if (!rates[currency]) {
    return '❌ Валюта не найдена. Используйте USD, EUR, GBP, CNY.';
  }

  const item = rates[currency];

  return `💵 ${item.Name}: ${(item.Value / item.Nominal).toFixed(2)} ₽`;
}

// ========================================
// MONEY CONVERTER
// ========================================

async function convertMoney(amount, from, to) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '❌ Сумма должна быть больше нуля.';
  }

  const rates = await getRates();

  if (!rates) {
    return '⚠️ Не удалось получить курсы валют.';
  }

  from = getCurrency(from);
  to = getCurrency(to);

  function getRubRate(currency) {
    if (currency === 'RUB') return 1;

    if (!rates[currency]) return null;

    return rates[currency].Value / rates[currency].Nominal;
  }

  const fromRate = getRubRate(from);
  const toRate = getRubRate(to);

  if (fromRate === null || toRate === null) {
    return '❌ Неизвестная валюта. Используйте RUB, USD, EUR, GBP или CNY.';
  }

  const result = amount * fromRate / toRate;

  return `💰 ${amount} ${from} = ${result.toFixed(2)} ${to}`;
}

// ========================================
// TRANSLATION LANGUAGES
// ========================================

const languages = {
  'английский': 'en',
  'английский язык': 'en',
  'en': 'en',

  'немецкий': 'de',
  'de': 'de',

  'французский': 'fr',
  'fr': 'fr',

  'испанский': 'es',
  'es': 'es',

  'итальянский': 'it',
  'it': 'it',

  'португальский': 'pt',
  'pt': 'pt',

  'китайский': 'zh-CN',
  'японский': 'ja',
  'ja': 'ja',

  'корейский': 'ko',
  'ko': 'ko',

  'польский': 'pl',
  'pl': 'pl',

  'турецкий': 'tr',
  'tr': 'tr',

  'арабский': 'ar',
  'ar': 'ar',

  'украинский': 'uk',
  'uk': 'uk',

  'белорусский': 'be',
  'be': 'be',

  'чешский': 'cs',
  'cs': 'cs',

  'нидерландский': 'nl',
  'nl': 'nl',

  'шведский': 'sv',
  'sv': 'sv',

  'норвежский': 'no',
  'no': 'no',

  'финский': 'fi',
  'fi': 'fi',

  'греческий': 'el',
  'el': 'el',

  'иврит': 'iw',
  'he': 'iw',

  'хинди': 'hi',
  'hi': 'hi',

  'тайский': 'th',
  'th': 'th',

  'вьетнамский': 'vi',
  'vi': 'vi',

  'индонезийский': 'id',
  'id': 'id',

  'румынский': 'ro',
  'ro': 'ro',

  'венгерский': 'hu',
  'hu': 'hu',

  'датский': 'da',
  'da': 'da',

  'русский': 'ru',
  'ru': 'ru'
};

// ========================================
// TRANSLATION CACHE AND QUEUE
// ========================================

const translationCache = new Map();
const translationQueue = [];

const CACHE_TIME = 30 * 60 * 1000;
const MAX_CACHE = 300;
const MAX_QUEUE = 12;
const TRANSLATION_DELAY = 2500;

let translationWorkerRunning = false;
let translationPausedUntil = 0;

function getCachedTranslation(key) {
  const item = translationCache.get(key);

  if (!item) return null;

  if (Date.now() - item.time > CACHE_TIME) {
    translationCache.delete(key);
    return null;
  }

  return item.value;
}

function saveTranslation(key, value) {
  if (translationCache.size >= MAX_CACHE) {
    const oldestKey = translationCache.keys().next().value;
    translationCache.delete(oldestKey);
  }

  translationCache.set(key, {
    value,
    time: Date.now()
  });
}

async function translateRequest(text, target, source) {
  const response = await axios.get(
    'https://translate.googleapis.com/translate_a/single',
    {
      params: {
        client: 'gtx',
        sl: source,
        tl: target,
        dt: 't',
        q: text
      },
      timeout: 15000
    }
  );

  const translated = response.data[0]
    .map(part => part[0] || '')
    .join('');

  if (!translated) return null;

  return {
    text: translated,
    source: response.data[2] || source
  };
}

async function processTranslationQueue() {
  if (translationWorkerRunning) return;

  translationWorkerRunning = true;

  try {
    while (translationQueue.length > 0) {
      const job = translationQueue.shift();

      try {
        const pause = translationPausedUntil - Date.now();

        if (pause > 0) {
          await sleep(pause);
        }

        let result;

        try {
          result = await translateRequest(
            job.text,
            job.target,
            job.source
          );
        } catch (error) {
          if (error.response?.status === 429) {
            console.log('⚠️ Google Translate: 429. Пауза 30 секунд.');

            translationPausedUntil = Date.now() + 30000;

            await sleep(30000);

            result = await translateRequest(
              job.text,
              job.target,
              job.source
            );
          } else {
            throw error;
          }
        }

        if (result) {
          saveTranslation(job.key, result);
        }

        job.resolve(result || null);

      } catch (error) {
        console.error('Translation error:', error.message);
        job.resolve(null);
      }

      await sleep(TRANSLATION_DELAY);
    }
  } finally {
    translationWorkerRunning = false;

    if (translationQueue.length > 0) {
      processTranslationQueue();
    }
  }
}

function translateText(text, target = 'ru', source = 'auto') {
  if (!text || text.length > 400) {
    return Promise.resolve(null);
  }

  const key = `${source}|${target}|${normalize(text)}`;

  const cached = getCachedTranslation(key);

  if (cached) {
    return Promise.resolve(cached);
  }

  if (translationQueue.length >= MAX_QUEUE) {
    console.log('⚠️ Очередь переводов заполнена.');
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    translationQueue.push({
      text,
      target,
      source,
      key,
      resolve
    });

    processTranslationQueue();
  });
}

// ========================================
// MESSAGE HANDLER
// ========================================

const userTranslationCooldown = new Map();

const ignoredBots = [
  'cgamer_bot',
  'nightbot',
  'streamelements',
  'jeetbot',
  'sery_bot',
  'moobot'
];

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const text = message.trim();
  const lower = normalize(text);
  const username = (tags.username || '').toLowerCase();

  if (!text) return;

  console.log(`📩 [${channel}] ${username}: ${text}`);

  try {
    // HELP
    if (lower === '!помощь' || lower === '!help') {
      await safeSay(
        channel,
        '🤖 Команды: !time город | !weather город | !курс USD | !money 100 доллар рубль | !перевод en Привет. Автоперевод иностранных сообщений включён.'
      );
      return;
    }

    // TIME
    if (
      lower.startsWith('!time ') ||
      lower.startsWith('!время ')
    ) {
      const city = text.substring(text.indexOf(' ') + 1).trim();
      const time = getTime(city);

      await safeSay(
        channel,
        time
          ? `🕐 Время в ${city}: ${time}`
          : `❌ Не знаю часовой пояс города "${city}".`
      );

      return;
    }

    // WEATHER
    if (
      lower.startsWith('!weather ') ||
      lower.startsWith('!погода ')
    ) {
      const city = text.substring(text.indexOf(' ') + 1).trim();

      if (!city) {
        await safeSay(channel, '🌤️ Использование: !погода город');
        return;
      }

      await safeSay(channel, await getWeather(city));
      return;
    }

    // CURRENCY RATE
    if (
      lower === '!rate' ||
      lower.startsWith('!rate ') ||
      lower === '!курс' ||
      lower.startsWith('!курс ')
    ) {
      const parts = text.split(/\s+/);

      if (!parts[1]) {
        await safeSay(channel, '💵 Использование: !курс USD');
        return;
      }

      await safeSay(channel, await getRate(parts[1]));
      return;
    }

    // MONEY CONVERTER
    if (
      lower.startsWith('!money ') ||
      lower.startsWith('!деньги ')
    ) {
      const args = text.split(/\s+/);

      if (args.length < 4) {
        await safeSay(
          channel,
          '💰 Использование: !деньги 100 доллар рубль'
        );
        return;
      }

      const amount = parseFloat(args[1].replace(',', '.'));

      await safeSay(
        channel,
        await convertMoney(amount, args[2], args[3])
      );

      return;
    }

    // MANUAL TRANSLATION
    if (
      lower.startsWith('!перевод ') ||
      lower.startsWith('!translate ')
    ) {
      const parts = text.split(/\s+/);
      const targetName = normalize(parts[1] || '');
      const target = languages[targetName];

      if (!target || parts.length < 3) {
        await safeSay(
          channel,
          '🌐 Использование: !перевод en Привет | !перевод немецкий Привет'
        );
        return;
      }

      const original = parts.slice(2).join(' ');
      const result = await translateText(original, target, 'ru');

      if (!result) {
        await safeSay(
          channel,
          '⚠️ Не удалось выполнить перевод. Попробуйте позже.'
        );
        return;
      }

      await safeSay(
        channel,
        `🌐 Перевод (${target}): ${result.text}`
      );

      return;
    }

    // AUTO TRANSLATION
    if (text.startsWith('!')) return;

    if (ignoredBots.includes(username)) return;

    if (text.length < 3 || text.length > 400) return;

    const now = Date.now();

    if (
      now - (userTranslationCooldown.get(username) || 0) < 6000
    ) {
      return;
    }

    userTranslationCooldown.set(username, now);

    const result = await translateText(text, 'ru', 'auto');

    if (!result) return;

    if (
      result.source &&
      result.source.toLowerCase().startsWith('ru')
    ) {
      return;
    }

    if (
      result.text &&
      normalize(result.text) !== normalize(text)
    ) {
      await safeSay(
        channel,
        `🌐 Перевод: ${result.text}`
      );
    }

  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
  }
});

// ========================================
// TWITCH EVENTS AND CONNECTION
// ========================================

client.on('connected', (address, port) => {
  console.log(`✅ Подключено к Twitch: ${address}:${port}`);
});

client.on('join', (channel, username, self) => {
  if (self) {
    console.log(`✅ Бот вошёл в канал ${channel}`);
  }
});

client.on('disconnected', reason => {
  console.log('⚠️ Twitch отключён:', reason);
});

client.on('notice', (channel, msgid, message) => {
  console.log('Twitch notice:', message);
});

client.on('error', error => {
  console.error('Twitch client error:', error);
});

client.connect()
  .then(() => {
    console.log('======================================');
    console.log('🤖 TWITCH BOT ПОДКЛЮЧЁН!');
    console.log('📡 Канал: cgamer__');
    console.log('🌤️ Погода включена');
    console.log('💰 Валюты включены');
    console.log('🕐 Время включено');
    console.log('🌐 Перевод включён');
    console.log('======================================');
  })
  .catch(error => {
    console.error('❌ Twitch connection error:', error);
  });

// ========================================
// GLOBAL ERROR HANDLING
// ========================================

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Critical error:', error);
});
