import pytest
from bson import ObjectId
from lib.mongodb import BaseRepository
from pydantic import BaseModel


class Item(BaseModel):
    comp_id: str
    name: str


class _InsertResult:
    def __init__(self, _id):
        self.inserted_id = _id


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    def __aiter__(self):
        async def gen():
            for d in self._docs:
                yield d

        return gen()


class FakeCollection:
    """In-memory async stand-in for a Mongo collection (the subset the repo uses)."""

    def __init__(self):
        self.docs: list[dict] = []

    @staticmethod
    def _match(doc, query):
        return all(doc.get(k) == v for k, v in query.items())

    async def insert_one(self, doc):
        doc = {**doc, "_id": ObjectId()}
        self.docs.append(doc)
        return _InsertResult(doc["_id"])

    async def find_one(self, query):
        return next((d for d in self.docs if self._match(d, query)), None)

    def find(self, query):
        return _Cursor([d for d in self.docs if self._match(d, query)])

    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if doc:
            doc.update(update["$set"])

    async def delete_one(self, query):
        doc = await self.find_one(query)
        if doc:
            self.docs.remove(doc)

    async def count_documents(self, query):
        return sum(1 for d in self.docs if self._match(d, query))


class FakeDB:
    def __init__(self):
        self._cols: dict[str, FakeCollection] = {}

    def __getitem__(self, name):
        return self._cols.setdefault(name, FakeCollection())


class ItemRepo(BaseRepository[Item]):
    collection = "items"


@pytest.fixture
def repo():
    return ItemRepo(FakeDB())


@pytest.mark.asyncio
async def test_insert_and_get(repo):
    doc_id = await repo.insert(Item(comp_id="c1", name="alpha"))
    found = await repo.get(doc_id)
    assert found["name"] == "alpha"


@pytest.mark.asyncio
async def test_find_is_tenant_scoped_by_filter(repo):
    await repo.insert(Item(comp_id="c1", name="a"))
    await repo.insert(Item(comp_id="c2", name="b"))
    c1 = await repo.find({"comp_id": "c1"})
    assert [d["name"] for d in c1] == ["a"]


@pytest.mark.asyncio
async def test_update_delete_count(repo):
    doc_id = await repo.insert(Item(comp_id="c1", name="a"))
    await repo.update(doc_id, {"name": "a2"})
    assert (await repo.get(doc_id))["name"] == "a2"
    assert await repo.count({"comp_id": "c1"}) == 1
    await repo.delete(doc_id)
    assert await repo.get(doc_id) is None


@pytest.mark.asyncio
async def test_find_capped_limits_results(repo):
    for i in range(5):
        await repo.insert(Item(comp_id="c1", name=f"n{i}"))
    rows = await repo.find_capped({"comp_id": "c1"}, cap=3)
    assert len(rows) == 3
