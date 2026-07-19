import { styleText } from "../Theme";

let defaultGameMenuButtons = [
    "GameMenuButtonOptions",
    "GameMenuButtonSoundOptions",
    "GameMenuButtonUIOptions",
    "GameMenuButtonKeybindings",
    "GameMenuButtonMacros",
    "GameMenuButtonLogout",
    "GameMenuButtonQuit",
    "GameMenuButtonContinue"
];

export function GameMenuButton(parent: WoWAPI.Frame, buttonText: string) {
    GameMenuFrame.SetSize(GameMenuFrame.GetWidth(), GameMenuFrame.GetHeight() + 23);

    const gameMenuButton = CreateFrame("Button", 'gamemenu' + buttonText.replace(" ", ""), GameMenuFrame, "UIPanelButtonTemplate");
    defaultGameMenuButtons = [gameMenuButton.GetName()].concat(defaultGameMenuButtons)
    gameMenuButton.SetPoint("TOP", GameMenuFrame, "TOP", 0, 0);
    gameMenuButton.SetSize(144, 21);

    const gameMenuButtonText = gameMenuButton.CreateFontString(null, "OVERLAY", "GameFontNormal");
    styleText(gameMenuButtonText, 12);
    gameMenuButtonText.SetText(buttonText);
    gameMenuButtonText.SetPoint("CENTER",);
    gameMenuButtonText.SetTextColor(0.5, 0.7, 1)

    gameMenuButton.SetScript("OnClick", (f, button, down) => {
        HideUIPanel(GameMenuFrame);
        if (parent.IsShown() && parent.IsVisible())
            parent.Hide();
        else
            parent.Show();
    });
    let yOffset = -25;
    defaultGameMenuButtons.forEach(buttonName => {
        if (buttonName == "GameMenuButtonContinue") yOffset -= 15;//bigger space for 'Return to Game'
        const MenuButton: WoWAPI.Frame = _G[buttonName];
        if (MenuButton) {
            MenuButton.ClearAllPoints();
            MenuButton.SetPoint("TOP", GameMenuFrame, "TOP", 0, yOffset);
            yOffset -= 23;
        }
    })
}


