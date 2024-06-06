import { HttpsProxyAgent } from 'https-proxy-agent';

type Proxy = {
  host: string;
  password?: string;
  port: string;
  protocol: string;
  username?: string;
};

export function makeProxyAgent(proxy: Proxy | string) {
  if (typeof proxy === 'string') {
    return new HttpsProxyAgent(proxy);
  }

  const { host, password, port, protocol, username } = proxy;
  let proxyUrl = `${protocol}://${host}:${port}`;

  if (username && password) {
    proxyUrl = `${protocol}://${username}:${password}@${host}:${port}`;
  }
  return new HttpsProxyAgent(proxyUrl);
}
