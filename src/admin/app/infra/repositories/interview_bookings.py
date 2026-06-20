from typing import Any

from app.model.scheduling import InterviewBooking


class InterviewBookingRepository:
    """interview_bookings — one current booking per application (unique application_id).

    The CAS methods make pick / cancel / reschedule race-safe via the `version` counter:
    a filtered update only matches the row in the expected state, so the first writer
    wins and a lost race is a `modified_count == 0` mapped to ALREADY_EXISTS.
    """

    def __init__(self, db: Any) -> None:
        self.col = db["interview_bookings"]

    async def create(self, booking: InterviewBooking) -> str:
        res = await self.col.insert_one(booking.model_dump())
        return str(res.inserted_id)

    async def get_by_application(self, application_id: str) -> dict | None:
        return await self.col.find_one({"application_id": application_id})

    async def choose_if_proposed(
        self,
        application_id: str,
        *,
        expected_version: int,
        chosen_start_at,
        duration_minutes: int,
        location: str,
    ) -> bool:
        """CAS the candidate's pick: only the row still `proposed` at `expected_version`
        flips to `booked` (bumping version), so a second pick loses the race."""
        res = await self.col.update_one(
            {
                "application_id": application_id,
                "status": "proposed",
                "version": expected_version,
            },
            {
                "$set": {
                    "status": "booked",
                    "chosen_start_at": chosen_start_at,
                    "chosen_duration_minutes": duration_minutes,
                    "location": location,
                },
                "$inc": {"version": 1},
            },
        )
        return res.modified_count == 1

    async def cancel_if(self, application_id: str, *, by: str) -> bool:
        """CAS proposed/booked -> cancelled. False when already cancelled/completed, so
        a double-cancel is an idempotent no-op the caller treats as success."""
        res = await self.col.update_one(
            {
                "application_id": application_id,
                "status": {"$in": ["proposed", "booked"]},
            },
            {
                "$set": {"status": "cancelled", "cancelled_by": by},
                "$inc": {"version": 1},
            },
        )
        return res.modified_count == 1

    async def reset_to_proposed(
        self, application_id: str, *, location: str, note: str
    ) -> bool:
        """Reschedule: clear the chosen time + reminder flags, bump version."""
        res = await self.col.update_one(
            {"application_id": application_id},
            {
                "$set": {
                    "status": "proposed",
                    "chosen_start_at": None,
                    "chosen_duration_minutes": 0,
                    "location": location,
                    "note": note,
                    "reminded_24h": False,
                    "reminded_1h": False,
                },
                "$inc": {"version": 1},
            },
        )
        return res.modified_count == 1

    async def stamp_reminder_if_unset(self, application_id: str, field: str) -> bool:
        """CAS a reminder flag false->true so the sweep sends each reminder once."""
        res = await self.col.update_one(
            {"application_id": application_id, field: False},
            {"$set": {field: True}},
        )
        return res.modified_count == 1

    async def due_reminders(self, *, window_start, window_end) -> list[dict]:
        cursor = self.col.find(
            {
                "status": "booked",
                "chosen_start_at": {"$gte": window_start, "$lte": window_end},
            }
        )
        return await cursor.to_list(length=500)

    async def complete_past(self, *, before) -> int:
        res = await self.col.update_many(
            {"status": "booked", "chosen_start_at": {"$lt": before}},
            {"$set": {"status": "completed"}},
        )
        return res.modified_count

    async def list_for_candidate(
        self, candidate_user_id: str, *, skip: int = 0, limit: int = 20
    ) -> list[dict]:
        cursor = (
            self.col.find({"candidate_user_id": candidate_user_id})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def count_for_candidate(self, candidate_user_id: str) -> int:
        return await self.col.count_documents({"candidate_user_id": candidate_user_id})

    async def list_for_company(
        self,
        comp_id: str,
        status: str | None = None,
        *,
        skip: int = 0,
        limit: int = 20,
    ) -> list[dict]:
        query: dict = {"comp_id": comp_id}
        if status:
            query["status"] = status
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def count_for_company(self, comp_id: str, status: str | None = None) -> int:
        query: dict = {"comp_id": comp_id}
        if status:
            query["status"] = status
        return await self.col.count_documents(query)

    async def delete_by_applications(self, application_ids: list[str]) -> None:
        await self.col.delete_many({"application_id": {"$in": application_ids}})
