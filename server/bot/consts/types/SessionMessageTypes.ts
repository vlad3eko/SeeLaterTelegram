import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";

export enum SessionMessageType {
    Media = 'media',
    Text = 'text',
    Command = 'command',
    Error = 'error',
    Temp = 'temp',
    Menu = 'menu',
    SearchInline = 'searchInline',
    SendMediaCard = 'SendMediaCard',
    Auth = 'auth',
    InlineMediaCard = 'InlineMediaCard'
}

export const SessionMessageNotificationType = {
    Saved: NOTIFICATION_MESSAGE.CbQ.SuccessSaved
} as const

