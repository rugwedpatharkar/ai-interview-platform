from lib.mongodb import BaseRepository

from app.model.auth import Company


class CompanyRepository(BaseRepository[Company]):
    collection = "companies"
