"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatValue = formatValue;
exports.getLayoutPadding = getLayoutPadding;
exports.normalizeChartPercentBasis = normalizeChartPercentBasis;
exports.sumFiniteNumbers = sumFiniteNumbers;
exports.resolvePercentDenominator = resolvePercentDenominator;
exports.formatChartPointDisplay = formatChartPointDisplay;
exports.getValueFormatter = getValueFormatter;
exports.normalizeLabelVisibilityMode = normalizeLabelVisibilityMode;
exports.getSampledIndices = getSampledIndices;
exports.getMinMaxValueIndices = getMinMaxValueIndices;
exports.getVisibleIndices = getVisibleIndices;
exports.createCategoryTickCallback = createCategoryTickCallback;
exports.createDataLabelDisplay = createDataLabelDisplay;
exports.createLegendLabelFilter = createLegendLabelFilter;
exports.buildChartOptions = buildChartOptions;
exports.toChartStyleConfig = toChartStyleConfig;
exports.getPieLegendMaxWidthScriptable = getPieLegendMaxWidthScriptable;
exports.getPieDoughnutLayoutPadding = getPieDoughnutLayoutPadding;
exports.buildPieDoughnutLegendShared = buildPieDoughnutLegendShared;
exports.buildMiniChartOptions = buildMiniChartOptions;
const DEFAULT_LAYOUT_PADDING = 16;
function applyScale(n, scale) {
    if (scale === "K" && Math.abs(n) >= 1000)
        return { val: n / 1000, suffix: "K" };
    if (scale === "M" && Math.abs(n) >= 1e6)
        return { val: n / 1e6, suffix: "M" };
    if (scale === "M" && Math.abs(n) >= 1000)
        return { val: n / 1000, suffix: "K" };
    if ((scale === "Bi" || scale === "B") && Math.abs(n) >= 1e9)
        return { val: n / 1e9, suffix: "B" };
    if ((scale === "Bi" || scale === "B") && Math.abs(n) >= 1e6)
        return { val: n / 1e6, suffix: "M" };
    if ((scale === "Bi" || scale === "B") && Math.abs(n) >= 1000)
        return { val: n / 1000, suffix: "K" };
    return { val: n, suffix: "" };
}
const NUMBER_LOCALE = "es-ES";
function formatValue(value, format = "none", currencySymbol = "$", scale = "none", decimals = 2, useGrouping = true) {
    const n = Number(value);
    const { val, suffix } = applyScale(n, scale);
    const formatted = val.toLocaleString(NUMBER_LOCALE, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: 0,
        useGrouping,
    });
    const withSuffix = `${formatted}${suffix}`;
    if (format === "percent")
        return `${withSuffix}%`;
    if (format === "currency")
        return `${currencySymbol}${withSuffix}`;
    return withSuffix;
}
function getLayoutPadding(style) {
    return style?.layoutPadding ?? DEFAULT_LAYOUT_PADDING;
}
function normalizeChartPercentBasis(b) {
    if (b === "grand_total")
        return "chart_visible_total";
    if (b === "per_category")
        return "per_category_axis";
    if (b === "chart_visible_total" ||
        b === "analysis_total" ||
        b === "per_series" ||
        b === "per_category_axis" ||
        b === "per_dimension_group" ||
        b === "per_denominator_metric") {
        return b;
    }
    return "chart_visible_total";
}
function sumFiniteNumbers(values) {
    let sum = 0;
    for (const v of values) {
        const n = Number(v);
        if (Number.isFinite(n))
            sum += n;
    }
    return sum;
}
function resolvePercentDenominator(basis, datasets, dataIndex, datasetIndex) {
    if (!datasets || datasets.length === 0)
        return 0;
    const effective = basis === "grand_total"
        ? "chart_visible_total"
        : basis === "per_category"
            ? "per_category_axis"
            : basis;
    switch (effective) {
        case "chart_visible_total":
        case "analysis_total":
        case "per_dimension_group":
        case "per_denominator_metric": {
            let sum = 0;
            for (const ds of datasets) {
                if (!Array.isArray(ds?.data))
                    continue;
                sum += sumFiniteNumbers(ds.data);
            }
            return sum;
        }
        case "per_category_axis": {
            if (datasets.length === 1) {
                const arr = datasets[0]?.data;
                return Array.isArray(arr) ? sumFiniteNumbers(arr) : 0;
            }
            let sumCat = 0;
            for (const ds of datasets) {
                const arr = ds?.data;
                if (!Array.isArray(arr) || dataIndex < 0 || dataIndex >= arr.length)
                    continue;
                const n = Number(arr[dataIndex]);
                if (Number.isFinite(n))
                    sumCat += n;
            }
            return sumCat;
        }
        case "per_series": {
            const ds = datasets[datasetIndex];
            if (!ds || !Array.isArray(ds.data))
                return 0;
            return sumFiniteNumbers(ds.data);
        }
        default:
            return 0;
    }
}
function formatChartPointDisplay(rawValue, style, labelMode, percentBasis, ctx) {
    const mode = labelMode ?? "value";
    const format = (style?.valueFormat ?? "none");
    const symbol = style?.currencySymbol ?? "$";
    const scale = (style?.valueScale ?? "none");
    const decimals = style?.decimals ?? 2;
    const useGrouping = style?.useGrouping !== false;
    const formatMetricValue = (v) => formatValue(Number(v), format, symbol, scale, decimals, useGrouping);
    const formatPercentPart = (value, total) => {
        const pct = total ? (Number(value) / total) * 100 : 0;
        return `${pct.toFixed(Math.min(1, decimals))}%`;
    };
    if (mode === "value") {
        return formatMetricValue(rawValue);
    }
    const datasets = ctx?.chart?.data?.datasets;
    if (!Array.isArray(datasets) || datasets.length === 0) {
        return formatMetricValue(rawValue);
    }
    const di = typeof ctx?.dataIndex === "number" ? ctx.dataIndex : -1;
    const dsi = typeof ctx?.datasetIndex === "number" && ctx.datasetIndex >= 0 ? ctx.datasetIndex : 0;
    let total;
    if (typeof ctx?.percentDenominator === "number" && Number.isFinite(ctx.percentDenominator)) {
        total = ctx.percentDenominator;
    }
    else if (di < 0) {
        const first = datasets[0]?.data;
        total = Array.isArray(first) ? sumFiniteNumbers(first) : 0;
    }
    else {
        total = resolvePercentDenominator(percentBasis, datasets, di, dsi);
    }
    if (mode === "percent") {
        return formatPercentPart(rawValue, total);
    }
    if (mode === "both") {
        const valueText = formatMetricValue(rawValue);
        const percentText = formatPercentPart(rawValue, total);
        return `${valueText}\n${percentText}`;
    }
    return formatMetricValue(rawValue);
}
function getValueFormatter(style, labelMode, percentBasis = "chart_visible_total") {
    return (value, ctx) => formatChartPointDisplay(Number(value), style, labelMode ?? "value", percentBasis, ctx);
}
const DEFAULT_AUTO_LABEL_LIMIT = 8;
function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function resolveAutoLimit(limit) {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 2)
        return DEFAULT_AUTO_LABEL_LIMIT;
    return Math.floor(n);
}
function normalizeLabelVisibilityMode(mode) {
    if (mode === "all" || mode === "auto" || mode === "min_max")
        return mode;
    return "auto";
}
function getSampledIndices(total, maxVisible) {
    const out = new Set();
    if (total <= 0)
        return out;
    const limit = resolveAutoLimit(maxVisible);
    if (total <= limit) {
        for (let i = 0; i < total; i += 1)
            out.add(i);
        return out;
    }
    const step = (total - 1) / (limit - 1);
    for (let slot = 0; slot < limit; slot += 1) {
        out.add(Math.round(slot * step));
    }
    out.add(0);
    out.add(total - 1);
    return out;
}
function getMinMaxValueIndices(values) {
    const out = new Set();
    if (!Array.isArray(values) || values.length === 0)
        return out;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const numericAt = [];
    values.forEach((value, index) => {
        const n = toFiniteNumber(value);
        if (n == null)
            return;
        numericAt.push({ index, value: n });
        if (n < min)
            min = n;
        if (n > max)
            max = n;
    });
    if (numericAt.length === 0)
        return out;
    numericAt.forEach(({ index, value }) => {
        if (value === min || value === max)
            out.add(index);
    });
    return out;
}
function getVisibleIndices(params) {
    const { total, values, maxVisible } = params;
    const mode = normalizeLabelVisibilityMode(params.mode);
    if (total <= 0)
        return new Set();
    if (mode === "all") {
        const all = new Set();
        for (let i = 0; i < total; i += 1)
            all.add(i);
        return all;
    }
    if (mode === "min_max") {
        const minMax = getMinMaxValueIndices(values ?? []);
        if (minMax.size > 0)
            return minMax;
        return new Set([0, total - 1]);
    }
    return getSampledIndices(total, maxVisible);
}
function createCategoryTickCallback(params) {
    const labels = Array.isArray(params.labels) ? params.labels : [];
    const visible = getVisibleIndices({
        total: labels.length,
        mode: params.mode,
        values: labels,
        maxVisible: params.maxVisible,
    });
    return (value, _tickIndex) => {
        const dataIndex = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(dataIndex)) {
            return params.formatter ? params.formatter(value, -1) : String(value ?? "");
        }
        const safeIndex = Math.trunc(dataIndex);
        if (labels.length > 0 && !visible.has(safeIndex))
            return "";
        const raw = labels[safeIndex] ?? value;
        const text = params.formatter ? params.formatter(raw, safeIndex) : String(raw ?? "");
        return text;
    };
}
function combinedCategoryMagnitudes(datasets, categoryCount) {
    const out = [];
    for (let i = 0; i < categoryCount; i += 1) {
        let maxAbs = 0;
        let any = false;
        for (const ds of datasets) {
            const arr = Array.isArray(ds.data) ? ds.data : [];
            const n = toFiniteNumber(arr[i]);
            if (n != null) {
                any = true;
                maxAbs = Math.max(maxAbs, Math.abs(n));
            }
        }
        out.push(any ? maxAbs : null);
    }
    return out;
}
function createDataLabelDisplay(params) {
    const mode = normalizeLabelVisibilityMode(params.mode);
    if (mode === "all")
        return true;
    const datasets = Array.isArray(params.datasets) ? params.datasets : [];
    const labelLen = Array.isArray(params.labels) ? params.labels.length : 0;
    const maxDataLen = datasets.reduce((m, ds) => Math.max(m, Array.isArray(ds.data) ? ds.data.length : 0), 0);
    const categoryCount = Math.max(labelLen, maxDataLen);
    const multiSeries = datasets.length > 1 && categoryCount > 0;
    let sharedByCategory = null;
    if (multiSeries && (mode === "auto" || mode === "min_max")) {
        if (mode === "auto") {
            sharedByCategory = getSampledIndices(categoryCount, params.maxVisible);
        }
        else {
            const combined = combinedCategoryMagnitudes(datasets, categoryCount);
            sharedByCategory = getMinMaxValueIndices(combined);
            if (sharedByCategory.size === 0 && categoryCount > 0) {
                sharedByCategory = new Set([0, categoryCount - 1]);
            }
        }
    }
    const perDataset = datasets.map((dataset) => getVisibleIndices({
        total: Array.isArray(dataset.data) ? dataset.data.length : 0,
        mode,
        values: Array.isArray(dataset.data) ? dataset.data : [],
        maxVisible: params.maxVisible,
    }));
    return (ctx) => {
        const datasetIndex = ctx?.datasetIndex ?? 0;
        const dataIndex = ctx?.dataIndex ?? -1;
        if (dataIndex < 0)
            return false;
        if (sharedByCategory) {
            return sharedByCategory.has(dataIndex);
        }
        const visible = perDataset[datasetIndex];
        if (!visible)
            return false;
        return visible.has(dataIndex);
    };
}
function createLegendLabelFilter(params) {
    const mode = normalizeLabelVisibilityMode(params.mode);
    if (mode === "all")
        return undefined;
    const labels = Array.isArray(params.labels) ? params.labels : [];
    const datasets = Array.isArray(params.datasets) ? params.datasets : [];
    const firstDatasetValues = Array.isArray(datasets[0]?.data) ? datasets[0].data : [];
    const isCategoryLegend = labels.length > 0 && datasets.length <= 1 && firstDatasetValues.length === labels.length;
    const total = isCategoryLegend ? labels.length : datasets.length;
    const visible = getVisibleIndices({
        total,
        mode,
        values: isCategoryLegend ? firstDatasetValues : undefined,
        maxVisible: params.maxVisible,
    });
    return (item) => {
        const idx = typeof item.index === "number" ? item.index : typeof item.datasetIndex === "number" ? item.datasetIndex : -1;
        return idx >= 0 && visible.has(idx);
    };
}
function buildChartOptions(type, style, labelDisplayMode, chartPercentBasis = "chart_visible_total") {
    const padding = getLayoutPadding(style);
    const basis = normalizeChartPercentBasis(chartPercentBasis);
    const effectiveLabelMode = type === "pie" || type === "doughnut"
        ? labelDisplayMode || "percent"
        : labelDisplayMode ?? "value";
    const formatter = getValueFormatter(style, effectiveLabelMode, basis);
    const fontSize = style?.dataLabelFontSize ?? 12;
    const color = style?.dataLabelColor ?? "#374151";
    const tickFontSize = style?.fontSize ?? 11;
    const tickFamily = style?.chartFontFamily;
    const tickColor = style?.axisTickColor;
    const categoryTickOpts = {
        clip: false,
        font: { size: tickFontSize, ...(tickFamily ? { family: tickFamily } : {}) },
        ...(tickColor != null && tickColor !== "" ? { color: tickColor } : {}),
        ...(style?.categoryTickMaxRotation != null
            ? { maxRotation: style.categoryTickMaxRotation, minRotation: style.categoryTickMinRotation ?? 0 }
            : {}),
        ...(style?.categoryMaxTicks != null && Number.isFinite(style.categoryMaxTicks)
            ? { maxTicksLimit: Math.max(2, Math.floor(style.categoryMaxTicks)), autoSkip: true }
            : {}),
    };
    const valueTickOpts = {
        clip: false,
        font: { size: tickFontSize, ...(tickFamily ? { family: tickFamily } : {}) },
        ...(tickColor != null && tickColor !== "" ? { color: tickColor } : {}),
    };
    const base = {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding },
        plugins: {
            legend: {
                display: true,
                fullSize: false,
                align: "start",
                labels: {
                    boxWidth: 12,
                    padding: 10,
                    font: { size: tickFontSize, ...(tickFamily ? { family: tickFamily } : {}) },
                    ...(tickColor != null && tickColor !== "" ? { color: tickColor } : {}),
                },
            },
            datalabels: {
                display: true,
                color,
                font: {
                    size: fontSize,
                    weight: "bold",
                    ...(tickFamily ? { family: tickFamily } : {}),
                },
                formatter,
            },
        },
    };
    if (type === "bar" || type === "horizontalBar" || type === "line") {
        const scales = {};
        const gridColor = style?.gridColor ?? "#eee";
        const gridLineW = style?.gridLineWidth != null && Number.isFinite(style.gridLineWidth)
            ? Math.max(0, Math.min(6, style.gridLineWidth))
            : undefined;
        const gridLineOpts = gridLineW != null ? { lineWidth: gridLineW } : {};
        const gridX = { display: style?.gridXDisplay ?? false, color: gridColor, ...gridLineOpts };
        const gridY = { display: style?.gridYDisplay ?? true, color: gridColor, ...gridLineOpts };
        const axisXCategory = {
            display: style?.axisXVisible ?? true,
            reverse: style?.axisXReverse ?? false,
            grid: gridX,
            ticks: { ...categoryTickOpts },
        };
        const axisYCategory = {
            display: style?.axisYVisible ?? true,
            reverse: style?.axisYReverse ?? false,
            grid: gridY,
            ticks: { ...categoryTickOpts },
        };
        const axisXValue = {
            display: style?.axisXVisible ?? true,
            reverse: style?.axisXReverse ?? false,
            grid: gridX,
            ticks: { ...valueTickOpts },
        };
        const axisYValue = {
            display: style?.axisYVisible ?? true,
            reverse: style?.axisYReverse ?? false,
            grid: gridY,
            ticks: { ...valueTickOpts },
        };
        if (type === "horizontalBar") {
            const horizontalCategoryTicks = style?.categoryMaxTicks != null && Number.isFinite(style.categoryMaxTicks)
                ? categoryTickOpts
                : { ...categoryTickOpts, autoSkip: false };
            scales.x = axisXValue;
            scales.y = {
                ...axisYCategory,
                grid: gridY,
                ticks: horizontalCategoryTicks,
            };
        }
        else {
            scales.x = axisXCategory;
            scales.y = axisYValue;
        }
        return {
            ...base,
            ...(type === "horizontalBar" ? { indexAxis: "y" } : {}),
            scales,
            ...(type === "bar" || type === "horizontalBar"
                ? {
                    borderRadius: style?.barBorderRadius ?? 4,
                }
                : {}),
            ...(type === "line"
                ? {
                    elements: {
                        line: { borderWidth: style?.lineBorderWidth ?? 2 },
                        point: { radius: style?.pointRadius ?? 3 },
                    },
                }
                : {}),
        };
    }
    if (type === "pie" || type === "doughnut") {
        const plugins = base.plugins;
        const dl = plugins.datalabels ?? {};
        return {
            ...base,
            plugins: {
                ...base.plugins,
                datalabels: {
                    ...dl,
                    color: style?.dataLabelColor ?? "#ffffff",
                },
            },
        };
    }
    return base;
}
function toChartStyleConfig(input) {
    const valueType = (input?.valueType ?? "none").toLowerCase();
    const rawScale = (input?.valueScale ?? "none").toUpperCase();
    const scale = rawScale === "K" ? "K" : rawScale === "M" ? "M" : rawScale === "BI" || rawScale === "B" ? "B" : "none";
    return {
        valueFormat: valueType === "currency" ? "currency" : valueType === "percent" ? "percent" : "none",
        valueScale: scale,
        currencySymbol: input?.currencySymbol ?? "$",
        decimals: input?.decimals ?? 2,
        useGrouping: input?.thousandSep !== false,
    };
}
const PIE_LEGEND_LABEL_MAX_CHARS = 120;
function truncatePieLegendText(text) {
    if (text.length <= PIE_LEGEND_LABEL_MAX_CHARS)
        return text;
    return `${text.slice(0, PIE_LEGEND_LABEL_MAX_CHARS - 3)}...`;
}
function getPieLegendMaxWidthScriptable(position) {
    return ({ chart }) => {
        const w = Math.max(chart.width, 1);
        switch (position) {
            case "top":
            case "bottom":
                return Math.max(160, Math.floor(w * 0.92));
            case "chartArea":
                return Math.max(120, Math.floor(w * 0.5));
            case "left":
            case "right":
            default:
                return Math.max(180, Math.min(440, Math.floor(w * 0.46)));
        }
    };
}
function getPieDoughnutLayoutPadding(position, basePadding = DEFAULT_LAYOUT_PADDING) {
    const e = Math.max(8, basePadding);
    switch (position) {
        case "right":
            return { top: e, bottom: e, left: e, right: e + 10 };
        case "left":
            return { top: e, bottom: e, left: e + 10, right: e };
        case "bottom":
            return { top: e, bottom: e + 14, left: e, right: e };
        case "top":
            return { top: e + 14, bottom: e, left: e, right: e };
        case "chartArea":
            return { top: e + 6, bottom: e + 6, left: e + 6, right: e + 6 };
        default:
            return { top: e, bottom: e, left: e, right: e + 10 };
    }
}
function buildPieDoughnutLegendShared(chartConfig, textColor = "#334155", options) {
    const position = options?.legendPosition ?? "right";
    const labelCount = options?.labelCount ?? chartConfig?.labels?.length ?? 0;
    const legendFontSize = labelCount > 12 ? 10 : labelCount > 8 ? 11 : 12;
    const maxWidthScriptable = getPieLegendMaxWidthScriptable(position);
    const ds0 = chartConfig?.datasets?.[0];
    if (!ds0 || !Array.isArray(ds0.backgroundColor) || !chartConfig?.labels?.length) {
        return {
            display: true,
            position,
            align: "center",
            maxWidth: maxWidthScriptable,
            labels: { color: textColor, font: { size: legendFontSize, color: textColor } },
        };
    }
    return {
        display: true,
        position,
        align: "center",
        maxWidth: maxWidthScriptable,
        labels: {
            color: textColor,
            font: { size: legendFontSize, color: textColor },
            boxWidth: 10,
            boxHeight: 10,
            padding: labelCount > 12 ? 6 : 10,
            usePointStyle: true,
            pointStyle: "circle",
            generateLabels: (chart) => {
                const labels = chart.data.labels ?? [];
                const dataset = chart.data.datasets[0];
                const bgArr = dataset?.backgroundColor;
                if (!Array.isArray(bgArr) || !labels.length)
                    return [];
                return labels.map((label, i) => {
                    const bg = bgArr[i] ?? (typeof bgArr === "string" ? bgArr : "#0ea5e9");
                    const text = truncatePieLegendText(String(label ?? ""));
                    const fill = typeof bg === "string" ? bg : "#0ea5e9";
                    return {
                        text,
                        fillStyle: fill,
                        strokeStyle: fill,
                        lineWidth: 0,
                        hidden: false,
                        index: i,
                        datasetIndex: 0,
                        fontColor: textColor,
                    };
                });
            },
        },
    };
}
function buildMiniChartOptions(horizontal = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            datalabels: { display: false },
        },
        ...(horizontal ? { indexAxis: "y" } : {}),
        scales: {
            x: { display: false, grid: { display: false } },
            y: { display: false, grid: { display: false } },
        },
    };
}
//# sourceMappingURL=chartOptions.js.map