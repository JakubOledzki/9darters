import { writable } from "svelte/store";
import { api } from "./api";

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  rating: number;
  isAdmin: boolean;
};

type SessionState = {
  loading: boolean;
  user: SessionUser | null;
};

export const session = writable<SessionState>({
  loading: true,
  user: null
});

export async function loadSession() {
  try {
    const data = await api<{ user: SessionUser | null }>("/auth/me");
    session.set({
      loading: false,
      user: data.user
    });
  } catch {
    session.set({
      loading: false,
      user: null
    });
  }
}

export async function login(nickname: string, password: string, rememberMe: boolean) {
  const data = await api<{ user: SessionUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ nickname, password, rememberMe })
  });

  session.set({
    loading: false,
    user: data.user
  });
}

export async function register(payload: {
  firstName: string;
  lastName: string;
  nickname: string;
  password: string;
}) {
  const data = await api<{ user: SessionUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  session.set({
    loading: false,
    user: data.user
  });
}

export async function logout() {
  try {
    await api("/auth/logout", {
      method: "POST"
    });
  } catch {
    // Treat logout as local success even if the server session is already gone.
  } finally {
    session.set({
      loading: false,
      user: null
    });
  }
}
