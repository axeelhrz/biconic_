"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AR_PROVINCE_CENTROIDS = exports.AR_BOUNDING_BOX = exports.AR_GEOJSON_API_PATH = exports.AR_GEOJSON_PATH = exports.AR_PROVINCE_GADM_IDS = void 0;
exports.isPointInArgentinaBBox = isPointInArgentinaBBox;
exports.getArProvinceCentroid = getArProvinceCentroid;
exports.isArgentinaDefaultCountry = isArgentinaDefaultCountry;
exports.normalizeArProvinceKey = normalizeArProvinceKey;
exports.resolveArProvinceGadmId = resolveArProvinceGadmId;
exports.AR_PROVINCE_GADM_IDS = [
    "BuenosAires",
    "Catamarca",
    "Chaco",
    "Chubut",
    "CiudaddeBuenosAires",
    "Córdoba",
    "Corrientes",
    "EntreRíos",
    "Formosa",
    "Jujuy",
    "LaPampa",
    "LaRioja",
    "Mendoza",
    "Misiones",
    "Neuquén",
    "RíoNegro",
    "Salta",
    "SanJuan",
    "SanLuis",
    "SantaCruz",
    "SantaFe",
    "SantiagodelEstero",
    "TierradelFuego",
    "Tucumán",
];
exports.AR_GEOJSON_PATH = "/geo/ar-provincias.geojson";
exports.AR_GEOJSON_API_PATH = "/api/geo/ar-provincias";
exports.AR_BOUNDING_BOX = {
    minLat: -55.2,
    maxLat: -20.8,
    minLon: -73.8,
    maxLon: -52.5,
};
function isPointInArgentinaBBox(lat, lon) {
    return (lat >= exports.AR_BOUNDING_BOX.minLat &&
        lat <= exports.AR_BOUNDING_BOX.maxLat &&
        lon >= exports.AR_BOUNDING_BOX.minLon &&
        lon <= exports.AR_BOUNDING_BOX.maxLon);
}
exports.AR_PROVINCE_CENTROIDS = {
    BuenosAires: { lat: -36.67549836562738, lon: -60.56205506343393 },
    Catamarca: { lat: -27.336327615082944, lon: -66.94359978806544 },
    Chaco: { lat: -26.387265822719876, lon: -60.76691518178766 },
    Chubut: { lat: -43.790210867200656, lon: -68.52586821574691 },
    CiudaddeBuenosAires: { lat: -34.61761355326359, lon: -58.444370995315985 },
    Córdoba: { lat: -32.141135608503596, lon: -63.799556068847835 },
    Corrientes: { lat: -28.776272193840487, lon: -57.805869320052636 },
    EntreRíos: { lat: -32.047270049096326, lon: -59.20572662030234 },
    Formosa: { lat: -24.894485812397754, lon: -59.934195877966694 },
    Jujuy: { lat: -23.31941922170246, lon: -65.76174431204471 },
    LaPampa: { lat: -37.13021957982957, lon: -65.4483530388636 },
    LaRioja: { lat: -29.678131775099537, lon: -67.18066223306123 },
    Mendoza: { lat: -34.628603273282835, lon: -68.5870302750928 },
    Misiones: { lat: -26.874892952023437, lon: -54.64725170428022 },
    Neuquén: { lat: -38.63921765945261, lon: -70.11760381805207 },
    RíoNegro: { lat: -40.40647047127993, lon: -67.22842968149803 },
    Salta: { lat: -24.296134316579266, lon: -64.81725572662444 },
    SanJuan: { lat: -30.85940149566004, lon: -68.88175243056162 },
    SanLuis: { lat: -33.767456774650086, lon: -66.02993211997952 },
    SantaCruz: { lat: -48.810802353534214, lon: -69.92690912316122 },
    SantaFe: { lat: -30.70342928985597, lon: -60.95066971236405 },
    SantiagodelEstero: { lat: -27.782223839051234, lon: -63.258486975120476 },
    TierradelFuego: { lat: -54.321013513820255, lon: -67.47733648478123 },
    Tucumán: { lat: -26.943782273149736, lon: -65.36568838799188 },
};
function getArProvinceCentroid(id) {
    return exports.AR_PROVINCE_CENTROIDS[id] ?? null;
}
function isArgentinaDefaultCountry(mapDefaultCountry) {
    if (!mapDefaultCountry || typeof mapDefaultCountry !== "string")
        return false;
    const n = mapDefaultCountry
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
    return n === "argentina" || n === "ar";
}
function normalizeArProvinceKey(raw) {
    return raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}
const idToNorm = Object.fromEntries(exports.AR_PROVINCE_GADM_IDS.map((id) => [id, normalizeArProvinceKey(id.replace(/_/g, ""))]));
const normToId = new Map();
for (const id of exports.AR_PROVINCE_GADM_IDS) {
    normToId.set(idToNorm[id], id);
}
const SYNONYM_TO_NORM = {
    caba: "ciudaddebuenosaires",
    capital: "ciudaddebuenosaires",
    capitalfederal: "ciudaddebuenosaires",
    ciudadautonomadebuenosaires: "ciudaddebuenosaires",
    ciudaddelabuenosaires: "ciudaddebuenosaires",
    baires: "buenosaires",
    bsas: "buenosaires",
    bsasprovincia: "buenosaires",
    pba: "buenosaires",
    provinciadebuenosaires: "buenosaires",
    granbuenosaires: "buenosaires",
    gba: "buenosaires",
    cba: "cordoba",
    cordobacapital: "cordoba",
    mdz: "mendoza",
    mendozacapital: "mendoza",
    sf: "santafe",
    stafe: "santafe",
    santafeprovincia: "santafe",
    provinciadesantafe: "santafe",
    rosario: "santafe",
    laplata: "buenosaires",
    mardelplata: "buenosaires",
    neuquencapital: "neuquen",
    jujuyprovincia: "jujuy",
    chubutprovincia: "chubut",
    santacruzprovincia: "santacruz",
    lapampa: "lapampa",
    lapampaprovincia: "lapampa",
    entrerios: "entrerios",
    entre: "entrerios",
    corrientesprovincia: "corrientes",
    misionesprovincia: "misiones",
    formosaprovincia: "formosa",
    catamarcaprovincia: "catamarca",
    sanjuanprovincia: "sanjuan",
    sanluisprovincia: "sanluis",
    rionegro: "rionegro",
    rionegroprovincia: "rionegro",
    chacoprovincia: "chaco",
    tf: "tierradelfuego",
    tdf: "tierradelfuego",
    tierradelfuegoantartidaeislasdelatlanticosur: "tierradelfuego",
    tierradelfuegoais: "tierradelfuego",
    santiagodelestero: "santiagodelestero",
    santiagodel: "santiagodelestero",
};
function resolveArProvinceGadmId(raw) {
    if (raw == null)
        return null;
    const s = String(raw).trim();
    if (!s)
        return null;
    let key = normalizeArProvinceKey(s);
    if (!key)
        return null;
    const viaSyn = SYNONYM_TO_NORM[key];
    if (viaSyn) {
        const id = normToId.get(viaSyn);
        return id ?? null;
    }
    const direct = normToId.get(key);
    if (direct)
        return direct;
    const first = s.split(",")[0]?.trim();
    if (first && first !== s) {
        return resolveArProvinceGadmId(first);
    }
    return null;
}
//# sourceMappingURL=argentinaProvinces.js.map