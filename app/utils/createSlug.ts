import slugify from "slugify";

export const createSlug = (id: number, title: string) => {

    if (!id && !title) return

    return `${id}-${slugify(title, {
        lower: true,
        strict: true,
        locale: 'ru'
    })}`
}
