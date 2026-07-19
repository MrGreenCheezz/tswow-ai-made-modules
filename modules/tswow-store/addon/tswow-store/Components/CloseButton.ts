export function createCloseButton(parent: WoWAPI.Frame, size: { width: number; height: number }, closeFunction: () => void) {
    const closeButton = CreateFrame("Button", "", parent, "UIPanelCloseButton");
    closeButton.SetSize(size.width, size.height);
    closeButton.SetPoint("TOPRIGHT", -4, -7);
    closeButton.EnableMouse(true);
    closeButton.SetScript("OnClick", (frame, button, down) => { closeFunction(); });
}
