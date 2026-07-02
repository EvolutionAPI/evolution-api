import { fetchLatestWaWebVersion } from '../../src/utils/fetchLatestWaWebVersion';
import axios from 'axios';
import { fetchLatestBaileysVersion } from 'baileys';

// Mock external calls to avoid depending on real network (Isolated Test)
jest.mock('axios');
jest.mock('baileys', () => ({
  fetchLatestBaileysVersion: jest.fn(),
}));

describe('fetchLatestWaWebVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default fallback version from baileys
    (fetchLatestBaileysVersion as jest.Mock).mockResolvedValue({ version: [2, 1111, 1] });
  });

  it('should fetch the latest version successfully from whatsapp web', async () => {
    // Happy path: tests if the regex finds the client revision properly inside a js file
    (axios.get as jest.Mock).mockResolvedValue({
      data: `var random_code = true; ... "client_revision": 4567 ... more random code`,
    });

    const result = await fetchLatestWaWebVersion({});
    
    expect(result.isLatest).toBe(true);
    // The function forces the array to have 2, 3000 and the found revision
    expect(result.version).toEqual([2, 3000, 4567]);
  });

  it('should fallback to baileys version if regex does not match anything', async () => {
    // Boundary/break test: the js file arrived, but doesn't have the client_revision string
    (axios.get as jest.Mock).mockResolvedValue({
      data: `just some random script without the variable the system needs`,
    });

    const result = await fetchLatestWaWebVersion({});
    
    // It must fail gracefully falling back to baileys
    expect(result.isLatest).toBe(false);
    expect(result.version).toEqual([2, 1111, 1]);
    expect(result.error?.message).toBe('Could not find client revision in the fetched content');
  });

  it('should handle network errors and fallback to baileys', async () => {
    // Another failure test: internet went down and axios threw a timeout or network error
    const err = new Error('Network timeout');
    (axios.get as jest.Mock).mockRejectedValue(err);

    const result = await fetchLatestWaWebVersion({});
    
    expect(result.isLatest).toBe(false);
    expect(result.version).toEqual([2, 1111, 1]);
    expect(result.error).toBe(err);
  });
});
