"""Assembles the ai-agents gRPC-web ASGI app: registers servicers onto a GrpcWebASGI.

Used by app/main.py. The browser reaches this directly over gRPC-web (shared translator
in lib/grpcweb.py, the same one admin uses). Servicers are thin adapters over
app/resources. Collaborators are injected via `deps` — the SAME dict create_app (REST)
takes — so the app builds against fakes in tests.
"""

from lib.grpcweb import GrpcWebASGI

from app.routes.chat import ChatServicer
from app.routes.interview import InterviewServicer
from app.routes.jd import JdServicer
from app.routes.pb import chat_pb2_grpc, interview_pb2_grpc, jd_pb2_grpc


def create_grpc_app(
    deps, *, allow_origin="*", max_message_bytes=4 * 1024 * 1024, timeout_seconds=30
):
    """Build the gRPC-web ASGI app with the ai-agents servicers registered onto it."""
    app = GrpcWebASGI(
        allow_origin=allow_origin,
        max_message_bytes=max_message_bytes,
        timeout_seconds=timeout_seconds,
    )
    interview_pb2_grpc.add_InterviewServiceServicer_to_server(
        InterviewServicer(
            tokens=deps["tokens"],
            data=deps["data"],
            sessions=deps["sessions"],
            publisher=deps["publisher"],
            llm=deps["llm"],
            settings=deps["settings"],
        ),
        app,
    )
    chat_pb2_grpc.add_ChatServiceServicer_to_server(
        ChatServicer(
            tokens=deps["tokens"],
            llm=deps["llm"],
            data=deps["data"],
            capability=deps["capability"],
            settings=deps["settings"],
        ),
        app,
    )
    jd_pb2_grpc.add_JdServiceServicer_to_server(
        JdServicer(tokens=deps["tokens"], llm=deps["llm"]),
        app,
    )
    return app
