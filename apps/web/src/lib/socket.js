import { io } from "socket.io-client";
let socket = null;
export function getSocket() {
    var _a;
    if (!socket) {
        socket = io((_a = import.meta.env.VITE_SOCKET_URL) !== null && _a !== void 0 ? _a : "/", {
            withCredentials: true
        });
    }
    return socket;
}
//# sourceMappingURL=socket.js.map