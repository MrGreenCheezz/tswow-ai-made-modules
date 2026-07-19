
import { storeText, styleText } from "../Theme";

const turnSpeed = 100
const dragSpeed = 100
const zoomSpeed = 0.1
const maxZoomOutLevel = 0; // Adjust this value if you want to limit zooming out
const maxZoomInLevel = 3; // Adjust this value if you want to limit zooming in

export function setupModelFrame() {
    const modelFrame = CreateFrame("Frame", "shopModelFrame", _G['ShopMainFrame'])
    modelFrame.SetSize(270,400);
    modelFrame.SetClampedToScreen(true);
    modelFrame.EnableMouse(true)
    modelFrame.SetMovable(true)
    modelFrame.Hide()

    modelFrame.SetScript("OnShow", (self, key) => {
        self.ClearAllPoints()
        self.SetPoint("LEFT", _G['ShopMainFrame'], "RIGHT", -8, 20)
    })

    modelFrame.SetScript("OnHide", (self, key) => {
        PlaySound("igMainMenuOpen");
    })

    modelFrame.RegisterForDrag("LeftButton");

    modelFrame.SetScript("OnDragStart", () => {
        modelFrame.StartMoving();
    })

    modelFrame.SetScript("OnDragStop", () => {
        modelFrame.StopMovingOrSizing();
    })

    let modelFrameText = modelFrame.CreateFontString(`ModelFameTitle`, `OVERLAY`, `GameFontNormalSmall`)
    styleText(modelFrameText, 12);
    modelFrameText.SetPoint("CENTER", 0, 185);
    modelFrameText.SetTextColor(1, 1, 0)
    modelFrameText.SetText(storeText("Preview", "Предпросмотр"));

    // Background Texture
    const modelFrameBackground = modelFrame.CreateTexture(`BGTexture`, "BACKGROUND")
    modelFrameBackground.SetAllPoints(modelFrame)
    modelFrameBackground.SetTexture("Interface\\AddOns\\dh-store-assets\\itemdisplay.blp")
    modelFrameBackground.SetTexCoord(0.013671875, 0.552734375, 0.011718750, 0.750000000)
    modelFrameBackground.Show()

    // Close Button 
    const modelFrameCloseButton = CreateFrame("Button", "closeModelFrame", modelFrame, "UIPanelCloseButton")
    modelFrameCloseButton.SetSize(30, 30)
    modelFrameCloseButton.SetPoint("TOPRIGHT", modelFrame, "TOPRIGHT", 4, -2)
    modelFrameCloseButton.EnableMouse(true)

    modelFrameCloseButton.SetScript("OnClick", () => {
        modelFrame.Hide()
    })

    // Reset Button
    const modelFrameResetButton = CreateFrame("Button", "resetModelFrame", modelFrame, "UIPanelButtonTemplate");
    modelFrameResetButton.SetSize(96, 24)
    modelFrameResetButton.SetPoint("BOTTOM", modelFrame, "BOTTOM", 0, 14)
    modelFrameResetButton.EnableMouse(true)
    modelFrameResetButton.SetText(storeText("Reset", "Сброс"))
    styleText(modelFrameResetButton.GetFontString(), 11);

    modelFrameResetButton.SetScript("OnClick", () => {
        modelFramePlayerModel.SetPosition(0, 0, 0)
        modelFramePlayerModel.SetFacing(0)
        creatureModelFrame.SetPosition(0, 0, 0)
        creatureModelFrame.SetFacing(45)
        PlaySound("igMainMenuOptionCheckBoxOn")
    })

    // Player Model Frame
    const modelFramePlayerModel = CreateFrame("DressUpModel", "shopPlayerModelFrame", modelFrame)
    modelFramePlayerModel.SetSize(modelFrame.GetWidth()-20, modelFrame.GetHeight()-70)
    modelFramePlayerModel.SetPoint("CENTER", modelFrame, "CENTER", 5, 0)

    const creatureModelFrame = CreateFrame('DressUpModel', "shopCreatureModelFrame", modelFrame)
    creatureModelFrame.SetSize(modelFrame.GetWidth() -20, modelFrame.GetHeight()-70)
    creatureModelFrame.SetPoint("CENTER", modelFrame, "CENTER", 5, 0)
    creatureModelFrame.SetFacing(45)


    // PlayerModelFrame Mouse Drag
    setupRotateDragZoom(creatureModelFrame)
    setupRotateDragZoom(modelFramePlayerModel)
    return modelFrame
}

function setupRotateDragZoom(modelFramePlayerModel: WoWAPI.PlayerModel) {
    modelFramePlayerModel.SetPosition(0, 0, 0)
    modelFramePlayerModel.EnableMouse(true)
    modelFramePlayerModel.EnableMouseWheel(true)

    const modelFrameWidth = modelFramePlayerModel.GetWidth()
    const modelFrameHeight = modelFramePlayerModel.GetHeight()

    modelFramePlayerModel.SetScript("OnMouseDown", (self, button) => {
        let startPOS = GetCursorPosition()

        if (button == "LeftButton") {
            modelFramePlayerModel.SetScript("OnUpdate", (self: WoWAPI.DressUpModel) => {
                let curX = GetCursorPosition()[0];
                let deltaX = (curX - startPOS[0]) / turnSpeed;
                self.SetFacing(self.GetFacing() + deltaX);
                startPOS[0] = curX
            })
        } else if (button == "RightButton") {
            modelFramePlayerModel.SetScript("OnUpdate", function (self: WoWAPI.DressUpModel) {
                let cursorPos = GetCursorPosition()
                let pos = self.GetPosition()
                let newPosX = pos[1] + (cursorPos[0] - startPOS[0]) / dragSpeed;
                let newPosY = pos[2] + (cursorPos[1] - startPOS[1]) / dragSpeed;

                if (newPosX < -0.9) newPosX = -0.9; // Left X boundary 
                if (newPosX > 0.8) newPosX = 0.8; // Right X boundary 
                if (newPosY < -0.45) newPosY = -0.45; // Lower Y boundary
                if (newPosY > 0.51) newPosY = 0.51; // Upper Y boundary

                self.SetPosition(pos[0], newPosX, newPosY);
                startPOS[0] = cursorPos[0];
                startPOS[1] = cursorPos[1];
            });
        }
    })

    modelFramePlayerModel.SetScript("OnMouseUp", (self: WoWAPI.DressUpModel, button) => {
        self.SetScript("OnUpdate", null)
    })

    modelFramePlayerModel.SetScript("OnMouseWheel", (self: WoWAPI.DressUpModel, zoom) => {
        let pos = self.GetPosition()


        if (zoom == 1) {
            pos[0] += zoomSpeed;
            if (pos[0] > maxZoomInLevel) {
                pos[0] = maxZoomInLevel;
            }
        } else {
            pos[0] -= zoomSpeed;
            if (pos[0] < maxZoomOutLevel) {
                pos[0] = maxZoomOutLevel;
            }
        }
        self.SetPosition(pos[0], pos[1], pos[2])
    })
}
