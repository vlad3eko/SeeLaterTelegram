export const getPersonAge = (
    birthday: string | undefined,
    deathday?: string | undefined
) => {

    if (!birthday) return '';

    const birthDate = new Date(birthday);

    const endDate = deathday
        ? new Date(deathday)
        : new Date();

    let age =
        endDate.getFullYear() -
        birthDate.getFullYear();

    const month =
        endDate.getMonth() -
        birthDate.getMonth();

    if (
        month < 0 ||
        (
            month === 0 &&
            endDate.getDate() < birthDate.getDate()
        )
    ) {
        age--;
    }

    return age;
};
