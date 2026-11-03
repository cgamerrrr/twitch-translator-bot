
const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');

// ========================================
// HTTP SERVER ДЛЯ RENDER
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

const opts = {
  options: {
    debug: false
  },
  connection: {
    reconnect: true,
    secure: true
  },
  identity: {
    username: 'cgamer_bot',
    password: process.env.TWITCH_OAUTH
  },
  channels: ['cgamer__']
};

const client = new tmi.Client(opts);

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

function normalize(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

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

    if (!geo.data.results || !geo.data.results.length) {
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

    return (
      `🌤️ Погода в ${place.name}: ${description}, ` +
      `🌡️ ${Math.round(current.temperature_2m)}°C, ` +
      `ощущается как ${Math.round(current.apparent_temperature)}°C, ` +
      `💧 влажность ${current.relative_humidity_2m}%, ` +
      `💨 ветер ${Math.round(current.wind_speed_10m)} км/ч`
    );

  } catch (error) {
    console.error('Weather error:', error.message);
    return '⚠️ Ошибка сервиса погоды.';
  }
}

// ========================================
// CURRENCY RATES
// ========================================

async function getRates() {
  try {
    const response = await axios.get(
      'https://www.cbr-xml-daily.ru/daily_json.js',
      { timeout: 10000 }
    );

    return response.data.Valute;

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

  currency = currencyDict[normalize(currency)] ||
    currency.toUpperCase();

  if (currency === 'RUB') {
    return '💵 Российский рубль: 1.00 ₽';
  }

  if (!rates[currency]) {
    return '❌ Валюта не найдена. Доступны USD, EUR, GBP, CNY.';
  }

  const item = rates[currency];
  const value = item.Value / item.Nominal;

  return `💵 ${item.Name}: ${value.toFixed(2)} ₽`;
}

// ========================================
// MONEY CONVERTER
// ========================================

async function convertMoney(amount, from, to) {
  const rates = await getRates();

  if (!rates) {
    return '⚠️ Не удалось получить курсы валют.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return '❌ Сумма должна быть больше нуля.';
  }

  from = currencyDict[normalize(from)] || from.toUpperCase();
  to = currencyDict[normalize(to)] || to.toUpperCase();

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
  'китайский традиционный': 'zh-TW',
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
// TRANSLATION ENGINE
// ========================================

async function translateText(text, target = 'ru') {
  try {
    const response = await axios.get(
      'https://translate.googleapis.com/translate_a/single',
      {
        params: {
          client: 'gtx',
          sl: 'auto',
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

    const sourceLanguage = response.data[2];

    if (!translated) return null;

    return {
      text: translated,
      source: sourceLanguage
    };

  } catch (error) {
    console.error('Translation error:', error.message);
    return null;
  }
}

// ========================================
// TWITCH CONNECTION
// ========================================

client.connect()
  .then(() => {
    console.log('======================================');
    console.log('🤖 TWITCH BOT ЗАПУЩЕН!');
    console.log('🌐 Автоматический перевод включён');
    console.log('💰 Курсы валют включены');
    console.log('🌤️ Погода включена');
    console.log('🕐 Время включено');
    console.log('🔄 Перевод по команде включён');
    console.log('======================================');
  })
  .catch(error => {
    console.error('Twitch connection error:', error);
  });

// ========================================
// MESSAGE HANDLER
// ========================================

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const text = message.trim();
  const lower = normalize(text);

  if (!text) return;

  // ======================================
  // HELP
  // ======================================

  if (lower === '!помощь' || lower === '!help') {
    client.say(channel,
      '🤖 Команды: !time город | !weather город | !курс USD | !money 100 доллар рубль | !перевод en Привет | !перевод немецкий Привет | Автоперевод иностранных сообщений на русский.'
    );
    return;
  }

  // ======================================
  // TIME
  // ======================================

  if (
    lower.startsWith('!time ') ||
    lower.startsWith('!время ')
  ) {
    const city = text.substring(text.indexOf(' ') + 1).trim();
    const time = getTime(city);

    if (!time) {
      client.say(channel,
        `❌ Не знаю часовой пояс города "${city}".`
      );
      return;
    }

    client.say(channel, `🕐 Время в [${city}]: ${time}`);
    return;
  }

  // ======================================
  // WEATHER
  // ======================================

  if (
    lower.startsWith('!weather ') ||
    lower.startsWith('!погода ')
  ) {
    const city = text.substring(text.indexOf(' ') + 1).trim();

    if (!city) {
      client.say(channel, '🌤️ Использование: !weather город');
      return;
    }

    const weather = await getWeather(city);
    client.say(channel, weather);
    return;
  }

  // ======================================
  // CURRENCY RATE
  // ======================================

  if (
    lower === '!rate' ||
    lower.startsWith('!rate ') ||
    lower === '!курс' ||
    lower.startsWith('!курс ')
  ) {
    const parts = text.split(/\s+/);

    if (!parts[1]) {
      client.say(channel, '💵 Использование: !курс USD');
      return;
    }

    const result = await getRate(parts[1]);
    client.say(channel, result);
    return;
  }

  // ======================================
  // MONEY CONVERTER
  // ======================================

  if (
    lower.startsWith('!money ') ||
    lower.startsWith('!деньги ')
  ) {
    const args = text.split(/\s+/);

    if (args.length < 4) {
      client.say(channel,
        '💰 Использование: !деньги 100 доллар рубль'
      );
      return;
    }

    const amount = parseFloat(args[1].replace(',', '.'));

    const result = await convertMoney(
      amount,
      args[2],
      args[3]
    );

    client.say(channel, result);
    return;
  }

  // ======================================
  // MANUAL TRANSLATION
  // ======================================

  if (
    lower.startsWith('!перевод ') ||
    lower.startsWith('!translate ')
  ) {
    const args = text.split(/\s+/);
    const targetName = normalize(args[1] || '');
    const target = languages[targetName];

    if (!target || args.length < 3) {
      client.say(channel,
        '🌐 Использование: !перевод en Привет | !перевод немецкий Привет'
      );
      return;
    }

    const original = args.slice(2).join(' ');
    const result = await translateText(original, target);

    if (!result) {
      client.say(channel, '⚠️ Не удалось выполнить перевод.');
      return;
    }

    client.say(
      channel,
      `🌐 Перевод (${target}): ${result.text.slice(0, 350)}`
    );

    return;
  }

  // ======================================
  // AUTO TRANSLATION TO RUSSIAN
  // ======================================

  // Не переводим команды
  if (text.startsWith('!')) return;

  // Не переводим сообщения других ботов
  if (tags.username && (
    tags.username.toLowerCase() === 'nightbot' ||
    tags.username.toLowerCase() === 'streamelements' ||
    tags.username.toLowerCase() === 'jeetbot'
  )) {
    return;
  }

  // Не переводим короткие сообщения и эмодзи
  if (text.length < 3) return;

  const result = await translateText(text, 'ru');

  if (!result) return;

  // Если исходный язык русский, ничего не отправляем
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
    client.say(
      channel,
      `🌐 Перевод: ${result.text.slice(0, 350)}`
    );
  }
});

// ========================================
// ERROR HANDLING
// ========================================

client.on('disconnected', reason => {
  console.log('⚠️ Twitch отключён:', reason);
});

client.on('notice', (channel, msgid, message) => {
  console.log('Twitch notice:', message);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled error:', error);
});

process.on('uncaughtException', error => {
  console.error('Critical error:', error);
});
