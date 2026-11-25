/**
 * Close a WebSocket without tripping Chrome's scary console error.
 *
 * Calling `close()` on a socket that is still handshaking (readyState
 * CONNECTING) makes the browser log:
 *
 *   WebSocket connection to 'wss://...' failed:
 *   WebSocket is closed before the connection is established.
 *
 * That fired on every React StrictMode double-invoke and on every
 * symbol/timeframe switch even though the teardown was intentional. Instead of
 * closing mid-handshake, detach the handlers and let the handshake resolve:
 * if it opens we close it immediately, and if it fails the browser tears it
 * down on its own (no leak either way).
 */
export function closeWebSocketGracefully(
  socket: WebSocket | null | undefined
): void {
  if (!socket) return;

  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;

  if (socket.readyState === WebSocket.CONNECTING) {
    // Defer: closing here is what produces the console error.
    socket.onopen = () => socket.close();
  } else if (socket.readyState !== WebSocket.CLOSED) {
    socket.close();
  }
  // CLOSED: nothing to do.
}
