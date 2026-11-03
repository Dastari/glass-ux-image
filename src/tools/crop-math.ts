import { clampCrop, type Rect, type Size } from "../core/index.js";
export type CropHandle = "move" | "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw";
/** The smallest crop a drag can make, in picture pixels. */
export const MIN_CROP = 8;
/** Keep an aspect-locked rectangle inside bounds by shrinking it toward its anchored side. */
function withAspect(box: {
    left: number;
    top: number;
    right: number;
    bottom: number;
}, aspect: number, handle: CropHandle, bounds: Size) {
    const horizontal = handle.includes("e") || handle.includes("w");
    let width = box.right - box.left;
    let height = box.bottom - box.top;
    if (horizontal)
        height = width / aspect;
    else
        width = height * aspect;
    // An edge handle grows the other axis around its middle; a corner grows away from the opposite corner.
    const centerX = (box.left + box.right) / 2;
    const centerY = (box.top + box.bottom) / 2;
    const fromLeft = handle.includes("w") ? box.right - width : handle.includes("e") ? box.left : centerX - width / 2;
    const fromTop = handle.includes("n") ? box.bottom - height : handle.includes("s") ? box.top : centerY - height / 2;
    const roomX = handle.includes("w") ? box.right : handle.includes("e") ? bounds.width - box.left : Math.min(centerX, bounds.width - centerX) * 2;
    const roomY = handle.includes("n") ? box.bottom : handle.includes("s") ? bounds.height - box.top : Math.min(centerY, bounds.height - centerY) * 2;
    const shrink = Math.min(1, roomX / width, roomY / height);
    if (shrink >= 1)
        return { x: fromLeft, y: fromTop, width, height };
    const small = { width: width * shrink, height: height * shrink };
    return {
        ...small,
        x: handle.includes("w") ? box.right - small.width : handle.includes("e") ? box.left : centerX - small.width / 2,
        y: handle.includes("n") ? box.bottom - small.height : handle.includes("s") ? box.top : centerY - small.height / 2,
    };
}
/** Where a drag of `dx, dy` picture pixels on a handle leaves the crop. */
export function dragCrop(start: Rect, handle: CropHandle, dx: number, dy: number, bounds: Size, aspect: number | null): Rect {
    if (handle === "move") {
        return {
            x: Math.round(Math.max(0, Math.min(bounds.width - start.width, start.x + dx))),
            y: Math.round(Math.max(0, Math.min(bounds.height - start.height, start.y + dy))),
            width: start.width,
            height: start.height,
        };
    }
    const box = { left: start.x, top: start.y, right: start.x + start.width, bottom: start.y + start.height };
    if (handle.includes("w"))
        box.left = Math.max(0, Math.min(box.right - MIN_CROP, box.left + dx));
    if (handle.includes("e"))
        box.right = Math.min(bounds.width, Math.max(box.left + MIN_CROP, box.right + dx));
    if (handle.includes("n"))
        box.top = Math.max(0, Math.min(box.bottom - MIN_CROP, box.top + dy));
    if (handle.includes("s"))
        box.bottom = Math.min(bounds.height, Math.max(box.top + MIN_CROP, box.bottom + dy));
    const free = { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
    return clampCrop(aspect ? withAspect(box, aspect, handle, bounds) : free, bounds);
}
