import logging


logger: logging.Logger = logging.getLogger("aio_pika")


def get_logger(name: str) -> logging.Logger:
    package, module = name.split(".", 1)
    if package == logger.name:
        name = module
    return logger.getChild(name)
