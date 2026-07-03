import {dateConvert} from "~/utils/convert/dateConvert";
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";

export const releaseDate = (media:any, none: string = '❌официальной даты пока нет') => {
    const mediaDate = dateConvert(media.release_date) || dateIsoConvert(media.first_air_date);

    if (mediaDate) {
        const [day, month, year] = mediaDate.split('.');
        const mediaTimestamp = new Date(`${year}-${month}-${day}`).getTime();
        const todayTimestamp = new Date().getTime();
        const isFuture = todayTimestamp > mediaTimestamp;

        return isFuture ? `✅ ${mediaDate}` : `❌ ${mediaDate}`;
    } else {
        return none
    }
}
