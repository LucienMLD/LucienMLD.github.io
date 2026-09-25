# frozen_string_literal: true

require 'base64'
require 'digest'

# Writes _site/_headers, which Cloudflare applies to every static asset
# response: HSTS, anti-clickjacking, and a Content-Security-Policy.
# The theme puts two inline <script> blocks in every page: they are allowed by
# their SHA-256 hash, computed here from the built HTML so the policy follows
# any theme update. tests/e2e/csp.spec.js loads the pages under this policy.
module SecurityHeaders
  # jQuery, Foundation and Remixicon come from jsDelivr, fonts from Google Fonts
  CSP = {
    'default-src' => ["'none'"],
    'script-src' => ["'self'", 'https://cdn.jsdelivr.net'],
    # 'unsafe-inline': the 404 and home pages have <style> blocks, and the
    # Brakeman visualizer and thank-you page use style attributes
    'style-src' => ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
    'font-src' => ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
    'img-src' => ["'self'", 'data:'],
    'connect-src' => ["'self'"],
    'manifest-src' => ["'self'"],
    'base-uri' => ["'self'"],
    'form-action' => ["'self'"],
    'frame-ancestors' => ["'none'"],
    'object-src' => ["'none'"],
    'upgrade-insecure-requests' => []
  }.freeze

  HEADERS = {
    # No includeSubDomains: other subdomains may not all serve HTTPS
    'Strict-Transport-Security' => 'max-age=31536000',
    'X-Content-Type-Options' => 'nosniff',
    'X-Frame-Options' => 'DENY',
    'Referrer-Policy' => 'strict-origin-when-cross-origin',
    'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy' => 'same-origin'
  }.freeze

  INLINE_SCRIPT = %r{<script(\s[^>]*)?>(.*?)</script>}mi
  # Data blocks (JSON-LD) are never executed, so CSP does not apply to them
  NON_JS_TYPE = /\btype\s*=\s*["']?(?!text\/javascript|module)[^"'\s>]+/i

  def self.inline_script_hashes(site_dir)
    Dir.glob(File.join(site_dir, '**', '*.html')).flat_map do |path|
      File.read(path, encoding: 'UTF-8').scan(INLINE_SCRIPT).filter_map do |attributes, body|
        next if attributes.to_s.match?(/\bsrc\s*=/i) || attributes.to_s.match?(NON_JS_TYPE)

        "'sha256-#{Base64.strict_encode64(Digest::SHA256.digest(body))}'"
      end
    end.uniq.sort
  end

  def self.policy(site_dir)
    directives = CSP.merge('script-src' => CSP['script-src'] + inline_script_hashes(site_dir))
    directives.map { |name, sources| [name, *sources].join(' ') }.join('; ')
  end

  def self.write(site)
    headers = HEADERS.merge('Content-Security-Policy' => policy(site.dest))
    File.write(File.join(site.dest, '_headers'), "/*\n#{headers.map { |k, v| "  #{k}: #{v}\n" }.join}")
  end
end

Jekyll::Hooks.register :site, :post_write do |site|
  SecurityHeaders.write(site)
end
