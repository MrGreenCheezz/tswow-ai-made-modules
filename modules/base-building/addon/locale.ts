export function uiText(english: string, russian: string): string {
    return GetLocale() == "ruRU" ? russian : english;
}

/** Keep workforce protocol keys stable while localizing their displayed text. */
export function localizedWireText(message: string): string {
    if (GetLocale() == "ruRU") return message;
    if (message == "Состояние работников изменилось; список обновлён.") return "The workforce state changed; the list has been refreshed.";
    if (message == "Коллекция спутников ещё загружается.") return "The companion collection is still loading.";
    if (message == "Выбранное рабочее место больше не существует.") return "The selected workplace no longer exists.";
    if (message == "Это рабочее место уже занято.") return "This workplace is already occupied.";
    if (message == "Спутник активен, находится в экспедиции или недоступен.") return "The companion is active, on an expedition, or unavailable.";
    if (message == "Профессия спутника несовместима с этим рабочим местом.") return "The companion's profession is incompatible with this workplace.";
    if (message == "Некорректный запрос работника.") return "Invalid workforce request.";
    if (message == "Неизвестное действие работника.") return "Unknown workforce action.";
    return message;
}
