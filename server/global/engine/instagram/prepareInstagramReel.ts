import {downloadTrailer} from "./downloadTrailer"
import {trimVideo} from "./trimVideo"

export const prepareInstagramReel = async (
    keyTrailer: string
) => {
    const sourcePath =
        await downloadTrailer(
            keyTrailer
        )

    const trimmedPath =
        await trimVideo(
            sourcePath,
            keyTrailer
        )

    return {
        sourcePath,
        trimmedPath
    }
}
