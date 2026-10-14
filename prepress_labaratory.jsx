#target illustrator

function getItemLabel(item, fallbackType, index) {
    var typeName = fallbackType || (item && item.typename ? item.typename : "Item");
    var idxLabel = (index !== undefined) ? " #" + (index + 1) : "";
    if (item && item.name && String(item.name).length > 0) {
        return String(item.name) + " (" + typeName + ")";
    }
    return "<" + typeName + idxLabel + ">";
}

function getPlacedLabel(item, index) {
    var name = getItemLabel(item, "PlacedItem", index);
    if (item && item.file) {
        return name + " - " + decodeURI(item.file.name);
    }
    if (item && item.embedded) {
        return name + " - embedded";
    }
    return name + " - missing-link";
}

function getLayerName(item) {
    try {
        if (item && item.layer && item.layer.name) {
            return String(item.layer.name);
        }
    } catch (e1) {}
    try {
        if (item && item.parent && item.parent.typename === "Layer" && item.parent.name) {
            return String(item.parent.name);
        }
    } catch (e2) {}
    return "N/A";
}

function pushError(errors, item, elementText) {
    errors.push({
        layer: getLayerName(item),
        element: elementText
    });
}

function isSpotWithCMYKBase(color) {
    return color &&
        color.typename === "SpotColor" &&
        color.spot &&
        color.spot.color &&
        color.spot.color.typename === "CMYKColor";
}

function isCMYKCompatibleColor(color) {
    if (!color) {
        return true;
    }
    if (color.typename === "NoColor") {
        return true;
    }
    if (color.typename === "CMYKColor") {
        return true;
    }
    if (isSpotWithCMYKBase(color)) {
        return true;
    }
    return false;
}

function checkColorValue(label, color, errors, itemForLayer) {
    if (!isCMYKCompatibleColor(color)) {
        var colorType = color && color.typename ? color.typename : "UnknownColor";
        pushError(errors, itemForLayer, label + " - " + colorType);
    }
}

function getImageColorSpaceName(imageItem) {
    try {
        if (imageItem.imageColorSpace !== undefined && imageItem.imageColorSpace !== null) {
            return String(imageItem.imageColorSpace);
        }
    } catch (e1) {}
    try {
        if (imageItem.colorSpace !== undefined && imageItem.colorSpace !== null) {
            return String(imageItem.colorSpace);
        }
    } catch (e2) {}
    return "";
}

function isCMYKImageColorSpace(spaceName) {
    if (!spaceName || spaceName.length === 0) {
        return false;
    }
    var normalized = spaceName.toUpperCase();
    return normalized.indexOf("CMYK") !== -1;
}

function getRawImageColorSpaceValue(imageItem) {
    try {
        if (imageItem.imageColorSpace !== undefined && imageItem.imageColorSpace !== null) {
            return imageItem.imageColorSpace;
        }
    } catch (e1) {}
    try {
        if (imageItem.colorSpace !== undefined && imageItem.colorSpace !== null) {
            return imageItem.colorSpace;
        }
    } catch (e2) {}
    return null;
}

function getImageColorSpaceLabelFromRaw(rawValue) {
    if (rawValue === null || rawValue === undefined) {
        return "Unknown";
    }
    try {
        if (ImageColorSpace) {
            if (rawValue === ImageColorSpace.CMYK) {
                return "CMYK";
            }
            if (rawValue === ImageColorSpace.RGB) {
                return "RGB";
            }
            if (rawValue === ImageColorSpace.Grayscale) {
                return "Grayscale";
            }
            if (rawValue === ImageColorSpace.LAB) {
                return "LAB";
            }
        }
    } catch (enumErr) {}
    return String(rawValue);
}

function getImageCMYKState(imageItem) {
    var rawValue = getRawImageColorSpaceValue(imageItem);
    if (rawValue === null || rawValue === undefined) {
        return { state: "unknown", label: "Unknown" };
    }

    try {
        if (ImageColorSpace && rawValue === ImageColorSpace.CMYK) {
            return { state: "cmyk", label: "CMYK" };
        }
    } catch (enumErr) {}

    var label = getImageColorSpaceLabelFromRaw(rawValue);
    var normalized = label.toUpperCase();
    if (normalized.indexOf("CMYK") !== -1) {
        return { state: "cmyk", label: label };
    }
    if (normalized.indexOf("RGB") !== -1 || normalized.indexOf("GRAY") !== -1 || normalized.indexOf("LAB") !== -1) {
        return { state: "non_cmyk", label: label };
    }
    return { state: "unknown", label: label };
}

function collectDocumentCache(doc) {
    return {
        pageItems: doc.pageItems,
        pathItems: doc.pathItems,
        textFrames: doc.textFrames,
        placedItems: doc.placedItems,
        rasterItems: doc.rasterItems,
        gradients: doc.gradients
    };
}

function checkAllElementsCMYK(cache, progress, checkLabel) {
    var errors = [];
    var pageItems = cache.pageItems;
    var i;

    for (i = 0; i < pageItems.length; i++) {
        var item = pageItems[i];
        var label = getItemLabel(item, item.typename, i);

        try {
            if (item.filled) {
                checkColorValue(label + " Fill", item.fillColor, errors, item);
            }
        } catch (e1) {}

        try {
            if (item.stroked) {
                checkColorValue(label + " Stroke", item.strokeColor, errors, item);
            }
        } catch (e2) {}

        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, pageItems.length);
        }
    }

    var textFrames = cache.textFrames;
    for (i = 0; i < textFrames.length; i++) {
        var textItem = textFrames[i];
        var textLabel = getItemLabel(textItem, "TextFrame", i);
        try {
            checkColorValue(textLabel + " Text Fill", textItem.textRange.fillColor, errors, textItem);
            checkColorValue(textLabel + " Text Stroke", textItem.textRange.strokeColor, errors, textItem);
        } catch (e3) {}

        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, textFrames.length);
        }
    }

    var gradients = cache.gradients;
    for (i = 0; i < gradients.length; i++) {
        var gradient = gradients[i];
        var j;
        for (j = 0; j < gradient.gradientStops.length; j++) {
            var stop = gradient.gradientStops[j];
            checkColorValue("Gradient " + gradient.name + " Stop " + (j + 1), stop.color, errors, null);
        }
        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, gradients.length);
        }
    }

    var rasterItems = cache.rasterItems;
    for (i = 0; i < rasterItems.length; i++) {
        var rasterItem = rasterItems[i];
        var rasterSpaceName = getImageColorSpaceName(rasterItem);
        if (!isCMYKImageColorSpace(rasterSpaceName)) {
            var rasterLabel = getItemLabel(rasterItem, "RasterItem", i);
            var rasterSpace = rasterSpaceName.length > 0 ? rasterSpaceName : "UnknownImageColorSpace";
            pushError(errors, rasterItem, rasterLabel + " Image Color Space - " + rasterSpace);
        }
        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, rasterItems.length);
        }
    }

    var placedItems = cache.placedItems;
    for (i = 0; i < placedItems.length; i++) {
        var placedItem = placedItems[i];
        // Embedded images inherit document color space and are considered safe.
        if (!placedItem.embedded) {
            var linkedSpace = getImageCMYKState(placedItem);
            if (linkedSpace.state === "non_cmyk") {
                var placedLabel = getPlacedLabel(placedItem, i);
                pushError(errors, placedItem, placedLabel + " Image Color Space - " + linkedSpace.label + " (linked)");
            }
        }
        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, placedItems.length);
        }
    }

    return errors;
}

function checkAllImagesAreTIFF(cache, progress, checkLabel) {
    var errors = [];
    var placedItems = cache.placedItems;
    for (var i = 0; i < placedItems.length; i++) {
        var item = placedItems[i];
        var itemLabel = getPlacedLabel(item, i);
        if (!item.file) {
            pushError(errors, item, itemLabel + " - unknown-extension");
            continue;
        }

        var fileName = String(item.file.name).toLowerCase();
        if (!(fileName.match(/\.tif$/) || fileName.match(/\.tiff$/))) {
            pushError(errors, item, itemLabel);
        }

        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, placedItems.length);
        }
    }
    return errors;
}

function checkAllImagesEmbedded(cache, progress, checkLabel) {
    var errors = [];
    var placedItems = cache.placedItems;
    for (var i = 0; i < placedItems.length; i++) {
        var item = placedItems[i];
        if (!item.embedded) {
            pushError(errors, item, getPlacedLabel(item, i));
        }
        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, placedItems.length);
        }
    }
    return errors;
}

function isCutLayerItem(item) {
    try {
        if (item && item.layer && item.layer.name) {
            return String(item.layer.name).replace(/^\s+|\s+$/g, "").toUpperCase() === "CUT";
        }
    } catch (e) {}
    return false;
}

function checkAllStrokesInCurves(cache, progress, checkLabel, options) {
    var errors = [];
    var paths = cache.pathItems;
    var ignoreCutLayer = options && options.ignoreCutLayer;
    for (var i = 0; i < paths.length; i++) {
        var path = paths[i];
        if (ignoreCutLayer && isCutLayerItem(path)) {
            if (progress) {
                progress.yieldLoop(checkLabel, i + 1, paths.length);
            }
            continue;
        }
        if (path.stroked && Number(path.strokeWidth) > 0) {
            pushError(errors, path, getItemLabel(path, "PathItem", i));
        }
        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, paths.length);
        }
    }
    return errors;
}

function checkAllTextInCurves(cache, progress, checkLabel) {
    var errors = [];
    var textFrames = cache.textFrames;
    for (var i = 0; i < textFrames.length; i++) {
        pushError(errors, textFrames[i], getItemLabel(textFrames[i], "TextFrame", i));
        if (progress) {
            progress.yieldLoop(checkLabel, i + 1, textFrames.length);
        }
    }
    return errors;
}

var CMYK_ROUND_EPSILON = 0.0001;

function isCMYKChannelNotWhole(v) {
    var n = Number(v);
    return Math.abs(n - Math.round(n)) > CMYK_ROUND_EPSILON;
}

/** Up to 3 decimal places; trims trailing zeros (40 not 40.000, 43.12 stays 43.12). */
function formatNumberUpTo3Decimals(v) {
    var n = Number(v);
    if (isNaN(n)) {
        return "0";
    }
    var s = n.toFixed(3);
    if (s.indexOf(".") !== -1) {
        s = s.replace(/0+$/, "");
        s = s.replace(/\.$/, "");
    }
    return s;
}

function formatCMYKChannels(cmyk) {
    if (!cmyk || cmyk.typename !== "CMYKColor") {
        return "";
    }
    return "C:" + formatNumberUpTo3Decimals(cmyk.cyan) +
        " M:" + formatNumberUpTo3Decimals(cmyk.magenta) +
        " Y:" + formatNumberUpTo3Decimals(cmyk.yellow) +
        " K:" + formatNumberUpTo3Decimals(cmyk.black);
}

function getNonWholeCMYKDescription(color) {
    if (!color) {
        return null;
    }
    if (color.typename === "CMYKColor") {
        if (isCMYKChannelNotWhole(color.cyan) || isCMYKChannelNotWhole(color.magenta) ||
            isCMYKChannelNotWhole(color.yellow) || isCMYKChannelNotWhole(color.black)) {
            return formatCMYKChannels(color);
        }
        return null;
    }
    if (isSpotWithCMYKBase(color) && color.spot && color.spot.color && color.spot.color.typename === "CMYKColor") {
        var base = color.spot.color;
        if (isCMYKChannelNotWhole(base.cyan) || isCMYKChannelNotWhole(base.magenta) ||
            isCMYKChannelNotWhole(base.yellow) || isCMYKChannelNotWhole(base.black)) {
            var spotName = color.spot.name ? String(color.spot.name) : "Spot";
            return spotName + " (spot base) " + formatCMYKChannels(base);
        }
    }
    return null;
}

function resolveCMYKFromColor(color) {
    if (!color) {
        return null;
    }
    if (color.typename === "CMYKColor") {
        return color;
    }
    if (isSpotWithCMYKBase(color) && color.spot && color.spot.color && color.spot.color.typename === "CMYKColor") {
        return color.spot.color;
    }
    return null;
}

function isVisitableCMYKSlot(color) {
    return resolveCMYKFromColor(color) !== null;
}

function getCMYKInkSum(cmyk) {
    if (!cmyk || cmyk.typename !== "CMYKColor") {
        return 0;
    }
    return Number(cmyk.cyan) + Number(cmyk.magenta) + Number(cmyk.yellow) + Number(cmyk.black);
}

function parseCmykSlotLabelForTable(elLabel) {
    var objectLabel = elLabel;
    var slotType = "";
    if (elLabel.length >= 10 && elLabel.slice(-10) === " Text Fill") {
        slotType = "Text fill";
        objectLabel = elLabel.slice(0, -10);
    } else if (elLabel.length >= 12 && elLabel.slice(-12) === " Text Stroke") {
        slotType = "Text stroke";
        objectLabel = elLabel.slice(0, -12);
    } else if (elLabel.length >= 5 && elLabel.slice(-5) === " Fill") {
        slotType = "Fill";
        objectLabel = elLabel.slice(0, -5);
    } else if (elLabel.length >= 7 && elLabel.slice(-7) === " Stroke") {
        slotType = "Stroke";
        objectLabel = elLabel.slice(0, -7);
    } else if (elLabel.indexOf("Gradient ") === 0) {
        slotType = "Gradient stop";
        objectLabel = elLabel;
    } else if (elLabel.indexOf("Swatch \"") === 0) {
        slotType = "Swatch";
        objectLabel = elLabel;
    }
    return { objectLabel: objectLabel, slotType: slotType };
}

function pushCmykSumOver280Error(errors, item, elLabel, cmyk, sum) {
    var parts = parseCmykSlotLabelForTable(elLabel);
    errors.push({
        rowKind: "cmykSum",
        layer: getLayerName(item),
        objectLabel: parts.objectLabel,
        slotType: parts.slotType,
        sumDisplay: formatNumberUpTo3Decimals(sum),
        cmykDisplay: formatCMYKChannels(cmyk),
        element: parts.objectLabel + " | " + parts.slotType + " | total " + formatNumberUpTo3Decimals(sum) + " | " + formatCMYKChannels(cmyk)
    });
}

function pushCmykRoundError(errors, item, elLabel, desc) {
    var parts = parseCmykSlotLabelForTable(elLabel);
    errors.push({
        rowKind: "cmykRound",
        layer: getLayerName(item),
        objectLabel: parts.objectLabel,
        slotType: parts.slotType,
        cmykDisplay: desc,
        element: parts.objectLabel + " | " + parts.slotType + " | " + desc
    });
}

/**
 * Single pass over all CMYK / CMYK-based spot slots (same coverage as round-CMYK fix).
 * visitor(item, elementLabel, outerColor) — outerColor is CMYKColor or SpotColor with CMYK base.
 */
function forEachDocumentCMYKSlot(doc, cache, progress, progressLabel, visitor, options) {
    var pageItems = cache.pageItems;
    var i;
    for (i = 0; i < pageItems.length; i++) {
        var item = pageItems[i];
        var label = getItemLabel(item, item.typename, i);
        try {
            if (item.filled && isVisitableCMYKSlot(item.fillColor)) {
                visitor(item, label + " Fill", item.fillColor);
            }
        } catch (eFill) {}
        try {
            if (item.stroked && isVisitableCMYKSlot(item.strokeColor)) {
                visitor(item, label + " Stroke", item.strokeColor);
            }
        } catch (eStroke) {}
        if (progress) {
            progress.yieldLoop(progressLabel, i + 1, pageItems.length);
        }
    }

    var textFrames = cache.textFrames;
    for (i = 0; i < textFrames.length; i++) {
        var textItem = textFrames[i];
        var textLabel = getItemLabel(textItem, "TextFrame", i);
        try {
            if (isVisitableCMYKSlot(textItem.textRange.fillColor)) {
                visitor(textItem, textLabel + " Text Fill", textItem.textRange.fillColor);
            }
            if (isVisitableCMYKSlot(textItem.textRange.strokeColor)) {
                visitor(textItem, textLabel + " Text Stroke", textItem.textRange.strokeColor);
            }
        } catch (eText) {}
        if (progress) {
            progress.yieldLoop(progressLabel, i + 1, textFrames.length);
        }
    }

    var gradients = cache.gradients;
    for (i = 0; i < gradients.length; i++) {
        var gradient = gradients[i];
        var j;
        for (j = 0; j < gradient.gradientStops.length; j++) {
            var stopColor = gradient.gradientStops[j].color;
            if (isVisitableCMYKSlot(stopColor)) {
                visitor(null, "Gradient " + gradient.name + " Stop " + (j + 1), stopColor);
            }
        }
        if (progress) {
            progress.yieldLoop(progressLabel, i + 1, gradients.length);
        }
    }

    var ignoreSwatches = options && options.ignoreSwatches;
    if (!ignoreSwatches) {
        var swatches = doc.swatches;
        for (i = 0; i < swatches.length; i++) {
            var sw = swatches[i];
            try {
                if (isVisitableCMYKSlot(sw.color)) {
                    visitor(null, "Swatch \"" + sw.name + "\"", sw.color);
                }
            } catch (eSw) {}
        }
    }
}

/**
 * Builds CMYK slot list per cache + ignoreSwatches flag (shared when both checks use same flag).
 */
function ensureCMYKSlotsCache(cache, doc, progress, progressLabel, ignoreSwatches) {
    var key = ignoreSwatches ? "cmykSlotsIgnoreSwatches" : "cmykSlotsWithSwatches";
    if (cache[key]) {
        return cache[key];
    }
    var slots = [];
    var slotOpts = { ignoreSwatches: !!ignoreSwatches };
    forEachDocumentCMYKSlot(doc, cache, progress, progressLabel, function (item, elLabel, col) {
        slots.push({ item: item, label: elLabel, color: col });
    }, slotOpts);
    cache[key] = slots;
    return slots;
}

function checkNotRoundCMYK(cache, progress, checkLabel, options) {
    var errors = [];
    var doc = app.activeDocument;
    var ignoreSwatches = options && options.ignoreSwatches;
    var slots = ensureCMYKSlotsCache(cache, doc, progress, checkLabel, ignoreSwatches);
    var i;
    for (i = 0; i < slots.length; i++) {
        var s = slots[i];
        var desc = getNonWholeCMYKDescription(s.color);
        if (desc) {
            pushCmykRoundError(errors, s.item, s.label, desc);
        }
    }
    return errors;
}

function checkCMYKSumOver280(cache, progress, checkLabel, options) {
    var errors = [];
    var doc = app.activeDocument;
    var ignoreSwatches = options && options.ignoreSwatches;
    var slots = ensureCMYKSlotsCache(cache, doc, progress, checkLabel, ignoreSwatches);
    var i;
    for (i = 0; i < slots.length; i++) {
        var s = slots[i];
        var cmyk = resolveCMYKFromColor(s.color);
        if (!cmyk) {
            continue;
        }
        var sum = getCMYKInkSum(cmyk);
        if (sum > 280) {
            pushCmykSumOver280Error(errors, s.item, s.label, cmyk, sum);
        }
    }
    return errors;
}

function roundCMYKColorInPlace(cmyk) {
    if (!cmyk || cmyk.typename !== "CMYKColor") {
        return false;
    }
    var rc = Math.round(Number(cmyk.cyan));
    var rm = Math.round(Number(cmyk.magenta));
    var ry = Math.round(Number(cmyk.yellow));
    var rk = Math.round(Number(cmyk.black));
    var changed = isCMYKChannelNotWhole(cmyk.cyan) || isCMYKChannelNotWhole(cmyk.magenta) ||
        isCMYKChannelNotWhole(cmyk.yellow) || isCMYKChannelNotWhole(cmyk.black);
    if (changed) {
        cmyk.cyan = rc;
        cmyk.magenta = rm;
        cmyk.yellow = ry;
        cmyk.black = rk;
        return true;
    }
    return false;
}

function roundColorInPlace(color) {
    if (!color) {
        return false;
    }
    if (color.typename === "CMYKColor") {
        return roundCMYKColorInPlace(color);
    }
    if (isSpotWithCMYKBase(color) && color.spot && color.spot.color) {
        return roundCMYKColorInPlace(color.spot.color);
    }
    return false;
}

function fixRoundAllCMYKInDocument(doc, progressUi) {
    var count = 0;
    var cache = collectDocumentCache(doc);
    forEachDocumentCMYKSlot(doc, cache, progressUi || null, "Rounding CMYK colors", function (item, elLabel, col) {
        try {
            if (roundColorInPlace(col)) {
                count++;
            }
        } catch (ignoreRound) {}
    }, {});
    return count;
}

function getCheckDefinitions() {
    return [
        { id: "cmykRound", label: "All not round CMYK values", runner: checkNotRoundCMYK },
        { id: "cmykSum", label: "All CMYK color sums over 280", runner: checkCMYKSumOver280 },
        { id: "tiff", label: "All images that are NOT in TIFF", runner: checkAllImagesAreTIFF },
        { id: "embedded", label: "All images that are NOT embedded", runner: checkAllImagesEmbedded },
        { id: "strokes", label: "All strokes that are NOT in curves", runner: checkAllStrokesInCurves },
        { id: "text", label: "All text elements that are NOT in curves", runner: checkAllTextInCurves }
    ];
}

var FIX_SMART_DEPENDENCIES = {
    embed: {
        fixedCheckId: "embedded",
        rerunIds: []
    },
    roundCmyk: {
        fixedCheckId: "cmykRound",
        rerunIds: []
    },
    strokesOnly: {
        fixedCheckId: "strokes",
        rerunIds: ["cmykRound", "cmykSum"]
    },
    strokesExpandAll: {
        fixedCheckId: "strokes",
        rerunIds: ["text", "cmykRound", "cmykSum"]
    },
    outlineText: {
        fixedCheckId: "text",
        rerunIds: ["strokes", "cmykRound", "cmykSum"]
    }
};

function clearCmykSlotCaches(cache) {
    try {
        delete cache.cmykSlotsWithSwatches;
    } catch (e1) {}
    try {
        delete cache.cmykSlotsIgnoreSwatches;
    } catch (e2) {}
}

function findSelectedCheckDef(selectedChecks, id) {
    for (var i = 0; i < selectedChecks.length; i++) {
        if (selectedChecks[i].id === id) {
            return selectedChecks[i];
        }
    }
    return null;
}

function runSingleCheck(cache, checkDef, progressUi) {
    try {
        return {
            id: checkDef.id,
            label: checkDef.label,
            options: checkDef.options || {},
            rows: checkDef.runner(cache, progressUi, checkDef.label, checkDef.options || {})
        };
    } catch (e) {
        return {
            id: checkDef.id,
            label: checkDef.label,
            options: checkDef.options || {},
            rows: [{ layer: "N/A", element: "Script error: " + e }]
        };
    }
}

function applyPostFixUpdate(doc, resultMap, selectedChecks, fixOutcome, progressUi) {
    var cache = collectDocumentCache(doc);
    clearCmykSlotCaches(cache);
    var cfg = FIX_SMART_DEPENDENCIES[fixOutcome.fixKey];
    var fixedCheckId = cfg ? cfg.fixedCheckId : null;
    var rerunQueue = [];

    function pushRerunId(checkId) {
        if (!checkId) {
            return;
        }
        var checkDef = findSelectedCheckDef(selectedChecks, checkId);
        if (!checkDef) {
            return;
        }
        rerunQueue.push(checkDef);
    }

    function progressStart(currentIndex, totalCount, label) {
        if (!progressUi) {
            return;
        }
        if (typeof progressUi.updateCheckStart === "function") {
            progressUi.updateCheckStart(currentIndex, totalCount, label);
            return;
        }
        if (typeof progressUi.setStatus === "function") {
            var percent = totalCount > 0 ? Math.round((currentIndex / totalCount) * 100) : 0;
            progressUi.setStatus("Refreshing checks...", "Running: " + label + " (" + currentIndex + "/" + totalCount + ")", percent);
        }
    }

    function progressDone(completedIndex, totalCount, label) {
        if (!progressUi) {
            return;
        }
        if (typeof progressUi.updateCheckDone === "function") {
            progressUi.updateCheckDone(completedIndex, totalCount, label);
            return;
        }
        if (typeof progressUi.setStatus === "function") {
            var percent = totalCount > 0 ? Math.round((completedIndex / totalCount) * 100) : 100;
            progressUi.setStatus("Refreshing checks...", "Completed: " + label + " (" + completedIndex + "/" + totalCount + ")", percent);
        }
    }

    function putOrClearResult(checkDef, rows) {
        if (!checkDef) {
            return;
        }
        if (rows && rows.length > 0) {
            resultMap[checkDef.label] = {
                id: checkDef.id,
                label: checkDef.label,
                options: checkDef.options || {},
                rows: rows
            };
        } else {
            try {
                delete resultMap[checkDef.label];
            } catch (ignoreDel) {}
        }
    }

    function runQueue() {
        var total = rerunQueue.length;
        for (var i = 0; i < total; i++) {
            var cd = rerunQueue[i];
            progressStart(i, total, cd.label);
            var entry = runSingleCheck(cache, cd, progressUi || null);
            putOrClearResult(cd, entry.rows);
            progressDone(i + 1, total, cd.label);
        }
    }

    if (!fixOutcome.ok) {
        if (fixedCheckId) {
            pushRerunId(fixedCheckId);
            runQueue();
        }
        return resultMap;
    }

    var fixedDef = fixedCheckId ? findSelectedCheckDef(selectedChecks, fixedCheckId) : null;
    if (fixedDef) {
        try {
            delete resultMap[fixedDef.label];
        } catch (ignoreDelFixed) {}
    }

    var deps = (cfg && cfg.rerunIds) ? cfg.rerunIds : [];
    for (var d = 0; d < deps.length; d++) {
        pushRerunId(deps[d]);
    }
    runQueue();

    return resultMap;
}

function hasLinkedImages(doc) {
    var placedItems = doc.placedItems;
    for (var i = 0; i < placedItems.length; i++) {
        if (!placedItems[i].embedded) {
            return true;
        }
    }
    return false;
}

function isDocumentCMYK(doc) {
    try {
        return doc.documentColorSpace === DocumentColorSpace.CMYK;
    } catch (e) {
        return false;
    }
}

function showSavingDialog() {
    var dialog = new Window("palette", "Prepress Laboratory");
    var isClosed = false;
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.margins = 12;
    dialog.add("statictext", undefined, "Saving document, please wait...");
    dialog.show();
    try {
        app.redraw();
    } catch (ignoreRedraw) {}
    dialog.update();

    return {
        close: function () {
            if (isClosed) {
                return;
            }
            try {
                dialog.close();
            } catch (ignoreClose) {}
            isClosed = true;
        }
    };
}

function ensureDocumentAndSave() {
    if (app.documents.length === 0) {
        alert("No open document found.");
        return null;
    }

    var doc = app.activeDocument;
    if (!doc.saved) {
        var savingDialog = null;
        try {
            savingDialog = showSavingDialog();
            doc.save();
        } catch (e) {
            alert("Document has unsaved changes. Save was cancelled or failed. Checks were not run.");
            return null;
        } finally {
            if (savingDialog) {
                savingDialog.close();
            }
        }
    }
    return doc;
}

function showCheckSelectionDialog(checkDefinitions, doc) {
    var dialog = new Window("dialog", "Prepress Laboratory");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];

    if (!isDocumentCMYK(doc)) {
        var cmykWarning = dialog.add("statictext", undefined, "This document is not in CMYK");
        try {
            cmykWarning.graphics.foregroundColor = cmykWarning.graphics.newPen(cmykWarning.graphics.PenType.SOLID_COLOR, [0.85, 0.1, 0.1, 1], 1);
        } catch (ignoreWarnStyle) {}
    }

    dialog.add("statictext", undefined, "Find:");
    var selectAllRow = dialog.add("group");
    selectAllRow.alignment = "left";
    var selectAllCb = selectAllRow.add("checkbox", undefined, "Select all");
    selectAllCb.value = true;

    var panel = dialog.add("panel", undefined, "");
    panel.alignChildren = ["left", "top"];
    panel.margins = 8;
    panel.orientation = "column";

    var checkboxes = [];
    var checkControls = [];
    var strokesMainCb = null;
    var ignoreCutLayerCb = null;
    var cmykRoundMainCb = null;
    var ignoreSwatchesRoundCb = null;
    var cmykSumMainCb = null;
    var ignoreSwatchesSumCb = null;

    function syncStrokesSubOptionState() {
        if (ignoreCutLayerCb && strokesMainCb) {
            ignoreCutLayerCb.enabled = strokesMainCb.value;
        }
    }

    function syncCmykSubOptionState() {
        if (ignoreSwatchesRoundCb && cmykRoundMainCb) {
            ignoreSwatchesRoundCb.enabled = cmykRoundMainCb.value;
        }
        if (ignoreSwatchesSumCb && cmykSumMainCb) {
            ignoreSwatchesSumCb.enabled = cmykSumMainCb.value;
        }
    }

    function setAllCheckboxes(value) {
        for (var p = 0; p < checkboxes.length; p++) {
            checkboxes[p].value = value;
        }
        syncStrokesSubOptionState();
        syncCmykSubOptionState();
    }

    function countChecked() {
        var checked = 0;
        for (var q = 0; q < checkboxes.length; q++) {
            if (checkboxes[q].value) {
                checked++;
            }
        }
        return checked;
    }

    function syncSelectAllFromItems() {
        var allChecked = true;
        for (var n = 0; n < checkboxes.length; n++) {
            if (!checkboxes[n].value) {
                allChecked = false;
                break;
            }
        }
        selectAllCb.value = allChecked;
    }

    function applyExclusiveOrRestoreSelect(currentCb) {
        var checkedCount = countChecked();
        if (checkedCount === 0) {
            setAllCheckboxes(true);
            return;
        }
        if (checkedCount === 1) {
            // Only "select all" when the single checked box is this one again (repeat action).
            // If the one checked box is elsewhere, isolate to this checkbox only (same as multi-select case).
            if (currentCb.value) {
                setAllCheckboxes(true);
            } else {
                setAllCheckboxes(false);
                currentCb.value = true;
            }
            return;
        }
        setAllCheckboxes(false);
        currentCb.value = true;
    }

    selectAllCb.onClick = function () {
        setAllCheckboxes(selectAllCb.value);
    };

    for (var i = 0; i < checkDefinitions.length; i++) {
        var checkDef = checkDefinitions[i];
        var cb = panel.add("checkbox", undefined, checkDef.label);
        cb.value = true;
        (function (currentCb) {
            currentCb.onClick = function () {
                var keyboardState = ScriptUI.environment.keyboardState;
                var isCtrl = keyboardState && keyboardState.ctrlKey;
                if (isCtrl) {
                    applyExclusiveOrRestoreSelect(currentCb);
                }
                syncSelectAllFromItems();
                syncStrokesSubOptionState();
                syncCmykSubOptionState();
            };
            try {
                currentCb.addEventListener("mousedown", function (ev) {
                    try {
                        if (ev && Number(ev.button) === 2) {
                            applyExclusiveOrRestoreSelect(currentCb);
                            syncSelectAllFromItems();
                            syncStrokesSubOptionState();
                            syncCmykSubOptionState();
                            try {
                                if (ev.preventDefault) {
                                    ev.preventDefault();
                                }
                            } catch (ignorePD) {}
                        }
                    } catch (ignoreMouse) {}
                });
            } catch (ignoreListener) {}
        })(cb);
        checkboxes.push(cb);
        checkControls.push({
            definition: checkDef,
            checkbox: cb
        });

        if (checkDef.id === "strokes") {
            strokesMainCb = cb;
            var subRow = panel.add("group");
            subRow.orientation = "row";
            subRow.alignment = "left";
            subRow.margins = [18, 0, 0, 0];
            ignoreCutLayerCb = subRow.add("checkbox", undefined, "Ignore CUT layer");
            ignoreCutLayerCb.value = true;
        } else if (checkDef.id === "cmykRound") {
            cmykRoundMainCb = cb;
            var subRound = panel.add("group");
            subRound.orientation = "row";
            subRound.alignment = "left";
            subRound.margins = [18, 0, 0, 0];
            ignoreSwatchesRoundCb = subRound.add("checkbox", undefined, "Ignore swatches");
            ignoreSwatchesRoundCb.value = false;
        } else if (checkDef.id === "cmykSum") {
            cmykSumMainCb = cb;
            var subSum = panel.add("group");
            subSum.orientation = "row";
            subSum.alignment = "left";
            subSum.margins = [18, 0, 0, 0];
            ignoreSwatchesSumCb = subSum.add("checkbox", undefined, "Ignore swatches");
            ignoreSwatchesSumCb.value = false;
        }
    }
    syncStrokesSubOptionState();
    syncCmykSubOptionState();

    var tipText = dialog.add("statictext", undefined, "Right-click or Ctrl+Left-click a check to select only that option");
    try {
        tipText.graphics.font = ScriptUI.newFont(tipText.graphics.font.name, "ITALIC", tipText.graphics.font.size);
    } catch (ignoreFont) {}

    var btns = dialog.add("group");
    btns.alignment = "right";
    btns.add("button", undefined, "Cancel", { name: "cancel" });
    var runBtn = btns.add("button", undefined, "Run", { name: "ok" });

    runBtn.onClick = function () {
        var anyChecked = false;
        for (var j = 0; j < checkboxes.length; j++) {
            if (checkboxes[j].value) {
                anyChecked = true;
                break;
            }
        }
        if (!anyChecked) {
            alert("Select at least one check.");
            return;
        }
        dialog.close(1);
    };

    if (dialog.show() !== 1) {
        return null;
    }

    var selected = [];
    for (var k = 0; k < checkControls.length; k++) {
        if (checkControls[k].checkbox.value) {
            var selectedDef = {
                id: checkControls[k].definition.id,
                label: checkControls[k].definition.label,
                runner: checkControls[k].definition.runner,
                options: {}
            };
            if (selectedDef.id === "strokes") {
                selectedDef.options.ignoreCutLayer = ignoreCutLayerCb ? ignoreCutLayerCb.value : false;
            }
            if (selectedDef.id === "cmykRound") {
                selectedDef.options.ignoreSwatches = ignoreSwatchesRoundCb ? ignoreSwatchesRoundCb.value : false;
            }
            if (selectedDef.id === "cmykSum") {
                selectedDef.options.ignoreSwatches = ignoreSwatchesSumCb ? ignoreSwatchesSumCb.value : false;
            }
            selected.push(selectedDef);
        }
    }
    return selected;
}

function createProgressDialog(totalChecks) {
    var dialog = new Window("palette", "Prepress Check Progress");
    var isClosed = false;
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.margins = 12;

    var statusText = dialog.add("statictext", undefined, "Starting checks...");
    var detailText = dialog.add("statictext", undefined, "0/" + totalChecks + " checks (0%)");
    var bar = dialog.add("progressbar", undefined, 0, totalChecks);
    bar.preferredSize = [420, 18];
    bar.value = 0;

    dialog.show();
    dialog.update();

    function refreshUi() {
        try {
            app.redraw();
        } catch (ignoreRedraw) {}
        dialog.update();
    }

    return {
        updateCheckStart: function (checkIndex, total, label) {
            var percent = Math.round((checkIndex / total) * 100);
            statusText.text = "Running: " + label;
            detailText.text = checkIndex + "/" + total + " checks (" + percent + "%)";
            bar.value = checkIndex;
            refreshUi();
        },
        updateCheckDone: function (completedChecks, total, label) {
            var percent = Math.round((completedChecks / total) * 100);
            statusText.text = "Completed: " + label;
            detailText.text = completedChecks + "/" + total + " checks (" + percent + "%)";
            bar.value = completedChecks;
            refreshUi();
        },
        yieldLoop: function (label, index, total) {
            if (total > 0 && (index % 200 === 0 || index === total)) {
                statusText.text = "Running: " + label + " (" + index + "/" + total + ")";
                refreshUi();
                $.sleep(5);
            }
        },
        close: function () {
            if (isClosed) {
                return;
            }
            try {
                dialog.close();
            } catch (ignoreClose) {}
            isClosed = true;
        }
    };
}

function createFixProgressDialog(initialStatus) {
    var dialog = new Window("palette", "Applying Fix");
    var isClosed = false;
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.margins = 12;

    var statusText = dialog.add("statictext", undefined, initialStatus || "Starting fix...");
    var detailText = dialog.add("statictext", undefined, "Please wait...");
    var bar = dialog.add("progressbar", undefined, 0, 100);
    bar.preferredSize = [360, 18];
    bar.value = 0;

    dialog.show();
    dialog.update();

    function refreshUi() {
        try {
            app.redraw();
        } catch (ignoreRedraw) {}
        dialog.update();
    }

    return {
        setStatus: function (status, detail, value) {
            if (status !== undefined && status !== null) {
                statusText.text = String(status);
            }
            if (detail !== undefined && detail !== null) {
                detailText.text = String(detail);
            }
            if (typeof value === "number") {
                var clamped = value;
                if (clamped < 0) {
                    clamped = 0;
                }
                if (clamped > 100) {
                    clamped = 100;
                }
                bar.value = clamped;
            }
            refreshUi();
        },
        yieldLoop: function (label, index, total) {
            if (total > 0 && (index % 50 === 0 || index === total)) {
                var percent = Math.round((index / total) * 100);
                statusText.text = label + " (" + index + "/" + total + ")";
                detailText.text = "Please wait...";
                bar.value = percent;
                refreshUi();
                $.sleep(5);
            }
        },
        close: function () {
            if (isClosed) {
                return;
            }
            try {
                dialog.close();
            } catch (ignoreClose) {}
            isClosed = true;
        }
    };
}

function runFixActionWithProgress(dialog, fixOutcomeRef, config) {
    if (fixOutcomeRef) {
        fixOutcomeRef.last = null;
    }
    var progress = null;
    var closeCode = 2;
    try {
        progress = createFixProgressDialog(config.progressTitle || "Applying fix...");
        progress.setStatus(config.progressTitle || "Applying fix...", "Preparing document...", 15);
        var count = config.runFix(progress);
        progress.setStatus("Fix complete", "Preparing updated results...", 90);
        alert(config.successMessage(count));
        if (fixOutcomeRef) {
            fixOutcomeRef.last = {
                fixKey: config.fixKey,
                ok: config.okEvaluator ? config.okEvaluator(count) : true,
                processedCount: count
            };
        }
    } catch (e) {
        alert("Script error: " + e);
        if (fixOutcomeRef) {
            fixOutcomeRef.last = {
                fixKey: config.fixKey,
                ok: false,
                message: String(e),
                processedCount: 0
            };
        }
    } finally {
        if (progress) {
            progress.setStatus("Finalizing", "Closing progress window...", 100);
            progress.close();
        }
        dialog.close(closeCode);
    }
}

function runSelectedChecks(cache, selectedChecks, progressUi) {
    var resultMap = {};
    var total = selectedChecks.length;
    for (var i = 0; i < selectedChecks.length; i++) {
        var checkDef = selectedChecks[i];
        if (progressUi) {
            progressUi.updateCheckStart(i, total, checkDef.label);
        }
        try {
            resultMap[checkDef.label] = {
                id: checkDef.id,
                label: checkDef.label,
                options: checkDef.options || {},
                rows: checkDef.runner(cache, progressUi, checkDef.label, checkDef.options || {})
            };
        } catch (e) {
            resultMap[checkDef.label] = {
                id: checkDef.id,
                label: checkDef.label,
                options: checkDef.options || {},
                rows: [{ layer: "N/A", element: "Script error: " + e }]
            };
        }
        if (progressUi) {
            progressUi.updateCheckDone(i + 1, total, checkDef.label);
            if (i === total - 1) {
                progressUi.close();
            }
        }
    }
    return resultMap;
}

function getFailedCheckSections(resultMap) {
    var sections = [];
    for (var checkName in resultMap) {
        if (!resultMap.hasOwnProperty(checkName)) {
            continue;
        }
        var entry = resultMap[checkName];
        var errors = (entry && entry.rows !== undefined) ? entry.rows : entry;
        if (errors && errors.length > 0) {
            sections.push({
                id: entry && entry.id ? entry.id : "",
                name: checkName,
                rows: errors,
                options: entry && entry.options ? entry.options : {}
            });
        }
    }
    return sections;
}

function embedAllLinkedImages(doc, progressUi) {
    var count = 0;
    var placedItems = doc.placedItems;
    var total = placedItems.length;
    for (var i = placedItems.length - 1; i >= 0; i--) {
        var item = placedItems[i];
        if (!item.embedded) {
            try {
                item.embed();
                count++;
            } catch (ignoreEmbed) {}
        }
        if (progressUi) {
            progressUi.yieldLoop("Embedding linked images", total - i, total);
        }
    }
    return count;
}

function outlineAllText(doc, progressUi) {
    var count = 0;
    var textFrames = doc.textFrames;
    var total = textFrames.length;
    for (var i = textFrames.length - 1; i >= 0; i--) {
        try {
            textFrames[i].createOutline();
            count++;
        } catch (ignoreOutline) {}
        if (progressUi) {
            progressUi.yieldLoop("Outlining text", total - i, total);
        }
    }
    return count;
}

function getStrokeCandidates(doc, ignoreCutLayer) {
    var paths = doc.pathItems;
    var candidates = [];
    for (var i = 0; i < paths.length; i++) {
        var p = paths[i];
        var canUse = true;
        try {
            if (p.locked || p.hidden || p.guides || p.clipping) {
                canUse = false;
            }
            if (p.layer && (p.layer.locked || !p.layer.visible)) {
                canUse = false;
            }
        } catch (ignoreState) {
            canUse = false;
        }
        if (canUse && p.stroked && Number(p.strokeWidth) > 0) {
            if (ignoreCutLayer && isCutLayerItem(p)) {
                continue;
            }
            candidates.push(p);
        }
    }
    return candidates;
}

function isPathStillStroked(pathItem) {
    try {
        return pathItem.stroked && Number(pathItem.strokeWidth) > 0;
    } catch (e) {
        return false;
    }
}

function outlineStrokesInSelection(pathItem) {
    var commandSets = [
        ["Live Outline Stroke"],
        ["Outline Stroke"],
        ["expandStyle", "expand"]
    ];
    for (var i = 0; i < commandSets.length; i++) {
        try {
            var commandSet = commandSets[i];
            for (var j = 0; j < commandSet.length; j++) {
                app.executeMenuCommand(commandSet[j]);
            }
        } catch (e) {}
        if (!isPathStillStroked(pathItem)) {
            return true;
        }
    }
    return false;
}

function expandAllStrokes(doc, ignoreCutLayer, progressUi) {
    var candidates = getStrokeCandidates(doc, ignoreCutLayer);
    var beforeCount = candidates.length;
    if (beforeCount === 0) {
        return 0;
    }
    var oldSelection = doc.selection;
    var fixedCount = 0;
    try {
        for (var i = candidates.length - 1; i >= 0; i--) {
            var candidate = candidates[i];
            doc.selection = null;
            try {
                candidate.selected = true;
            } catch (ignoreSelect) {
                continue;
            }
            if (outlineStrokesInSelection(candidate)) {
                fixedCount++;
            }
            if (progressUi) {
                progressUi.yieldLoop("Expanding strokes", (candidates.length - i), candidates.length);
            }
        }
    } catch (e) {
    } finally {
        try {
            doc.selection = oldSelection;
        } catch (ignoreRestore) {}
    }
    if (fixedCount > 0) {
        return fixedCount;
    }
    // Fallback to actual delta if command succeeded but counting could not detect it.
    var afterCount = getStrokeCandidates(doc, ignoreCutLayer).length;
    var delta = beforeCount - afterCount;
    return delta > 0 ? delta : 0;
}

function expandAllFast(doc, progressUi) {
    var beforeCount = getStrokeCandidates(doc, false).length;
    if (beforeCount === 0) {
        return 0;
    }
    var oldSelection = doc.selection;
    var commandSets = [
        ["selectall", "Live Outline Stroke"],
        ["selectall", "Outline Stroke"],
        ["selectall", "expandStyle", "expand"]
    ];
    try {
        for (var i = 0; i < commandSets.length; i++) {
            var set = commandSets[i];
            if (progressUi) {
                progressUi.setStatus("Expanding all objects...", "Applying expansion step " + (i + 1) + "/" + commandSets.length, Math.round(((i + 1) / commandSets.length) * 90));
            }
            try {
                doc.selection = null;
            } catch (ignoreClearSel) {}

            for (var j = 0; j < set.length; j++) {
                try {
                    app.executeMenuCommand(set[j]);
                } catch (ignoreCmd) {}
            }

            var currentCount = getStrokeCandidates(doc, false).length;
            if (currentCount < beforeCount) {
                break;
            }
        }
    } catch (e) {
    } finally {
        try {
            doc.selection = oldSelection;
        } catch (ignoreRestore) {}
    }
    var afterCount = getStrokeCandidates(doc, false).length;
    var delta = beforeCount - afterCount;
    return delta > 0 ? delta : 0;
}

function getSuccessAsciiLogo() {
    return [
        "       _______________       ",
        "      /\\             /\\      ",
        "     /  \\           /  \\     ",
        "    / /\\ \\         / /\\ \\    ",
        "   / /  \\ \\       / /  \\ \\   ",
        "  /_/____\\_\\_____/ /____\\_\\  ",
        "  \\ \\    / /\\   / /\\    / /  ",
        "   \\ \\  / /  \\ / /  \\  / /   ",
        "    \\ \\/ /    X    / \\/ /    ",
        "     \\  /    / \\  /\\  /     ",
        "      \\/____/___\\/__\\/      "
    ].join("\n");
}

function showSuccessDialog(linkedImagesWarning) {
    var dialog = new Window("dialog", "Prepress Check - Success");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];

    dialog.add("statictext", undefined, "Success: no prepress errors were found.");
    if (linkedImagesWarning) {
        var warn = dialog.add("statictext", undefined, "Please, check if your linked images are in CMYK, this script can't do that.");
        try {
            warn.graphics.foregroundColor = warn.graphics.newPen(warn.graphics.PenType.SOLID_COLOR, [0.95, 0.8, 0.15, 1], 1);
        } catch (ignoreWarnStyle) {}
    }
    var logoBox = dialog.add("edittext", undefined, getSuccessAsciiLogo(), {
        readonly: true,
        multiline: true,
        scrolling: false
    });
    logoBox.preferredSize = [360, 180];
    try {
        logoBox.graphics.font = ScriptUI.newFont("Consolas", "REGULAR", 12);
    } catch (e1) {
        try {
            logoBox.graphics.font = ScriptUI.newFont("Courier New", "REGULAR", 12);
        } catch (e2) {}
    }

    var btns = dialog.add("group");
    btns.alignment = "right";
    btns.add("button", undefined, "OK", { name: "ok" });
    dialog.show();
}

function showErrorDialog(failedSections, linkedImagesWarning, doc, fixOutcomeRef) {
    var dialog = new Window("dialog", "Prepress Check - Errors Found");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.margins = 12;

    dialog.add("statictext", undefined, "The following checks returned errors:");
    if (linkedImagesWarning) {
        var warningText = dialog.add("statictext", undefined, "Warning: Please, check if your linked images are in CMYK, this script can't do that.");
        try {
            warningText.graphics.foregroundColor = warningText.graphics.newPen(warningText.graphics.PenType.SOLID_COLOR, [0.95, 0.8, 0.15, 1], 1);
        } catch (ignoreWarnStyle) {}
    }

    // ScriptUI does not provide a reliable scrollable container. Use tabs so the
    // window keeps fixed size even when many checks fail.
    var tabs = dialog.add("tabbedpanel");
    tabs.alignChildren = ["fill", "fill"];
    tabs.preferredSize = [740, 420];

    for (var i = 0; i < failedSections.length; i++) {
        var section = failedSections[i];
        var tab = tabs.add("tab", undefined, section.name);
        tab.orientation = "column";
        tab.alignChildren = ["fill", "fill"];
        tab.margins = 10;

        var cmykTableMode = "default";
        if (section.id === "cmykSum") {
            cmykTableMode = "sum";
        } else if (section.id === "cmykRound") {
            cmykTableMode = "round";
        }
        var tableColCount = cmykTableMode === "sum" ? 6 : (cmykTableMode === "round" ? 5 : 3);
        var tableHeaders = ["#", "Layer", "Element"];
        if (cmykTableMode === "sum") {
            tableHeaders = ["#", "Layer", "Object", "Type", "Sum", "CMYK"];
        } else if (cmykTableMode === "round") {
            tableHeaders = ["#", "Layer", "Object", "Type", "CMYK"];
        }
        var table = tab.add("listbox", undefined, [], {
            multiselect: false,
            numberOfColumns: tableColCount,
            showHeaders: true,
            columnTitles: tableHeaders
        });
        table.preferredSize = [710, 360];
        try {
            if (cmykTableMode === "sum" && table.columns && table.columns.length >= 6) {
                table.columns[0].width = 36;
                table.columns[1].width = 100;
                table.columns[2].width = 200;
                table.columns[3].width = 80;
                table.columns[4].width = 56;
                table.columns[5].width = 210;
            } else if (cmykTableMode === "round" && table.columns && table.columns.length >= 5) {
                table.columns[0].width = 36;
                table.columns[1].width = 100;
                table.columns[2].width = 200;
                table.columns[3].width = 80;
                table.columns[4].width = 280;
            } else if (cmykTableMode === "default" && table.columns && table.columns.length >= 3) {
                table.columns[0].width = 45;
                table.columns[1].width = 180;
                table.columns[2].width = 470;
            }
        } catch (ignoreColumns) {}

        for (var r = 0; r < section.rows.length; r++) {
            var listItem = table.add("item", String(r + 1));
            var row = section.rows[r];
            if (cmykTableMode === "sum" && row && typeof row === "object" && row.rowKind === "cmykSum") {
                listItem.subItems[0].text = row.layer || "N/A";
                listItem.subItems[1].text = row.objectLabel || "";
                listItem.subItems[2].text = row.slotType || "";
                listItem.subItems[3].text = row.sumDisplay || "";
                listItem.subItems[4].text = row.cmykDisplay || "";
            } else if (cmykTableMode === "round" && row && typeof row === "object" && row.rowKind === "cmykRound") {
                listItem.subItems[0].text = row.layer || "N/A";
                listItem.subItems[1].text = row.objectLabel || "";
                listItem.subItems[2].text = row.slotType || "";
                listItem.subItems[3].text = row.cmykDisplay || "";
            } else if (cmykTableMode === "round" && row && typeof row === "object") {
                listItem.subItems[0].text = row.layer || "N/A";
                listItem.subItems[1].text = "";
                listItem.subItems[2].text = "";
                listItem.subItems[3].text = row.element || String(row);
            } else {
                var layerValue = "N/A";
                var elementValue = "";
                if (row && typeof row === "object") {
                    if (row.layer) {
                        layerValue = row.layer;
                    }
                    if (row.element) {
                        elementValue = row.element;
                    }
                } else {
                    elementValue = String(row);
                }
                listItem.subItems[0].text = layerValue;
                listItem.subItems[1].text = elementValue;
            }
        }

        if (section.id !== "tiff" && section.id !== "cmykSum") {
            var actionRow = tab.add("group");
            actionRow.alignment = "right";
            var actionLabel = "Fix";
            if (section.id === "embedded") {
                actionLabel = "embed images";
            } else if (section.id === "text") {
                actionLabel = "exand all text";
            }

            if (section.id === "cmykRound") {
                var roundCmykBtn = actionRow.add("button", undefined, "Round CMYK values");
                roundCmykBtn.helpTip = "Rounds CMYK channels to whole numbers everywhere this check looks (objects, text, gradient stops, swatches).";
                roundCmykBtn.onClick = function () {
                    runFixActionWithProgress(dialog, fixOutcomeRef, {
                        fixKey: "roundCmyk",
                        progressTitle: "Rounding CMYK values...",
                        runFix: function (progress) {
                            return fixRoundAllCMYKInDocument(doc, progress);
                        },
                        successMessage: function (count) {
                            return "Done. Rounded CMYK on " + count + " color slot(s).";
                        }
                    });
                };
            } else if (section.id === "strokes") {
                var strokesOnlyBtn = actionRow.add("button", undefined, "Expand Strokes Only");
                strokesOnlyBtn.helpTip = "Safer and more precise: only outlined live strokes (respects Ignore CUT layer). Slower on large files.";
                strokesOnlyBtn.onClick = (function (currentSection) {
                    return function () {
                        runFixActionWithProgress(dialog, fixOutcomeRef, {
                            fixKey: "strokesOnly",
                            progressTitle: "Expanding strokes...",
                            runFix: function (progress) {
                                return expandAllStrokes(doc, currentSection.options && currentSection.options.ignoreCutLayer, progress);
                            },
                            okEvaluator: function (count) {
                                return count > 0;
                            },
                            successMessage: function (count) {
                                return "Done. Processed " + count + " item(s).";
                            }
                        });
                    };
                })(section);

                var expandAllBtn = actionRow.add("button", undefined, "Expand All");
                expandAllBtn.helpTip = "Faster bulk approach: selects all and runs Expand. Can affect more objects than strokes only.";
                expandAllBtn.onClick = function () {
                    runFixActionWithProgress(dialog, fixOutcomeRef, {
                        fixKey: "strokesExpandAll",
                        progressTitle: "Expanding all objects...",
                        runFix: function (progress) {
                            return expandAllFast(doc, progress);
                        },
                        okEvaluator: function (count) {
                            return count > 0;
                        },
                        successMessage: function (count) {
                            return "Done. Processed " + count + " item(s).";
                        }
                    });
                };
            } else {
                var fixBtn = actionRow.add("button", undefined, actionLabel);
                if (section.id === "embedded") {
                    fixBtn.helpTip = "Embeds all linked images found in the document.";
                } else if (section.id === "text") {
                    fixBtn.helpTip = "Converts all live text objects to outlined curves.";
                }
                fixBtn.onClick = (function (currentSection) {
                    return function () {
                        var isEmbedded = currentSection.id === "embedded";
                        runFixActionWithProgress(dialog, fixOutcomeRef, {
                            fixKey: isEmbedded ? "embed" : "outlineText",
                            progressTitle: isEmbedded ? "Embedding linked images..." : "Outlining text...",
                            runFix: function (progress) {
                                if (isEmbedded) {
                                    return embedAllLinkedImages(doc, progress);
                                }
                                return outlineAllText(doc, progress);
                            },
                            successMessage: function (count) {
                                return "Done. Processed " + count + " item(s).";
                            }
                        });
                    };
                })(section);
            }
        }
    }

    if (failedSections.length > 0) {
        tabs.selection = 0;
    }

    var btns = dialog.add("group");
    btns.alignment = "right";

    var errOkBtn = btns.add("button", undefined, "OK", { name: "ok" });
    errOkBtn.onClick = function () {
        if (fixOutcomeRef) {
            fixOutcomeRef.last = null;
        }
        dialog.close(1);
    };

    return dialog.show();
}

function showResultsDialog(resultMap, linkedImagesWarning, doc, fixOutcomeRef) {
    var failedSections = getFailedCheckSections(resultMap);
    if (failedSections.length === 0) {
        showSuccessDialog(linkedImagesWarning);
        return 0;
    } else {
        return showErrorDialog(failedSections, linkedImagesWarning, doc, fixOutcomeRef);
    }
}

function buildPlainResultsText(resultMap, linkedImagesWarning) {
    var lines = [];
    if (linkedImagesWarning) {
        lines.push("Warning: Please, check if your linked images are in CMYK, this script can't do that.");
        lines.push("");
    }

    var failedSections = getFailedCheckSections(resultMap);
    if (failedSections.length === 0) {
        lines.push("Success: no prepress errors were found.");
    } else {
        for (var i = 0; i < failedSections.length; i++) {
            var section = failedSections[i];
            lines.push(section.name + ":");
            for (var r = 0; r < section.rows.length; r++) {
                var row = section.rows[r];
                var layerValue = (row && typeof row === "object" && row.layer) ? row.layer : "N/A";
                if (section.id === "cmykSum" && row && row.rowKind === "cmykSum") {
                    lines.push((r + 1) + ". [" + layerValue + "] " + (row.objectLabel || "") + " | " +
                        (row.slotType || "") + " | sum " + (row.sumDisplay || "") + " | " + (row.cmykDisplay || ""));
                } else if (section.id === "cmykRound" && row && row.rowKind === "cmykRound") {
                    lines.push((r + 1) + ". [" + layerValue + "] " + (row.objectLabel || "") + " | " +
                        (row.slotType || "") + " | " + (row.cmykDisplay || ""));
                } else {
                    var elementValue = (row && typeof row === "object" && row.element) ? row.element : String(row);
                    lines.push((r + 1) + ". [" + layerValue + "] " + elementValue);
                }
            }
            lines.push("");
        }
    }
    return lines.join("\n");
}

function showFallbackLogDialog(resultMap, linkedImagesWarning, errorText) {
    var dialog = new Window("dialog", "Prepress Check - Log");
    dialog.orientation = "column";
    dialog.alignChildren = ["fill", "top"];
    dialog.margins = 12;

    dialog.add("statictext", undefined, "Fallback log view (main results window could not be rendered).");
    if (errorText) {
        dialog.add("statictext", undefined, "UI error: " + errorText);
    }

    var textBox = dialog.add("edittext", undefined, buildPlainResultsText(resultMap, linkedImagesWarning), {
        readonly: true,
        multiline: true,
        scrolling: true
    });
    textBox.preferredSize = [760, 440];

    var btns = dialog.add("group");
    btns.alignment = "right";
    btns.add("button", undefined, "OK", { name: "ok" });
    dialog.show();
}

function main() {
    var doc = ensureDocumentAndSave();
    if (!doc) {
        return;
    }

    var linkedImagesWarning = hasLinkedImages(doc);

    var checkDefs = getCheckDefinitions();
    var selectedChecks = showCheckSelectionDialog(checkDefs, doc);
    if (!selectedChecks) {
        return;
    }

    var progressUi = null;
    var resultMap = null;
    try {
        var cache = collectDocumentCache(doc);
        progressUi = createProgressDialog(selectedChecks.length);
        resultMap = runSelectedChecks(cache, selectedChecks, progressUi);
    } finally {
        if (progressUi) {
            progressUi.close();
        }
    }

    if (!resultMap) {
        resultMap = {
            "Runtime": [{ layer: "N/A", element: "Script finished without results map." }]
        };
    }

    try {
        var fixOutcomeRef = {
            last: null
        };
        while (true) {
            linkedImagesWarning = hasLinkedImages(doc);
            var dialogResult = showResultsDialog(resultMap, linkedImagesWarning, doc, fixOutcomeRef);
            if (dialogResult !== 2) {
                break;
            }
            var postFixOutcome = fixOutcomeRef.last;
            fixOutcomeRef.last = null;
            if (!postFixOutcome || !FIX_SMART_DEPENDENCIES[postFixOutcome.fixKey]) {
                var cacheAfterFix = collectDocumentCache(doc);
                clearCmykSlotCaches(cacheAfterFix);
                resultMap = runSelectedChecks(cacheAfterFix, selectedChecks, null);
            } else {
                var refreshProgress = null;
                try {
                    refreshProgress = createFixProgressDialog("Re-checking impacted tabs...");
                    refreshProgress.setStatus("Re-checking impacted tabs...", "Collecting document cache...", 10);
                    resultMap = applyPostFixUpdate(doc, resultMap, selectedChecks, postFixOutcome, refreshProgress);
                    refreshProgress.setStatus("Re-checking impacted tabs...", "Finishing...", 100);
                } finally {
                    if (refreshProgress) {
                        refreshProgress.close();
                    }
                }
            }
            if (!resultMap) {
                resultMap = {
                    "Runtime": [{ layer: "N/A", element: "Script finished without results map after fix run." }]
                };
            }
        }
    } catch (resultUiError) {
        showFallbackLogDialog(resultMap, linkedImagesWarning, String(resultUiError));
    }
}

main();
