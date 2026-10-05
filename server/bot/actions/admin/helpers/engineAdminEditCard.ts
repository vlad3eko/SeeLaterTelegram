import { engineRichCard } from "#server/global/engine/card/engineRichCard"
import type { queryRichCard } from "#server/global/engine/card/enum/types"
import type { AdminEditSession } from "#server/bot/actions/admin/adminEditSession"
import { getAdminEditTarget } from "#server/bot/actions/admin/helpers/getAdminEditTarget"

export const engineAdminEditCard = async (ctx: any, session: AdminEditSession, query: queryRichCard) => {
    const target = getAdminEditTarget(session)

    if (!target) {
        throw new Error('[engineAdminEditCard] Admin edit target not found')
    }

    return engineRichCard({ ctx, ...target, isAdmin: true }, query)
}
