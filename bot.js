
const tmi = require('tmi.js');
const axios = require('axios');

// ==========================================
// TWITCH SETTINGS
// ==========================================

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

if (!process.env.TWITCH_OAUTH) {
  console.error('❌ Не задан TWITCH_OAUTH!');
  process.exit(1);
}

const client = new tmi.Client(opts);

// ==========================================
// CURRENCIES
// ==========================================

const currencyDict = {
  'доллар': 'USD',
  'доллара': 'USD',
  'долларов': 'USD',
  'долл': 'USD',
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
  'cny': 'CNY',

  'рубль': 'RUB',
  'рубля': 'RUB',
  'рублей': 'RUB',
  'руб': 'RUB',
  'рубли': 'RUB',
  'rur': 'RUB',
  'rub': 'RUB'
};

// ==========================================
// TIME ZONES
// ==========================================

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

  'пекин': 'Asia/Shanghai',
  'шанхай': 'Asia/Shanghai',
  'токио': 'Asia/Tokyo',
  'сеул': 'Asia/Seoul',
  'бангкок': 'Asia/Bangkok',
  'дели': 'Asia/Kolkata',
  'нью дели': 'Asia/Kolkata',
  'нью-дели': 'Asia/Kolkata',
  'дубай': 'Asia/Dubai',

  'нью йорк': 'America/New_York',
  'нью-йорк': 'America/New_York',
  'new york': 'America/New_York',
  'чикаго': 'America/Chicago',
  'лос анджелес': 'America/Los_Angeles',
  'лос-анджелес': 'America/Los_Angeles',
  'торонто': 'America/Toronto',
  'ванкувер': 'America/Vancouver',

  'сидней': 'Australia/Sydney',
  'мельбурн': 'Australia/Melbourne'
};

function normalizeCity(city) {
  return city
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function getTime(city) {
  const key = normalizeCity(city);
  const timezone = cities[key];

  if (!timezone) return null;

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

// ==========================================
// WEATHER
// ==========================================

const weatherCodes = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Туман с изморозью',
  51: 'Морось',
  53: 'Морось',
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
    const geoResponse = await axios.get(
      'https://geocoding-api.open-meteo.com/v1/search',
      {
        params: {
          name: city,
          count: 1,
          language: 'ru',
          format: 'json'
        },
        timeout: 12000
      }
    );

    const places = geoResponse.data?.results;

    if (!places || !places.length) {
      return `❌ Город «${city}» не найден.`;
    }

    const place = places[0];

    const weatherResponse = await axios.get(
      'https://api.open-meteo.com/v1/forecast',
      {
        params: {
          latitude: place.latitude,
          longitude: place.longitude,
          current:
            'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
          wind_speed_unit: 'kmh',
          temperature_unit: 'celsius',
          timezone: 'auto'
        },
        timeout: 12000
      }
    );

    const current = weatherResponse.data?.current;

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

// ==========================================
// CBR CURRENCY RATES
// ==========================================

async function getRates() {
  try {
    const response = await axios.get(
      'https://www.cbr-xml-daily.ru/daily_json.js',
      {
        timeout: 12000
      }
    );

    return response.data?.Valute || null;

  } catch (error) {
    console.error('Currency error:', error.message);
    return null;
  }
}

// ==========================================
// CURRENCY CONVERTER
// ==========================================

async function convertMoney(amount, fromCurrency, toCurrency) {
  try {
    const rates = await getRates();

    if (!rates) {
      return '⚠️ Не удалось получить курсы валют.';
    }

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1000000000000
    ) {
      return '❌ Укажите корректную положительную сумму.';
    }

    if (from === to) {
      return `💰 ${amount} ${from} = ${amount} ${to}`;
    }

    let rubValue;

    if (from === 'RUB') {
      rubValue = amount;
    } else {
      if (!rates[from]) {
        return `❌ Валюта ${from} не найдена.`;
      }

      rubValue =
        amount * (rates[from].Value / rates[from].Nominal);
    }

    if (to === 'RUB') {
      return `💰 ${amount} ${from} = ${rubValue.toFixed(2)} ₽`;
    }

    if (!rates[to]) {
      return `❌ Валюта ${to} не найдена.`;
    }

    const result =
      rubValue / (rates[to].Value / rates[to].Nominal);

    return `💰 ${amount} ${from} = ${result.toFixed(2)} ${to}`;

  } catch (error) {
    console.error('Converter error:', error.message);
    return '⚠️ Ошибка конвертации.';
  }
}

// ==========================================
// TRANSLATION LANGUAGES
// ==========================================

const languages = {
  'английский': 'en',
  'английский язык': 'en',
  'english': 'en',
  'en': 'en',

  'немецкий': 'de',
  'немецкий язык': 'de',
  'german': 'de',
  'de': 'de',

  'французский': 'fr',
  'французский язык': 'fr',
  'french': 'fr',
  'fr': 'fr',

  'испанский': 'es',
  'испанский язык': 'es',
  'spanish': 'es',
  'es': 'es',

  'итальянский': 'it',
  'italian': 'it',
  'it': 'it',

  'португальский': 'pt',
  'portuguese': 'pt',
  'pt': 'pt',

  'польский': 'pl',
  'polish': 'pl',
  'pl': 'pl',

  'украинский': 'uk',
  'ukrainian': 'uk',
  'uk': 'uk',

  'белорусский': 'be',
  'be': 'be',

  'китайский': 'zh-CN',
  'китайский упрощенный': 'zh-CN',
  'chinese': 'zh-CN',
  'zh': 'zh-CN',

  'японский': 'ja',
  'japanese': 'ja',
  'ja': 'ja',

  'корейский': 'ko',
  'korean': 'ko',
  'ko': 'ko',

  'турецкий': 'tr',
  'turkish': 'tr',
  'tr': 'tr',

  'арабский': 'ar',
  'arabic': 'ar',
  'ar': 'ar',

  'хинди': 'hi',
  'hindi': 'hi',
  'hi': 'hi',

  'голландский': 'nl',
  'нидерландский': 'nl',
  'dutch': 'nl',
  'nl': 'nl',

  'чешский': 'cs',
  'czech': 'cs',
  'cs': 'cs',

  'словацкий': 'sk',
  'sk': 'sk',

  'греческий': 'el',
  'greek': 'el',
  'el': 'el',

  'шведский': 'sv',
  'swedish': 'sv',
  'sv': 'sv',

  'норвежский': 'no',
  'norwegian': 'no',
  'no': 'no',

  'датский': 'da',
  'danish': 'da',
  'da': 'da',

  'финский': 'fi',
  'finnish': 'fi',
  'fi': 'fi',

  'венгерский': 'hu',
  'hungarian': 'hu',
  'hu': 'hu',

  'румынский': 'ro',
  'romanian': 'ro',
  'ro': 'ro',

  'болгарский': 'bg',
  'bulgarian': 'bg',
  'bg': 'bg',

  'сербский': 'sr',
  'sr': 'sr',

  'хорватский': 'hr',
  'croatian': 'hr',
  'hr': 'hr',

  'иврит': 'he',
  'hebrew': 'he',
  'he': 'he',

  'тайский': 'th',
  'thai': 'th',
  'th': 'th',

  'вьетнамский': 'vi',
  'vietnamese': 'vi',
  'vi': 'vi',

  'индонезийский': 'id',
  'indonesian': 'id',
  'id': 'id',

  'малайский': 'ms',
  'malay': 'ms',
  'ms': 'ms',

  'персидский': 'fa',
  'farsi': 'fa',
  'fa': 'fa',

  'латышский': 'lv',
  'lv': 'lv',

  'литовский': 'lt',
  'lt': 'lt',

  'эстонский': 'et',
  'et': 'et',

  'грузинский': 'ka',
  'ka': 'ka',

  'армянский': 'hy',
  'hy': 'hy',

  'азербайджанский': 'az',
  'az': 'az',

  'казахский': 'kk',
  'kk': 'kk',

  'узбекский': 'uz',
  'uz': 'uz'
};

// ==========================================
// TRANSLATE FUNCTION
// ==========================================

async function translateText(message, targetLanguage = 'ru', sourceLanguage = 'auto') {
  try {
    const response = await axios.get(
      'https://translate.googleapis.com/translate_a/single',
      {
        params: {
          client: 'gtx',
          sl: sourceLanguage,
          tl: targetLanguage,
          dt: 't',
          q: message
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    const parts = response.data?.[0];

    if (!Array.isArray(parts)) {
      return null;
    }

    const translated = parts
      .map(part => part?.[0] || '')
      .join('')
      .trim();

    const detectedLanguage =
      String(response.data?.[2] || '').toLowerCase();

    if (!translated) {
      return null;
    }

    return {
      text: translated,
      detectedLanguage
    };

  } catch (error) {
    console.error(
      'Translation error:',
      error.response?.data || error.message
    );

    return null;
  }
}

// ==========================================
// TRANSLATION COMMAND
// ==========================================

async function translateCommand(channel, args) {
  if (!args.length) {
    client.say(
      channel,
      '🌐 Использование: !перевод <язык> <текст>. Например: !перевод en Привет'
    );
    return;
  }

  if (
    args[0].toLowerCase() === 'список' ||
    args[0].toLowerCase() === 'list'
  ) {
    client.say(
      channel,
      '🌍 Языки: en английский, de немецкий, fr французский, es испанский, it итальянский, pt португальский, pl польский, uk украинский, zh китайский, ja японский, ko корейский, tr турецкий, ar арабский, hi хинди, nl голландский, cs чешский, el греческий, sv шведский, no норвежский, fi финский, ro румынский, bg болгарский, vi вьетнамский, th тайский, id индонезийский, kk казахский, uz узбекский.'
    );
    return;
  }

  const languageName = args[0].toLowerCase();
  const targetLanguage =
    languages[languageName] ||
    (/^[a-z]{2,3}(-[a-z]{2})?$/i.test(languageName)
      ? languageName
      : null);

  if (!targetLanguage) {
    client.say(
      channel,
      '❌ Неизвестный язык. Напишите !перевод список'
    );
    return;
  }

  const originalText = args.slice(1).join(' ').trim();

  if (!originalText) {
    client.say(
      channel,
      '❌ Напишите текст после названия языка.'
    );
    return;
  }

  const result = await translateText(
    originalText,
    targetLanguage,
    'ru'
  );

  if (!result) {
    client.say(channel, '⚠️ Ошибка перевода. Попробуйте позже.');
    return;
  }

  client.say(
    channel,
    `🌐 Перевод (${targetLanguage}): ${result.text}`
  );
}

// ==========================================
// TWITCH CONNECTION
// ==========================================

client.connect()
  .then(() => {
    console.log('======================================');
    console.log('🤖 TWITCH BOT ЗАПУЩЕН!');
    console.log('🌐 Автоматический перевод включён');
    console.log('💰 Курсы валют включены');
    console.log('🌤️ Погода включена');
    console.log('🕐 Время включено');
    console.log('======================================');
  })
  .catch(error => {
    console.error('Twitch connection error:', error);
  });

// ==========================================
// CHAT MESSAGE HANDLER
// ==========================================

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  try {
    const text = message.trim();
    const lower = text.toLowerCase();

    if (!text) return;

    // ======================================
    // HELP
    // ======================================

    if (lower === '!помощь' || lower === '!help') {
      client.say(
        channel,
        '🤖 Команды: !time город | !weather город | !курс usd | !деньги 100 доллар рубль | !перевод en Привет | !перевод список. Иностранные сообщения автоматически переводятся на русский.'
      );
      return;
    }

    // ======================================
    // TRANSLATION
    // ======================================

    if (
      lower.startsWith('!перевод ') ||
      lower.startsWith('!translate ')
    ) {
      const args = text.split(/\s+/).slice(1);
      await translateCommand(channel, args);
      return;
    }

    // ======================================
    // TIME
    // ======================================

    if (
      lower.startsWith('!time ') ||
      lower.startsWith('!время ')
    ) {
      const city = text.replace(/^!(time|время)\s+/i, '').trim();

      const time = getTime(city);

      if (!time) {
        client.say(
          channel,
          `❌ Не знаю часовой пояс города «${city}».`
        );
        return;
      }

      client.say(
        channel,
        `🕐 Время в ${city}: ${time}`
      );
      return;
    }

    // ======================================
    // WEATHER
    // ======================================

    if (
      lower.startsWith('!weather ') ||
      lower.startsWith('!погода ')
    ) {
      const city = text.replace(/^!(weather|погода)\s+/i, '').trim();

      const weather = await getWeather(city);

      client.say(channel, weather);
      return;
    }

    // ======================================
    // CURRENCY RATE
    // ======================================

    if (
      lower.startsWith('!rate ') ||
      lower.startsWith('!курс ')
    ) {
      const currencyName = text
        .replace(/^!(rate|курс)\s+/i, '')
        .trim()
        .toLowerCase();

      if (!currencyName) {
        client.say(
          channel,
          '💵 Использование: !курс usd'
        );
        return;
      }

      const currency =
        currencyDict[currencyName] ||
        currencyName.toUpperCase();

      const rates = await getRates();

      if (!rates || !rates[currency]) {
        client.say(
          channel,
          '❌ Валюта не найдена. Доступны USD, EUR, GBP, CNY.'
        );
        return;
      }

      const item = rates[currency];
      const value = item.Value / item.Nominal;

      client.say(
        channel,
        `💵 ${item.Name}: ${value.toFixed(2)} ₽`
      );
      return;
    }

    // ======================================
    // MONEY CONVERTER
    // ======================================

    if (
      lower.startsWith('!money ') ||
      lower.startsWith('!деньги ')
    ) {
      const args = text.split(/\s+/).slice(1);

      if (args.length < 3) {
        client.say(
          channel,
          '💰 Использование: !деньги 100 доллар рубль'
        );
        return;
      }

      const amount = Number(
        args[0].replace(',', '.')
      );

      if (!Number.isFinite(amount) || amount <= 0) {
        client.say(channel, '❌ Неверная сумма.');
        return;
      }

      const from =
        currencyDict[args[1].toLowerCase()] ||
        args[1].toUpperCase();

      const to =
        currencyDict[args[2].toLowerCase()] ||
        args[2].toUpperCase();

      const result = await convertMoney(
        amount,
        from,
        to
      );

      client.say(channel, result);
      return;
    }

    // ======================================
    // AUTOMATIC TRANSLATION TO RUSSIAN
    // ======================================

    // Не переводим команды
    if (text.startsWith('!')) return;

    // Не переводим слишком короткие сообщения
    if (text.length < 3) return;

    // Не переводим сообщения без букв
    if (!/\p{L}/u.test(text)) return;

    // Автоматически определяем язык
    const result = await translateText(text, 'ru', 'auto');

    if (!result) return;

    // Не переводим русские сообщения
    if (result.detectedLanguage.startsWith('ru')) {
      return;
    }

    // Не отправляем одинаковый текст
    if (
      result.text.toLowerCase() === text.toLowerCase()
    ) {
      return;
    }

    client.say(
      channel,
      `🌐 Перевод: ${result.text}`
    );

  } catch (error) {
    console.error('Message handler error:', error.message);
  }
});

// ==========================================
// CONNECTION EVENTS
// ==========================================

client.on('connected', (address, port) => {
  console.log(`✅ Подключено к Twitch: ${address}:${port}`);
});

client.on('disconnected', reason => {
  console.log('⚠️ Отключение Twitch:', reason);
});
