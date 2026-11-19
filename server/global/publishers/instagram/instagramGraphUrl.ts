/**
 * Адрес Instagram Graph API по виду ключа INSTAGRAM_ACCESS_TOKEN.
 *
 * У Meta к Instagram API две «двери» с одинаковыми запросами (media, media_publish, статус контейнера):
 * - вход через Instagram: ключ начинается с IGAA, адрес graph.instagram.com;
 * - вход через Facebook, в том числе «API с единым входом» и системный пользователь бизнес-портфолио:
 *   ключ начинается с EAA, адрес graph.facebook.com. Ключ системного пользователя бессрочный.
 * Ключ одной двери другая не принимает («Cannot parse access token»), поэтому адрес выбирается по ключу.
 */

const API_VERSION = 'v26.0'

export const instagramGraphUrl = (token: string | undefined = process.env.INSTAGRAM_ACCESS_TOKEN): string =>
    token?.trim().startsWith('EAA')
        ? `https://graph.facebook.com/${API_VERSION}`
        : `https://graph.instagram.com/${API_VERSION}`
