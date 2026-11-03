const tmi = require('tmi.js');
const axios = require('axios');
const translate = require('@iamtraction/google-translate');

const opts = {
  identity: { username: 'cgamer_bot', password: process.env.TWITCH_OAUTH },
  channels: ['cgamer__']
};

const currencyDict = { 
  'доллар': 'USD', 'долларов': 'USD', 'доллара': 'USD', 'usd': 'USD', 
  'рубль': 'RUB', 'рублей': 'RUB', 'рубля': 'RUB', 'rub': 'RUB', 'руб': 'RUB', 
  'евро': 'EUR', 'eur': 'EUR' 
};

const client = new tmi.client(opts);
client.on('message', onMessageHandler);
client.on('connected', (addr, port) => console.log(`* Бот успешно подключился к ${addr}:${port}`));
client.on('error', () => console.log('Ошибка сети Twitch, восстановление...'));
client.connect().catch(() => console.log('Ошибка подключения чата. Проверьте переменные окружения.'));

async function onMessageHandler(channel, tags, msg, self) {
  if (self) return; 

  const trimmedMsg = msg.replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lowerMsg = trimmedMsg.toLowerCase();
  
  const words = trimmedMsg.split(' ').filter(w => w.trim().length > 0);
  const wordsLower = lowerMsg.split(' ').filter(w => w.trim().length > 0);

  const authorName = tags['display-name'] || tags['username'];

  // --- БЛОК 1: КОМАНДЫ ---

  if (lowerMsg === '!помощь') {
    client.say(channel, `🤖 Способности бота: 🌐 1) Авто-перевод иностранного чата на русский. | 🕒 2) !time <город> — Время в 24ч (Пример: !time токио). | 🌤 3) !weather <город> — Погода в °C (Пример: !weather сочи). | 💵 4) !rate <валюта> — Курс ЦБ к рублю (usd, eur). | 💱 5) !money <сумма> <из> <в> — Конвертер (Пример: !money 100 доллар рубль). | 🗺 6) !tr <код> <текст> — Перевод (Коды: en, es, de, fr, ja).`);
    return;
  }
  if (lowerMsg === '!help') {
    client.say(channel, `🤖 Bot abilities: 🌐 1) Auto-translation to RU. | 🕒 2) !time <city> — Current time in 24h. | 🌤 3) !weather <city> — Weather in °C. | 💵 4) !rate <currency> — Rate to RUB. | 💱 5) !money <amount> <from> <to> — Currency converter. | 🗺 6) !tr <lang_code> <text> — Manual translation.`);
    return;
  }

  if (lowerMsg.startsWith('!rate') || lowerMsg.startsWith('!курс')) {
    const rateCmd = [...wordsLower];
    rateCmd.shift(); 
    const rawCurrency = rateCmd.shift(); 
    const curr = (currencyDict[rawCurrency] || rawCurrency?.toUpperCase() || '').trim();
    if (!curr || curr.length < 3) return client.say(channel, `⚠ Укажите валюту. Пример: !rate usd`);
    try {
      const res = await axios.get('https://cbr-xml-daily.ru', { timeout: 5000 });
      if (res.data && res.data.Valute) {
        if (curr === 'RUB') return client.say(channel, `💵 Курс [1 RUB]: 1.00 RUB`);
        const valuteData = res.data.Valute[curr];
        if (valuteData) {
          client.say(channel, `💵 Курс ЦБ РФ [1 ${curr}]: ${(valuteData.Value / valuteData.Nominal).toFixed(2)} RUB`);
        } else {
          client.say(channel, `⚠ Не удалось найти валюту "${curr}" в базе ЦБ.`);
        }
      }
    } catch (e) { client.say(channel, `⚠ Ошибка сервиса валют.`); }
    return;
  }

  if (lowerMsg.startsWith('!money') || lowerMsg.startsWith('!конверт')) {
    const moneyCmd = [...wordsLower];
    moneyCmd.shift(); 
    const rawAmount = moneyCmd.shift(); 
    const rawFrom = moneyCmd.shift();   
    const rawTo = moneyCmd.shift();     

    const amount = parseFloat(rawAmount);
    const fromC = (currencyDict[rawFrom] || rawFrom?.toUpperCase() || '').trim();
    const toC = (currencyDict[rawTo] || rawTo?.toUpperCase() || '').trim();
    
    if (isNaN(amount) || !fromC || !toC) {
      return client.say(channel, `⚠ Использование: !money <сумма> <из> <в>. Пример: !money 100 доллар рубль`);
    }

    try {
      const res = await axios.get('https://cbr-xml-daily.ru', { timeout: 5000 });
      if (res.data && res.data.Valute) {
        let fromRateInRub = 1;
        if (fromC !== 'RUB') {
          const vFrom = res.data.Valute[fromC];
          if (!vFrom) return client.say(channel, `⚠ Неизвестная валюта: ${fromC}`);
          fromRateInRub = vFrom.Value / vFrom.Nominal;
        }

        let toRateInRub = 1;
        if (toC !== 'RUB') {
          const vTo = res.data.Valute[toC];
          if (!vTo) return client.say(channel, `⚠ Неизвестная валюта: ${toC}`);
          toRateInRub = vTo.Value / vTo.Nominal;
        }

        let finalResult = ((amount * fromRateInRub) / toRateInRub).toFixed(2);
        client.say(channel, `💱 Конвертация: ${amount} ${fromC} = ${finalResult} ${toC}`);
      }
    } catch (e) { client.say(channel, `⚠ Ошибка конвертации.`); }
    return;
  }

  if (lowerMsg.startsWith('!weather') || lowerMsg.startsWith('!погода')) {
    let city = words.slice(1).join(' ').trim();
    if (!city) return client.say(channel, `⚠ Укажите город. Пример: !weather Москва`);
    try {
      const res = await axios.get('https://wttr.in' + encodeURIComponent(city), { params: { format: '%C  %t  💨 %w  💧 %h', lang: 'ru' }, timeout: 5000 });
      if (res.data) client.say(channel, `🌤 Погода в [${city.charAt(0).toUpperCase() + city.slice(1)}]: ${res.data.replace(/\s+/g, ' ').trim()}`);
    } catch (e) { client.say(channel, `⚠ Ошибка сервиса погоды.`); }
    return;
  }

  if (lowerMsg.startsWith('!time') || lowerMsg.startsWith('!время')) {
    let city = words.slice(1).join(' ').trim().toLowerCase();
    let opt = { hour: '2-digit', minute: '2-digit', hour12: false };
    if (!city) return client.say(channel, `🕒 Местное время: ${new Date().toLocaleTimeString('ru-RU', opt)}`);
    try {
      const trans = await translate(city, { to: 'en' });
      let en = trans.text.trim().replace(/\s+/g, '_');
      let regions = ['Europe', 'Asia', 'America', 'Australia', 'Africa'];
      let tz = null;
      for (let r of regions) {
        let check = r + '/' + en.charAt(0).toUpperCase() + en.slice(1);
        try { new Intl.DateTimeFormat('en', { timeZone: check }); tz = check; break; } catch(e) {}
      }
      if (tz) opt.timeZone = tz;
      client.say(channel, `🕒 Время в [${city.charAt(0).toUpperCase() + city.slice(1)}]: ${new Intl.DateTimeFormat('ru-RU', opt).format(new Date())}`);
    } catch (e) { client.say(channel, `⚠ Не удалось определить время.`); }
    return;
  }

  if (trimmedMsg.startsWith('!tr ')) {
    const trWords = [...wordsLower];
    trWords.shift(); 
    let lang = trWords.shift()?.toLowerCase(); 
    let text = words.slice(2).join(' '); 
    if (!lang || !text) return;
    try {
      const res = await translate(text, { to: lang });
      if (res?.text) client.say(channel, `🌐 [${lang.toUpperCase()}] ${authorName}: ${res.text.trim()}`);
    } catch (e) {}
    return;
  }

  // --- БЛОК 2: НАДЁЖНЫЙ АВТОПЕРЕВОДЧИК ЧАТА ЧЕРЕЗ MYMEMORY API ---
  let textToTranslate = msg;
  if (tags.emotes) {
    const positions = [];
    for (const id in tags.emotes) {
      for (const range of tags.emotes[id]) {
        const [start, end] = range.split('-').map(Number);
        positions.push({ start, end });
      }
    }
    positions.sort((a, b) => b.start - a.start);
    let arr = Array.from(msg);
    for (const p of positions) arr.splice(p.start, p.end - p.start + 1);
    textToTranslate = arr.join('').replace(/\s+/g, ' ').trim();
  }
  
  if (!textToTranslate || textToTranslate.length < 2) return;

  try {
    // Делаем независимый и стабильный запрос к API MyMemory для автоопределения и перевода на русский
    const response = await axios.get('https://translated.net', {
      params: {
        q: textToTranslate,
        langpair: 'autodetect|ru'
      },
      timeout: 4000
    });
    
    if (response.data && response.data.responseData && response.data.responseData.translatedText) {
      const translatedText = response.data.responseData.translatedText.trim();
      const detectedLang = response.data.responseDetails || '';
      
      // Игнорируем перевод, если MyMemory определил исходный язык как русский
      if (!detectedLang.toLowerCase().includes('from ru') && translatedText.toLowerCase() !== textToTranslate.toLowerCase()) {
        client.say(channel, `🌐 [Перевод] ${authorName}: ${translatedText}`);
      }
    }
  } catch (e) {
    console.log('Автоперевод пропущен:', e.message);
  }
}

function onConnectedHandler(addr, port) {
  console.log(`* Бот успешно подключился к ${addr}:${port}`);
}

const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('CGamer Bot is running 24/7\n');
}).listen(process.env.PORT || 3000, () => {
  console.log('Служебный веб-сервер запущен');
});
