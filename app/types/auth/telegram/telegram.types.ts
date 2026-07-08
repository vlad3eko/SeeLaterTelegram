export interface TelegramCreateData {
    confirmed: boolean
    created_at: string
    telegram_id: null | number
    token: string
}

export interface TelegramUser {
    created_at?: string
    first_name: string
    id: number
    telegram_id: number
    username: string
}

export interface TelegramResponse {
    data: TelegramCreateData
    user: TelegramUser
}

