var _a;
const API_BASE = (_a = import.meta.env.VITE_API_BASE_URL) !== null && _a !== void 0 ? _a : "/api";
export async function api(path, init) {
    var _a;
    const response = await fetch(`${API_BASE}${path}`, Object.assign({ credentials: "include", headers: Object.assign({ "Content-Type": "application/json" }, ((_a = init === null || init === void 0 ? void 0 : init.headers) !== null && _a !== void 0 ? _a : {})) }, init));
    if (response.status === 204) {
        return undefined;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw payload;
    }
    return payload;
}
//# sourceMappingURL=api.js.map