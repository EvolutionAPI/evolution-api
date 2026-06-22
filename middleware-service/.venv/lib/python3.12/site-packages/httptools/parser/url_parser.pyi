from array import array

class URL:
    schema: bytes
    host: bytes
    port: int
    path: bytes
    query: bytes
    fragment: bytes
    userinfo: bytes

def parse_url(url: bytes | bytearray | memoryview | array[int]) -> URL:
    """Parse a URL string into a structured Python object."""
