from app.infra.notifier import NotificationRequestPublisher
from app.model.application import Application
from app.resources import funnel
from app.resources.notification import TransitionNotifier


class _Users:
    async def get(self, user_id):
        return {"email": "cand@x.com"} if user_id == "u1" else None


class _Email:
    def __init__(self):
        self.sent = []

    async def send_email(self, to, subject, body):
        self.sent.append((to, subject, body))


def _app(candidate="u1"):
    return {"candidate_user_id": candidate, "comp_id": "c1"}


# --- TransitionNotifier ---


async def test_notifies_on_interview_invite():
    email = _Email()
    notifier = TransitionNotifier(users=_Users(), notifier=email)
    await notifier.notify(_app(), "interview_pending", "aptitude.graded")
    to, subject, _ = email.sent[0]
    assert to == "cand@x.com"
    assert "interview" in subject.lower()


async def test_notifies_on_decision():
    email = _Email()
    notifier = TransitionNotifier(users=_Users(), notifier=email)
    await notifier.notify(_app(), "hired", "recruiter.decision")
    assert email.sent[0][1] == "Congratulations!"


async def test_no_message_for_scored_state():
    email = _Email()
    notifier = TransitionNotifier(users=_Users(), notifier=email)
    await notifier.notify(_app(), "scored", "scoring.completed")
    assert email.sent == []


async def test_skips_when_candidate_missing():
    email = _Email()
    notifier = TransitionNotifier(users=_Users(), notifier=email)
    await notifier.notify(_app(candidate="ghost"), "hired", "recruiter.decision")
    assert email.sent == []


# --- advance_application integration (best-effort / soft-fail) ---


async def test_advance_application_notifies_candidate(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u1", state="applied")
    )
    email = _Email()
    new = await funnel.advance_application(
        aid,
        "application.created",
        {},
        applications=fakes["applications"],
        audit=fakes["audit"],
        notifier=TransitionNotifier(users=_Users(), notifier=email),
    )
    assert new == "aptitude_pending"
    assert email.sent[0][0] == "cand@x.com"


async def test_advance_application_soft_fails_on_notifier_error(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u1", state="applied")
    )

    class _Boom:
        async def notify(self, *args):
            raise RuntimeError("smtp down")

    new = await funnel.advance_application(
        aid,
        "application.created",
        {},
        applications=fakes["applications"],
        audit=fakes["audit"],
        notifier=_Boom(),
    )
    assert new == "aptitude_pending"  # transition still succeeds despite notifier error


async def test_notification_request_publisher_queues_event():
    """NotificationRequestPublisher.notify enqueues a notification.requested event
    instead of sending inline (a transient failure is retried → DLX). BE-#10."""

    class _Pub:
        def __init__(self):
            self.events = []

        async def publish(self, key, payload):
            self.events.append((key, payload))

    pub = _Pub()
    await NotificationRequestPublisher(pub).notify(
        {"candidate_user_id": "u1", "comp_id": "c1"},
        "shortlisted",
        "recruiter.decision",
    )
    assert pub.events == [
        (
            "notification.requested",
            {
                "candidate_user_id": "u1",
                "comp_id": "c1",
                "to_state": "shortlisted",
                "event": "recruiter.decision",
            },
        )
    ]
