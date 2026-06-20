"""gRPC CompanyProfileService — public (unauthenticated) company-profile read.

Thin adapter over resources/company_profile. GetCompanyProfile needs no auth (the same
public surface as the REST mirror); a company with no published presence is NOT_FOUND.
"""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.resources import company_profile as cp_res
from app.routes.pb import company_profile_pb2, company_profile_pb2_grpc

log = get_logger(component="company_profile.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])


def _profile(d):
    t = d["trust"]
    return company_profile_pb2.CompanyProfile(
        id=d["id"],
        name=d["name"],
        about=d["about"],
        website=d["website"],
        logo=d["logo"],
        locations=d["locations"],
        trust=company_profile_pb2.TrustSignals(
            actively_reviewing=t["actively_reviewing"],
            responds_in_days=t["responds_in_days"],
            open_jobs=t["open_jobs"],
        ),
    )


class CompanyProfileServicer(company_profile_pb2_grpc.CompanyProfileServiceServicer):
    def __init__(self, *, companies, profiles, jobs, applications):
        self._companies = companies
        self._profiles = profiles
        self._jobs = jobs
        self._applications = applications

    async def GetCompanyProfile(self, request, context):
        _grpc_total.labels(method="GetCompanyProfile").inc()
        async with (
            log_context(
                log, "company_profile.Get", **bind_ids(comp_id=request.comp_id)
            ),
            span("company_profile.Get", comp_id=request.comp_id),
        ):
            out = await cp_res.get_company_profile(
                request.comp_id,
                companies=self._companies,
                profiles=self._profiles,
                jobs=self._jobs,
                applications=self._applications,
            )
            if out is None:
                await context.abort(grpc.StatusCode.NOT_FOUND, "Company not found")
            return _profile(out)
