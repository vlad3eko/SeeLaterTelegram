import {ContentStrategy} from "~/utils/engines/content/strategy/enums";
import {executeDataProvider} from "~/utils/engines/content/strategy/executeDataProvider";

export const generateContentEntry = async (ctx: any) => {

    await ctx.answerCbQuery()

    const strategy = ctx.match[1] as ContentStrategy
    const userId = ctx.match[2]

    const executeProvider = await executeDataProvider(strategy, userId)
    console.log('eP', executeProvider)

}

// Data Provider
    // Что посмотреть вечером
    // Премьеры месяца
    // Что выходит сегодня
    // Лучшие фильмы Тома Хэнкса
    // Лучшие триллеры 2025
    // Фильмы похожие на Интерстеллар
    // 10 фильмов с неожиданной концовкой
    // Фильмы, которые выйдут через неделю
    // Самые ожидаемые сериалы осени

// Collection Builder
    // Премьеры августа
    // Новинки Netflix
    // Лучшие ужасы
    // Фильмы Нолана
    // Что посмотреть сегодня
    // Самые ожидаемые сериалы


// Ranking Engine
    // Популярность + Количество голосов + Рейтинг + Дата релиза + Известность актёров + Известность режиссёра + Франшиза + Ожидаемость
    // 180 фильмов
    //       ↓
    // Ranking Engine
    //       ↓
    // 20 лучших кандидатов

// Collection / Content Object «Как должен выглядеть контент?»
    // Collection
    // ----------------
    // id
    // title
    // type
    // source
    // filters
    // movies[]
    // ranking
    // created_at
    // updated_at
    // status

// Renderer «Куда его отправить?»
    // Collection
    //     │
    //     ├── Telegram Renderer
    //     ├── Instagram Renderer
    //     ├── Reels Renderer
    //     ├── Push Renderer
    //     ├── Web Renderer
    //     └── PDF Renderer

// Publisher
    // Telegram Renderer -> Telegram Publisher -> Канал
    // Instagram Renderer -> Instagram Publisher


// Editor Panel
    // Создать материал
    //        ↓
    // Выбрать тип
    //        ↓
    // Выбрать источник
    //        ↓
    // Настроить фильтры
    //        ↓
    // Выбрать количество
    //        ↓
    // Получить кандидатов
    //        ↓
    // Посмотреть подборку
    //        ↓
    // Отредактировать
    //        ↓
    // Сгенерировать контент
    //        ↓
    // Выбрать каналы
    //        ↓
    // Предпросмотр
    //        ↓
    // Опубликовать


//  Фильмовые данные — это сырьё.
//  Collection Builder решает, что собрать.
//  Ranking Engine решает, что важно.
//  Редактор принимает финальное решение.
//  AI Editor превращает выбранный материал в качественный текст.
//  Renderer адаптирует его под конкретный формат.
//  Publisher доставляет его в конкретный канал.
