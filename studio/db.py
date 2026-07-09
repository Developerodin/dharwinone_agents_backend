"""Mongo client lifecycle for builder-v2 metadata."""

from studio import config

_client = None
_database = None
_memory = None


class _MemoryCollection:
    def __init__(self, name):
        self.name = name
        self._docs = []

    def insert_one(self, doc):
        # Mirror real Mongo: stamp a non-JSON-serializable ObjectId so leaks fail in tests too.
        if "_id" not in doc:
            from bson import ObjectId

            doc["_id"] = ObjectId()
        self._docs.append(dict(doc))
        return type("Result", (), {"inserted_id": doc.get("_id")})()

    def find_one(self, query):
        for doc in self._docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None

    def find(self, query=None):
        query = query or {}
        return [
            dict(doc)
            for doc in self._docs
            if all(doc.get(k) == v for k, v in query.items())
        ]

    def update_one(self, query, update):
        for doc in self._docs:
            if all(doc.get(k) == v for k, v in query.items()):
                if "$set" in update:
                    doc.update(update["$set"])
                return type("Result", (), {"modified_count": 1})()
        return type("Result", (), {"modified_count": 0})()

    def delete_many(self, query):
        before = len(self._docs)
        self._docs = [
            doc
            for doc in self._docs
            if not all(doc.get(k) == v for k, v in query.items())
        ]
        return type("Result", (), {"deleted_count": before - len(self._docs)})()


class _MemoryDatabase:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = _MemoryCollection(name)
        return self._collections[name]


def strip_id(doc):
    """Return a copy of a Mongo doc without the driver-level _id."""
    if not doc:
        return doc
    clean = dict(doc)
    clean.pop("_id", None)
    return clean


def mongo_enabled():
    return config.builder_v2_enabled() and bool(config.mongo_uri())


def reset_for_tests():
    global _client, _database, _memory
    _client = None
    _database = None
    _memory = None


def _memory_database():
    global _memory
    if _memory is None:
        _memory = _MemoryDatabase()
    return _memory


def _real_client():
    global _client
    if _client is None:
        from pymongo import MongoClient

        _client = MongoClient(
            config.mongo_uri(),
            serverSelectionTimeoutMS=2000,
        )
    return _client


def get_database():
    global _database
    if not mongo_enabled():
        return None
    if _database is not None:
        return _database
    uri = config.mongo_uri()
    if uri == "memory://":
        _database = _memory_database()
        return _database
    _database = _real_client()[config.mongo_db_name()]
    return _database


def collection(name):
    database = get_database()
    if database is None:
        return None
    return database[name]


def _real_ping():
    client = _real_client()
    client.admin.command("ping")
    return True


def ping():
    if not mongo_enabled():
        return False
    if config.mongo_uri() == "memory://":
        return True
    try:
        return _real_ping()
    except Exception:
        return False
