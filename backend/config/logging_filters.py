from logging import Filter, LogRecord


class PrivateRequestFilter(Filter):
    """Replace framework request records with an event classification and status only."""

    def filter(self, record):
        status = getattr(record, "status_code", None)
        status = status if isinstance(status, int) and 100 <= status <= 599 else "unknown"
        return LogRecord(
            name="electraguard.http",
            level=record.levelno,
            pathname="",
            lineno=0,
            msg="HTTP event status=%s",
            args=(status,),
            exc_info=None,
        )
