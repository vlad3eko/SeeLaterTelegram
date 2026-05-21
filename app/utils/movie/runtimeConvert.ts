export const runtimeConvert = (totalMinutes: number | undefined) => {
    if (totalMinutes) {
        const hour = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60

        if (minutes === 0) {
            return ` ${hour} ч.`
        }

        if (hour === 0) {
            return `${minutes} мин.`
        }

        if (hour && minutes) {
            return `${hour} ч. ${minutes} мин.`
        }

        return `-`

    } else {
        return `-`
    }
}
