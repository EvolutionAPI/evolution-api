class Proxy {
  host: string;
  port: string;
  protocol: string;
  username?: string;
  password?: string;
}

export class ProxyDto {
  enabled: boolean;
  proxy: Proxy;
}
