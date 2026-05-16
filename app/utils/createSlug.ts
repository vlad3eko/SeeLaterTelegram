import slugify from "slugify";

export const createSlug = (id: number, title: string) => {
    return `${id}-${slugify(title, {
        lower: true,
        strict: true,
        locale: 'ru'
    })}`
}
