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
  const key = String(value || '').toLowerCase().trim();
  return languages[key] || key;
}

// Разбирает команду !на английский язык Привет
// и !на немецкий Guten Tag
function parseLanguageAndText(args) {
  const normalized = args.join(' ').trim().toLowerCase();

  const languageNames = Object.keys(languages)
    .sort((a, b) => b.length - a.length);

  for (const name of languageNames) {
    if (normalized.startsWith(name + ' ')) {
      const original = args.join(' ');
      const message = original.slice(name.length).trim();

      return {
        language: name,
        message
      };
    }
  }

  if (args.length >= 2) {
    return {
      language: args[0],
      message: args.slice(1).join(' ')
    };
  }

  return null;
}

async function translateText(text, from, to) {
  const cleanText = String(text || '').trim();

  if (!cleanText || cleanText.length > MAX_TRANSLATE_LENGTH) {
    return null;
  }

  try {
    const response = await axios.get(
      'https://api.mymemory.translated.net/get',
      {
        params: {
          q: cleanText,
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

// ==================== АВТОПЕРЕВОД ====================

const autoTranslateUsers = new Map();
const translatingUsers = new Set();

async function autoTranslateToRussian(username, message) {
  const now = Date.now();
  const last = autoTranslateUsers.get(username) || 0;

  if (now - last < AUTO_TRANSLATE_COOLDOWN) return;
  if (translatingUsers.has(username)) return;
  if (message.trim().length < 8) return;
  if (message.trim().startsWith('!')) return;

  translatingUsers.add(username);

  try {
    const translated = await translateText(message, 'autodetect', 'ru');

    if (!translated) return;

    const normalized = translated.trim().toLowerCase();
    const original = message.trim().toLowerCase();

    if (normalized === original) return;

    autoTranslateUsers.set(username, Date.now());

    client.say(
      `#${CHANNEL}`,
      `🌐 @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`
    );
  } finally {
    translatingUsers.delete(username);
  }
}

// ==================== РУЧНОЙ ПЕРЕВОД ====================

async function manualTranslateCommand(username, message) {
  const translated = await translateText(message, 'autodetect', 'ru');

  if (!translated) {
    client.say(`#${CHANNEL}`, `@${username}, не удалось выполнить перевод.`);
    return;
  }

  client.say(
    `#${CHANNEL}`,
    `🌐 Перевод для @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`
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
    `🌍 Перевод для @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`
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
  const value = Number(amount.replace(',', '.'));
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
  if (!translated) {
    client.say(`#${CHANNEL}`, `@${username}, не удалось выполнить перевод.`);
    return;
  }

  client.say(
    `#${CHANNEL}`,
    `🌐 Перевод для @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`
  );
}

async function translateFromRussianCommand(username, language, message) {
  const lang = getLanguageCode(language);

  if (!message || !message.trim()) {
    client.say(`#${CHANNEL}`, `@${username}, добавь текст после названия языка.`);
    return;
  }

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
    `🌍 Перевод для @${username}: ${translated.slice(0, MAX_CHAT_OUTPUT)}`
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
  city = String(city || '').trim();

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
    '📚 Команды: !профиль, !баланс, !рыбалка, !ежедневно, !магазин, !купить улучшенную, !купить золотую, !топ, !топрыбаки, !погода город, !время город, !курс USD, !конверт 100 USD, !перевод текст, !на английский язык текст.'
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

  if (commandCooldowns.size > 5000) {
    for (const [oldKey, timestamp] of commandCooldowns) {
      if (now - timestamp > 60 * 60 * 1000) {
        commandCooldowns.delete(oldKey);
      }
    }
  }

  return false;
}

// ==================== ОБРАБОТКА СООБЩЕНИЙ ====================

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const username = (tags.username || '').toLowerCase();

  if (!username || IGNORED_USERS.has(username)) {
    return;
  }

  const text = String(message || '').trim();

  if (!text || text.length > 500) return;

  if (String(channel).toLowerCase() !== `#${CHANNEL.toLowerCase()}`) return;

  if (!text.startsWith('!')) {
    await autoTranslateToRussian(username, text);
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
          const parsed = parseLanguageAndText(args);

          if (!parsed || !parsed.message) {
            client.say(`#${CHANNEL}`, `@${username}, пример: !на английский язык Привет, как дела?`);
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

// ==================== ЗАВЕРШЕНИЕ РАБОТЫ ====================

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Получен ${signal}. Сохраняю данные и отключаю бота...`);
  saveProfiles();

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  Promise.resolve(client.disconnect())
    .catch(error => {
      console.error('Ошибка отключения Twitch:', error.message);
    })
    .finally(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500).unref();
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', error => {
  console.error('Критическая ошибка:', error);
  saveProfiles();
});

process.on('unhandledRejection', reason => {
  console.error('Необработанная ошибка Promise:', reason);
});
