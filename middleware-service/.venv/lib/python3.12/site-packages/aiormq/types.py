import warnings

from .abc import *  # noqa


warnings.warn(
    "aiormq.types was deprecated and will be removed in "
    "one of next major releases. Use aiormq.abc instead.",
    category=DeprecationWarning,
    stacklevel=2,
)
