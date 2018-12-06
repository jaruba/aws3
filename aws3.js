var aws3   = exports,
    url    = require('url'),
    crypto = require('crypto')

// http://docs.aws.amazon.com/Route53/latest/DeveloperGuide/RESTAuthentication.html
// http://docs.amazonwebservices.com/amazonswf/latest/developerguide/HMACAuth-swf.html

// request: { path | body, [host], [method], [headers], [service], [region] }
// credentials: { accessKeyId, secretAccessKey, [sessionToken] }
function RequestSigner(request, credentials) {

  if (typeof request === 'string') request = url.parse(request)

  var headers = request.headers || {},
      hostParts = this.matchHost(request.hostname || request.host || headers.Host)

  this.request = request
  this.credentials = credentials || this.defaultCredentials()

  this.service = request.service || hostParts[0] || ''
  this.region = request.region || hostParts[1] || 'us-east-1'
}

RequestSigner.prototype.matchHost = function(host) {
  var match = (host || '').match(/^([^\.]+)\.?([^\.]*)\.imdbws\.com$/)
  return (match || []).slice(1, 3)
}

// http://docs.aws.amazon.com/general/latest/gr/rande.html
RequestSigner.prototype.isSingleRegion = function() {
  return this.service === 'route53'
}

RequestSigner.prototype.createHost = function() {
  var region = this.isSingleRegion() ? '' : '.' + this.region
  return this.service + region + '.amazonaws.com'
}

RequestSigner.prototype.sign = function() {
  var request = this.request
	  
  if (!this.request.host) this.request.host = require('url').parse(this.request.url).host	 

  if (!this.request.method) this.request.method = 'GET'

  var headers = request.headers = (request.headers || {}),
      date = new Date(headers.Date || new Date)

  if (!request.method && request.body)
    request.method = 'POST'

  if (!headers.Host && !headers.host)
    headers.Host = request.hostname || request.host || this.createHost()
  if (!request.hostname && !request.host)
    request.hostname = headers.Host || headers.host

  if (request.body && !headers['Content-Type'] && !headers['content-type'])
    headers['Content-Type'] = 'text/xml'

  if (request.body && !headers['Content-Length'] && !headers['content-length'])
    headers['Content-Length'] = Buffer.byteLength(request.body)

  headers['X-Amz-Date'] = date.toUTCString()

  if (this.credentials.sessionToken)
    headers['X-Amz-Security-Token'] = this.credentials.sessionToken

  if (headers['X-Amzn-Authorization']) delete headers['X-Amzn-Authorization']
  headers['X-Amzn-Authorization'] = this.authHeader()

  return request
}

RequestSigner.prototype.authHeader = function() {
  if (this.service === 'route53')
    return [
      'AWS3-HTTPS AWSAccessKeyId=' + this.credentials.accessKeyId,
      'Algorithm=HmacSHA256',
      'Signature=' + this.signature()
    ].join(',')

  return [
    'AWS3 AWSAccessKeyId=' + this.credentials.accessKeyId,
    'Algorithm=HmacSHA256',
    'SignedHeaders=' + this.signedHeaders(),
    'Signature=' + this.signature()
  ].join(',')
}

RequestSigner.prototype.signature = function() {
  return crypto.createHmac('sha256', this.credentials.secretAccessKey)
    .update(this.stringToSign()).digest('base64').trim()
}

RequestSigner.prototype.stringToSign = function() {
  if (this.service === 'route53') return this.request.headers['X-Amz-Date']
  var parts = [
    this.request.method,
    require('url').parse(this.request.url).pathname,
	(this.request.url.includes('?') ? this.request.url.split('?')[1] : ''),
    this.canonicalHeaders(),
	'',
    this.request.body || ''
  ].join('\n')

  return crypto.createHash('sha256').update(parts, 'utf8').digest()
}

RequestSigner.prototype.canonicalHeaders = function() {
  var headers = this.request.headers
  return this.headersToSign()
    .sort(function(a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1 })
    .map(function(key) { return key.toLowerCase() + ':' + headers[key].toString().trim() })
    .join('\n')
}

RequestSigner.prototype.signedHeaders = function() {
  return this.headersToSign()
//    .map(function(key) { return key.toLowerCase() })
    .sort()
    .join(';')
}

RequestSigner.prototype.headersToSign = function() {
  return Object.keys(this.request.headers).filter(function(key) {
    return /Host/i.test(key) || /Content-Encoding/i.test(key) || /^X-Amz/i.test(key)
  })
}

RequestSigner.prototype.defaultCredentials = function() {
  var env = process.env
  return {
    accessKeyId:     env.AWS_ACCESS_KEY_ID     || env.AWS_ACCESS_KEY,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || env.AWS_SECRET_KEY,
    sessionToken:    env.AWS_SESSION_TOKEN
  }
}

aws3.RequestSigner = RequestSigner

aws3.sign = function(request, credentials) {
  return new RequestSigner(request, credentials).sign()
}
