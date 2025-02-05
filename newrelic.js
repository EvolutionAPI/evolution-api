exports.config = {
    app_name: [`${process.env.CHATFLUX_ENV} Evolution API`],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'trace'
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  }
}
