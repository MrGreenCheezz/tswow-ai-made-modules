export function createIcon(parentFrame: WoWAPI.Frame, texturePath: WoWAPI.TexturePath, point: { point: WoWAPI.Point; offsetX: number; offsetY: number }, size: { width: number; height: number }, layer?: WoWAPI.Layer) {
    const iconFrame = CreateFrame("Frame", "", parentFrame);
    iconFrame.SetSize(size.width, size.height);
    iconFrame.SetPoint(point.point, point.offsetX, point.offsetY);

    iconFrame['texture'] = iconFrame.CreateTexture("", layer || "ARTWORK");
    iconFrame['texture'].SetTexture(texturePath);
    iconFrame['texture'].SetPoint("CENTER", iconFrame, "CENTER")
    iconFrame['texture'].SetSize(iconFrame.GetWidth(), iconFrame.GetHeight());
    iconFrame['texture'].SetTexCoord(0.06, 0.94, 0.06, 0.94);

    return iconFrame;
}
