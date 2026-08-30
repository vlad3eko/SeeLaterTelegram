interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
    language_code?: string;
}

interface CallbackQuery {
    id: string;
    from: TelegramUser;
    inline_message_id?: string;
    chat_instance: string;
    data?: string;
}

interface TelegramUpdate {
    update_id: number;
    callback_query?: CallbackQuery;
}

interface TelegramOptions {
    apiRoot: string;
    apiMode: string;
    webhookReply: boolean;
    agent: any;
    attachmentAgent?: any;
    testEnv: boolean;
}

interface TelegramBotInfo {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
    supports_inline_queries: boolean;
    supports_guest_queries: boolean;
    can_connect_to_business: boolean;
    has_main_web_app: boolean;
    has_topics_enabled: boolean;
    allows_users_to_create_topics: boolean;
    can_manage_bots: boolean;
    supports_join_request_queries: boolean;
}

// Основной интерфейс вашего контекста (ctx)
export interface TelegrafContext {
    update: TelegramUpdate;
    telegram: {
        token: string;
        response: any;
        options: TelegramOptions;
    };
    botInfo: TelegramBotInfo;
    state: Record<string, any>;
    match: RegExpMatchArray;
}
