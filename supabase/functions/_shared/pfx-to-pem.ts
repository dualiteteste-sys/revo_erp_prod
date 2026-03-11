/**
 * PFX (PKCS#12) to PEM conversion using node-forge.
 * Extracts the certificate chain and private key for mTLS with SEFAZ.
 */
import forge from "npm:node-forge@1.3.1";

export type PemResult = {
  certPem: string;    // full chain (leaf + intermediates)
  keyPem: string;     // private key
  cnpj: string | null;
  notAfter: Date;
  notBefore: Date;
  subject: string;
};

/**
 * Convert a PFX/P12 buffer (base64 or Uint8Array) to PEM cert + key.
 *
 * @param pfxInput - base64 string or Uint8Array of the PFX file
 * @param password - PFX password
 */
export function pfxToPem(pfxInput: string | Uint8Array, password: string): PemResult {
  // Convert to DER binary string
  let derString: string;
  if (typeof pfxInput === "string") {
    derString = forge.util.decode64(pfxInput);
  } else {
    derString = String.fromCharCode(...pfxInput);
  }

  const p12Asn1 = forge.asn1.fromDer(derString);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  // Extract certificate bags
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBagList = certBags[forge.pki.oids.certBag] || [];

  // Extract key bags
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBagList = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];

  if (certBagList.length === 0) throw new Error("PFX_NO_CERT: No certificate found in PFX");
  if (keyBagList.length === 0) throw new Error("PFX_NO_KEY: No private key found in PFX");

  // Find leaf cert (has matching key) and intermediate certs
  const certs = certBagList.map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];
  const key = keyBagList[0].key as forge.pki.PrivateKey;

  // Leaf is the cert whose public key matches the private key
  let leaf: forge.pki.Certificate | null = null;
  const intermediates: forge.pki.Certificate[] = [];

  for (const cert of certs) {
    if (!leaf) {
      // Try to match — compare modulus
      const certPub = cert.publicKey as forge.pki.rsa.PublicKey;
      const privKey = key as forge.pki.rsa.PrivateKey;
      if (certPub.n && privKey.n && certPub.n.toString(16) === privKey.n.toString(16)) {
        leaf = cert;
        continue;
      }
    }
    intermediates.push(cert);
  }

  if (!leaf) {
    // Fallback: use first cert as leaf
    leaf = certs[0];
  }

  // Build PEM chain: leaf first, then intermediates
  const certPem = [leaf, ...intermediates]
    .map((c) => forge.pki.certificateToPem(c))
    .join("\n");

  const keyPem = forge.pki.privateKeyToPem(key);

  // Extract CNPJ from subject (OID 2.16.76.1.3.3)
  let cnpj: string | null = null;
  const subjectAttrs = leaf.subject.attributes;
  for (const attr of subjectAttrs) {
    // Brazilian ICP-Brasil CNPJ OID
    if (attr.type === "2.16.76.1.3.3") {
      cnpj = String(attr.value).replace(/\D/g, "").slice(0, 14);
      break;
    }
    // Also check serialName/OID_serialNumber which sometimes contains CNPJ
    if (attr.shortName === "serialName" || attr.type === "2.5.4.5") {
      const clean = String(attr.value).replace(/\D/g, "");
      if (clean.length >= 14) {
        cnpj = clean.slice(0, 14);
      }
    }
  }

  // Fallback: try CN for CNPJ pattern
  if (!cnpj) {
    const cn = leaf.subject.getField("CN");
    if (cn) {
      const match = String(cn.value).match(/\d{14}/);
      if (match) cnpj = match[0];
    }
  }

  return {
    certPem,
    keyPem,
    cnpj,
    notAfter: leaf.validity.notAfter,
    notBefore: leaf.validity.notBefore,
    subject: leaf.subject.attributes
      .map((a) => `${a.shortName || a.type}=${a.value}`)
      .join(", "),
  };
}
