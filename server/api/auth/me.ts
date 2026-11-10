
import {getSessionUser} from '#server/utils/api/sessionUser'

export default defineEventHandler(async (event) => {
    return await getSessionUser(event)
})
