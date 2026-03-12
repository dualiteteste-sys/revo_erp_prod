/**
 * XML-DSig signing for NF-e events using node-forge.
 *
 * Implements RSA-SHA256 enveloped signatures as required by
 * SEFAZ RecepcaoEvento (NT 2014.002 / NF-e 4.0).
 */
import forge from "npm:node-forge@1.3.1";

/**
 * Build a signed <evento> XML element for SEFAZ RecepcaoEvento.
 *
 * The signing follows the NF-e 4.0 XML-DSig specification:
 * - CanonicalizationMethod: C14N 1.0
 * - SignatureMethod: RSA-SHA256
 * - DigestMethod: SHA-256
 * - Transforms: Enveloped + Exclusive C14N
 */
export function buildSignedEvento(params: {
  tpAmb: "1" | "2";
  cnpj: string;
  chNFe: string;
  tpEvento: string;
  descEvento: string;
  nSeqEvento: number;
  dhEvento: string;
  xJust?: string;
  certPem: string;
  keyPem: string;
}): string {
  const {
    tpAmb, cnpj, chNFe, tpEvento, descEvento,
    nSeqEvento, dhEvento, xJust, certPem, keyPem,
  } = params;

  const eventId = `ID${tpEvento}${chNFe}${String(nSeqEvento).padStart(2, "0")}`;

  // Build detEvento content
  let detEventoContent = `<descEvento>${escapeXml(descEvento)}</descEvento>`;
  if (xJust) {
    detEventoContent += `<xJust>${escapeXml(xJust)}</xJust>`;
  }

  // Build canonical infEvento (with explicit namespace for digest computation)
  // Per exclusive C14N, the visibly utilized default namespace must be declared.
  const infEventoCanonical =
    `<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" Id="${eventId}">` +
    `<cOrgao>91</cOrgao>` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<chNFe>${chNFe}</chNFe>` +
    `<dhEvento>${dhEvento}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento>` +
    `<nSeqEvento>${nSeqEvento}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00">${detEventoContent}</detEvento>` +
    `</infEvento>`;

  // 1. SHA-256 digest of canonical infEvento
  const digestValue = sha256Base64(infEventoCanonical);

  // 2. Build canonical SignedInfo (with explicit namespace for signing)
  const signedInfoCanonical =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${eventId}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  // 3. RSA-SHA256 sign the canonical SignedInfo (PKCS#1 v1.5 padding)
  const signatureValue = rsaSha256Sign(signedInfoCanonical, keyPem);

  // 4. X509 certificate in DER base64 format
  const x509Base64 = certDerBase64(certPem);

  // 5. Build the complete signed <evento> element
  // In the final XML, infEvento inherits xmlns from <evento> parent,
  // so we strip the explicit declaration. The digest was computed on
  // the canonical form (with xmlns), and the SEFAZ verifier will
  // re-canonicalize (adding xmlns back) before verifying.
  const infEvento = infEventoCanonical.replace(
    ` xmlns="http://www.portalfiscal.inf.br/nfe"`,
    "",
  );

  // SignedInfo inherits xmlns from <Signature> parent
  const signedInfo = signedInfoCanonical.replace(
    ` xmlns="http://www.w3.org/2000/09/xmldsig#"`,
    "",
  );

  return (
    `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    infEvento +
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${x509Base64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>` +
    `</evento>`
  );
}

// ---- Internal helpers ----

function sha256Base64(data: string): string {
  const md = forge.md.sha256.create();
  md.update(data, "utf8");
  return forge.util.encode64(md.digest().bytes());
}

function rsaSha256Sign(data: string, keyPem: string): string {
  const key = forge.pki.privateKeyFromPem(keyPem);
  const md = forge.md.sha256.create();
  md.update(data, "utf8");
  return forge.util.encode64(key.sign(md));
}

function certDerBase64(certPem: string): string {
  // Extract leaf certificate (first in chain)
  const match = certPem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/,
  );
  const leaf = match ? match[0] : certPem;
  const cert = forge.pki.certificateFromPem(leaf);
  const asn1 = forge.pki.certificateToAsn1(cert);
  return forge.util.encode64(forge.asn1.toDer(asn1).bytes());
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
