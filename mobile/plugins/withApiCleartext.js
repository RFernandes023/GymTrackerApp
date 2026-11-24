const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/**
 * O Android bloqueia http:// nas versões release. Se EXPO_PUBLIC_API_URL for http (servidor na rede local),
 * abre exceção só para esse endereço; com https não altera nada.
 */
module.exports = function withApiCleartext(config) {
  const url = process.env.EXPO_PUBLIC_API_URL ?? '';
  if (!url.startsWith('http://')) return config;
  const host = new URL(url).hostname;
  config = withAndroidManifest(config, (c) => {
    c.modResults.manifest.application[0].$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return c;
  });
  return withDangerousMod(config, ['android', (c) => {
    const write = (variant, xml) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src', variant, 'res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n${xml}\n</network-security-config>\n`);
    };
    write('main', `  <domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">${host}</domain></domain-config>`);
    write('debug', '  <base-config cleartextTrafficPermitted="true" />'); // Metro em desenvolvimento
    return c;
  }]);
};
