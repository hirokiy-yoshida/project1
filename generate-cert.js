const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const certDir = path.join(process.cwd(), 'certificates');

// 証明書ディレクトリの作成
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir);
}

try {
  // 秘密鍵の生成
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // 証明書の生成
  const cert = crypto.createCertificate();
  cert.publicKey = publicKey;
  cert.privateKey = privateKey;
  cert.serial = 1;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Development' },
    { shortName: 'ST', value: 'Development' },
    { name: 'localityName', value: 'Development' },
    { name: 'countryName', value: 'JP' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(privateKey, 'sha256');

  // 証明書と秘密鍵を保存
  fs.writeFileSync(path.join(certDir, 'localhost-key.pem'), privateKey);
  fs.writeFileSync(path.join(certDir, 'localhost.pem'), cert.getPEM());

  console.log('SSL certificates generated successfully!');
} catch (error) {
  console.error('Error generating SSL certificates:', error);
  process.exit(1);
}