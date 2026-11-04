
// ТОП ИГРОКОВ
else if (command === '!топ') {
    const top = Object.entries(profiles)
        .sort((a, b) => (b[1].coins || 0) - (a[1].coins || 0))
        .slice(0, 5)
        .map((entry, index) =>
            `${index + 1}. ${entry[0]} — ${entry[1].coins || 0} монет`
        );

    client.say(
        channel,
        top.length
            ? `🏆 Топ игроков: ${top.join(' | ')}`
            : 'Пока нет игроков.'
    );
}

// ТОП РЫБАКОВ
else if (command === '!топрыбаки') {
    const top = Object.entries(profiles)
        .sort((a, b) => (b[1].fish || 0) - (a[1].fish || 0))
        .slice(0, 5)
        .map((entry, index) =>
            `${index + 1}. ${entry[0]} — ${entry[1].fish || 0} рыб`
        );

    client.say(
        channel,
        top.length
            ? `🎣 Топ рыбаков: ${top.join(' | ')}`
            : 'Пока нет рыбаков.'
    );
}

// ПОГОДА
else if (command === '!погода' || command === '!weather') {
    if (!text) {
        client.say(channel, 'Напиши город: !погода Москва');
        return;
    }

    const w = await getWeather(text);

    client.say(
        channel,
        `🌤 ${w.city}, ${w.country}: ${w.temperature}°C, ощущается ${w.feels}°C, влажность ${w.humidity}%, ветер ${w.wind} км/ч.`
    );
}

// ВРЕМЯ
else if (command === '!время' || command === '!time') {
    if (!text) {
        client.say(channel, 'Напиши город: !время Токио');
        return;
    }

    const t = await getCityTime(text);

    client.say(
        channel,
        `🕒 ${t.city}, ${t.country}: ${t.time} (${t.timezone})`
    );
}

// КУРС ВАЛЮТ
else if (command === '!курс' || command === '!rate') {
    if (!text) {
        client.say(channel, 'Напиши валюту: !курс доллар');
        return;
    }

    const currency =
        currencyDict[text.toLowerCase()] || text.toUpperCase();

    const rate = await getCurrencyRate(currency);
    const value = rate.value / rate.nominal;

    client.say(
        channel,
        `💱 ${rate.name}: ${value.toFixed(2)} RUB за 1 единицу.`
    );
}

// РУЧНОЙ ПЕРЕВОД НА РУССКИЙ
else if (command === '!перевод' || command === '!translate') {
    if (!text) {
        client.say(channel, 'Используй: !перевод Hello');
        return;
    }

    const translated = await translateText(text, 'auto', 'ru');

    client.say(
        channel,
        `🌐 @${username}: ${translated.slice(0, 350)}`
    );
}

// ПЕРЕВОД С РУССКОГО НА ДРУГОЙ ЯЗЫК
else if (command === '!на') {
    const targetName = args[1]?.toLowerCase();
    const translationText = args.slice(2).join(' ');

    if (!targetName || !translationText) {
        client.say(
            channel,
            'Используй: !на английский Привет или !на en Привет'
        );
        return;
    }

    const targetLanguage = languages[targetName] || targetName;

    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/i.test(targetLanguage)) {
        client.say(channel, '❌ Неизвестный код языка.');
        return;
    }

    const translated = await translateText(
        translationText,
        'ru',
        targetLanguage
    );

    client.say(
        channel,
        `🌐 @${username}: ${translated.slice(0, 350)}`
    );
}
