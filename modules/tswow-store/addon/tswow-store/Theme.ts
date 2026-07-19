/** Shared visual rules for the store module's component files. */

export const STORE_FONT = (_G["GameFontNormal"] as WoWAPI.FontInstance).GetFont()[0];
export const STORE_RUSSIAN = GetLocale() == "ruRU";

export function storeText(english: string, russian: string): string {
    return STORE_RUSSIAN ? russian : english;
}

export function styleText(text: WoWAPI.FontString, size: number): void {
    text.SetFont(STORE_FONT, size, "OUTLINE");
    text.SetShadowOffset(1, -1);
}

export function registerExclusiveWindow(frame: WoWAPI.Frame): void {
    hooksecurefunc(frame as any, "Show", () => {
        const globals = _G as any;
        const previous = globals.TSWOW_ActiveSystemWindow as WoWAPI.Frame | undefined;
        if (previous && previous != frame && previous.IsShown()) previous.Hide();
        globals.TSWOW_ActiveSystemWindow = frame;
    });
}

export function configureStoreFrame(frame: WoWAPI.Frame): void {
    frame.SetSize(1040, 720);
    frame.SetScale(0.9 * Math.min(
        1,
        (UIParent.GetWidth() - 40) / 1040,
        (UIParent.GetHeight() - 40) / 720,
    ));
    frame.SetClampedToScreen(true);
}
