import { writable } from "svelte/store";
import { api } from "./api";
export const session = writable({
    loading: true,
    user: null
});
export async function loadSession() {
    try {
        const data = await api("/auth/me");
        session.set({
            loading: false,
            user: data.user
        });
    }
    catch (_a) {
        session.set({
            loading: false,
            user: null
        });
    }
}
export async function login(nickname, password, rememberMe) {
    const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ nickname, password, rememberMe })
    });
    session.set({
        loading: false,
        user: data.user
    });
}
export async function register(payload) {
    const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
    });
    session.set({
        loading: false,
        user: data.user
    });
}
export async function logout() {
    await api("/auth/logout", {
        method: "POST"
    });
    session.set({
        loading: false,
        user: null
    });
}
//# sourceMappingURL=auth.js.map