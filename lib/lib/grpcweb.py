"""In-process gRPC-web → gRPC translation (unary + server-streaming), served as ASGI.

Browsers can't speak native gRPC (HTTP/2 frame control and trailers aren't
reachable from `fetch`), so the browser uses gRPC-web and this layer translates
it into ordinary gRPC servicer calls — no Envoy/proxy. It consumes the *same*
grpcio-generated registration (`add_<Svc>Servicer_to_server(servicer, app)`), so
servicers and protos stay unchanged. Unary + server-streaming are supported
(gRPC-web has no client/bidi streaming).

Wire format (unary): request body = one length-prefixed frame
`[1 flag byte][4-byte big-endian length][protobuf]`; response = a data frame then
a trailer frame (flag bit `0x80`) carrying `grpc-status`/`grpc-message`. Errors are
in-band — HTTP stays 200, the trailer's `grpc-status` is non-zero. Binary
(`application/grpc-web+proto`) and base64 text (`application/grpc-web-text+proto`)
are both accepted. Hardening: CORS is an allow-list (no blind Origin reflection),
the request body is size-capped, the compression flag and frame length are
validated, and each call is bounded by a deadline.
"""

import asyncio
import base64
import struct
from urllib.parse import quote

import grpc
from pymongo.errors import PyMongoError

from lib.logging import get_logger
from lib.resilience import OperationTimeout
from lib.storage.client import StorageError

log = get_logger(component="grpcweb")

# Transient infra failures (DB down, storage hiccup, op timeout) map to UNAVAILABLE so a
# client retries — this translator is the single egress boundary for every service's
# RPCs, so the mapping is centralised here instead of in all ~23 servicers.
_UNAVAILABLE_ERRORS = (PyMongoError, StorageError, OperationTimeout)

_ALLOW_HEADERS = "content-type,x-grpc-web,x-user-agent,authorization,grpc-timeout"
_EXPOSE_HEADERS = "grpc-status,grpc-message,grpc-status-details-bin"
_TRAILER_FLAG = 0x80
_COMPRESSED_FLAG = 0x01
_DEFAULT_MAX_MESSAGE_BYTES = 4 * 1024 * 1024
_DEFAULT_TIMEOUT_SECONDS = 30
# gRPC-timeout unit letter -> seconds (grpc-web spec: H/M/S/m/u/n).
_TIMEOUT_UNITS = {"H": 3600.0, "M": 60.0, "S": 1.0, "m": 1e-3, "u": 1e-6, "n": 1e-9}


class _Abort(Exception):
    """Raised by the context's `abort` to unwind a servicer like grpc.aio does."""


class _FrameError(Exception):
    """A malformed/oversized/compressed gRPC-web frame → a trailer-only error."""

    def __init__(self, code, details):
        super().__init__(details)
        self.code = code
        self.details = details


class _Context:
    """Subset of grpc.aio.ServicerContext the servicers use, over an ASGI request."""

    def __init__(self, metadata, peer):
        self._metadata = metadata
        self._peer = peer
        self.code = grpc.StatusCode.OK
        self.details = ""

    def invocation_metadata(self):
        return self._metadata

    def peer(self):
        return self._peer

    def set_code(self, code):
        self.code = code

    def set_details(self, details):
        self.details = details

    def set_trailing_metadata(self, metadata):
        # gRPC-web trailers come from grpc-status/message; app metadata is unused.
        return None

    async def send_initial_metadata(self, metadata):
        return None

    async def abort(self, code, details):
        self.code = code
        self.details = details
        raise _Abort(details)


def _encode_frame(payload, *, trailer=False):
    flag = _TRAILER_FLAG if trailer else 0x00
    return bytes((flag,)) + struct.pack(">I", len(payload)) + payload


def _request_message(body):
    # Unary request = a single data frame; validate framing and return its payload.
    if len(body) < 5:
        raise _FrameError(grpc.StatusCode.INVALID_ARGUMENT, "Missing request frame")
    if body[0] & _COMPRESSED_FLAG:
        raise _FrameError(grpc.StatusCode.UNIMPLEMENTED, "Compression not supported")
    (length,) = struct.unpack(">I", body[1:5])
    if 5 + length > len(body):
        raise _FrameError(grpc.StatusCode.INVALID_ARGUMENT, "Truncated request frame")
    return body[5 : 5 + length]


def _trailer_payload(code, details):
    text = f"grpc-status:{code.value[0]}\r\n"
    if details:
        text += f"grpc-message:{quote(details)}\r\n"
    return text.encode("ascii")


def _parse_timeout(headers, max_seconds):
    """Parse the `grpc-timeout` header (capped at `max_seconds`); default to the cap."""
    raw = _header(headers, b"grpc-timeout")
    if not raw or raw[-1] not in _TIMEOUT_UNITS:
        return float(max_seconds)
    try:
        seconds = int(raw[:-1]) * _TIMEOUT_UNITS[raw[-1]]
    except ValueError:
        return float(max_seconds)
    return min(seconds, max_seconds) if seconds > 0 else float(max_seconds)


class GrpcWebASGI:
    """ASGI app translating unary gRPC-web requests into grpcio servicer calls.

    Implements the grpc.Server registration surface (`add_generic_rpc_handlers` +
    `add_registered_method_handlers`) so generated `add_<Svc>Servicer_to_server`
    helpers register straight onto it.
    """

    def __init__(
        self,
        *,
        allow_origin="*",
        max_message_bytes=_DEFAULT_MAX_MESSAGE_BYTES,
        timeout_seconds=_DEFAULT_TIMEOUT_SECONDS,
    ):
        self._handlers: dict[str, grpc.RpcMethodHandler] = {}
        # CORS allow-list: "*" reflects any Origin; otherwise only listed origins.
        self._allowed = {o.strip() for o in allow_origin.split(",") if o.strip()}
        self._max_message_bytes = max_message_bytes
        self._timeout_seconds = timeout_seconds

    # --- grpc.Server registration surface ---------------------------------
    def add_generic_rpc_handlers(self, handlers):
        # add_registered_method_handlers (below) carries the full table; nothing to do.
        return None

    def add_registered_method_handlers(self, service_name, method_handlers):
        for method, handler in method_handlers.items():
            self._handlers[f"/{service_name}/{method}"] = handler

    @property
    def methods(self):
        """Registered full method paths (`/pkg.Service/Method`) — for ops/tests."""
        return tuple(self._handlers)

    # --- ASGI -------------------------------------------------------------
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return
        origin = _header(scope["headers"], b"origin")
        if scope["method"] == "OPTIONS":
            await self._send(send, 204, b"", content_type=None, origin=origin)
            return
        handler = self._handlers.get(scope["path"])
        if handler is None:
            await self._send_trailer_only(
                send, grpc.StatusCode.UNIMPLEMENTED, "Method not found", origin
            )
            return

        content_type = (_header(scope["headers"], b"content-type") or "").lower()
        is_text = "grpc-web-text" in content_type
        try:
            body = await _read_body(receive, self._max_message_bytes)
            if is_text:
                body = base64.b64decode(body)
            message = _request_message(body)
        except _FrameError as exc:
            await self._send_trailer_only(send, exc.code, exc.details, origin)
            return

        context = _Context(_metadata(scope["headers"]), _peer(scope.get("client")))
        timeout = _parse_timeout(scope["headers"], self._timeout_seconds)

        if handler.response_streaming:
            await self._respond_stream(
                send, handler, message, context, timeout, is_text, origin, scope["path"]
            )
            return

        data = None
        try:
            request = handler.request_deserializer(message)
            response = await asyncio.wait_for(
                handler.unary_unary(request, context), timeout
            )
            data = handler.response_serializer(response)
        except _Abort:
            pass
        except TimeoutError:
            context.code = grpc.StatusCode.DEADLINE_EXCEEDED
            context.details = "Deadline exceeded"
        except _UNAVAILABLE_ERRORS as exc:
            log.warning(
                "grpc-web infra unavailable on {}: {}",
                scope["path"],
                type(exc).__name__,
            )
            context.code = grpc.StatusCode.UNAVAILABLE
            context.details = "Service temporarily unavailable"
        except Exception:  # servicer/parse bug — clean INTERNAL, never leak a traceback
            log.exception("grpc-web handler failed on {}", scope["path"])
            context.code, context.details = grpc.StatusCode.INTERNAL, "Internal error"

        payload = b"" if data is None else _encode_frame(data)
        payload += _encode_frame(
            _trailer_payload(context.code, context.details), trailer=True
        )
        if is_text:
            payload = base64.b64encode(payload)
        ct = (
            "application/grpc-web-text+proto"
            if is_text
            else "application/grpc-web+proto"
        )
        await self._send(send, 200, payload, content_type=ct, origin=origin)

    async def _send_trailer_only(self, send, code, details, origin):
        payload = _encode_frame(_trailer_payload(code, details), trailer=True)
        await self._send(
            send, 200, payload, content_type="application/grpc-web+proto", origin=origin
        )

    def _cors_origin(self, origin):
        """Resolve the Access-Control-Allow-Origin value, or None to omit it."""
        if "*" in self._allowed:
            return origin or "*"
        if origin and origin in self._allowed:
            return origin
        return None

    def _response_headers(self, content_type, origin):
        headers = [
            (b"access-control-allow-methods", b"POST,OPTIONS"),
            (b"access-control-allow-headers", _ALLOW_HEADERS.encode()),
            (b"access-control-expose-headers", _EXPOSE_HEADERS.encode()),
        ]
        acao = self._cors_origin(origin)
        if acao is not None:
            headers.append((b"access-control-allow-origin", acao.encode()))
            # ACAO is origin-dependent (reflected from the allow-list) — mark it so a
            # shared/intermediary cache can't serve one origin's value to another.
            headers.append((b"vary", b"origin"))
        if content_type:
            headers.append((b"content-type", content_type.encode()))
        return headers

    async def _send(self, send, status, body, *, content_type, origin):
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": self._response_headers(content_type, origin),
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def _respond_stream(
        self, send, handler, message, context, timeout_s, is_text, origin, path
    ):
        """Server-streaming: one data frame per yielded message, then a trailer frame.

        Binary streams frame-by-frame (ASGI ``more_body``). gRPC-web-text base64s the
        whole stream as one blob, so text frames are buffered + encoded once at the end
        (browsers use binary). Abort/error/deadline ends with a non-OK trailer; frames
        already sent stay sent (standard gRPC-web).
        """
        ct = (
            "application/grpc-web-text+proto"
            if is_text
            else "application/grpc-web+proto"
        )
        buffered: list[bytes] = []

        async def emit(frame, *, last):
            if is_text:
                buffered.append(frame)
                if last:
                    body = base64.b64encode(b"".join(buffered))
                    await send({"type": "http.response.body", "body": body})
                return
            await send(
                {"type": "http.response.body", "body": frame, "more_body": not last}
            )

        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": self._response_headers(ct, origin),
            }
        )
        try:
            request = handler.request_deserializer(message)
            async with asyncio.timeout(timeout_s):
                async for response in handler.unary_stream(request, context):
                    await emit(
                        _encode_frame(handler.response_serializer(response)), last=False
                    )
        except _Abort:
            pass
        except TimeoutError:
            context.code = grpc.StatusCode.DEADLINE_EXCEEDED
            context.details = "Deadline exceeded"
        except _UNAVAILABLE_ERRORS as exc:
            log.warning(
                "grpc-web stream infra unavailable on {}: {}", path, type(exc).__name__
            )
            context.code = grpc.StatusCode.UNAVAILABLE
            context.details = "Service temporarily unavailable"
        except (
            Exception
        ):  # servicer bug — clean INTERNAL trailer, never leak a traceback
            log.exception("grpc-web stream handler failed on {}", path)
            context.code, context.details = grpc.StatusCode.INTERNAL, "Internal error"
        await emit(
            _encode_frame(
                _trailer_payload(context.code, context.details), trailer=True
            ),
            last=True,
        )


async def _read_body(receive, max_bytes):
    chunks = []
    total = 0
    more = True
    while more:
        event = await receive()
        chunk = event.get("body", b"")
        total += len(chunk)
        if total > max_bytes:
            raise _FrameError(
                grpc.StatusCode.RESOURCE_EXHAUSTED, "Request body too large"
            )
        chunks.append(chunk)
        more = event.get("more_body", False)
    return b"".join(chunks)


def _header(headers, name):
    value = next((v for k, v in headers if k == name), None)
    return value.decode() if value is not None else None


def _metadata(headers):
    return tuple((k.decode(), v.decode("latin-1")) for k, v in headers)


def _peer(client):
    return f"ipv4:{client[0]}:{client[1]}" if client else "unknown"
