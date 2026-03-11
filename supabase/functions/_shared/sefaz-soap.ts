/**
 * SEFAZ SOAP helpers for DistribuiçãoDFe and RecepcaoEvento.
 */

// ============================================================
// SEFAZ Endpoints
// ============================================================
export const SEFAZ_ENDPOINTS = {
  distribuicao: {
    producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  },
  recepcaoEvento: {
    producao: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
    homologacao: "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  },
} as const;

export type Ambiente = "producao" | "homologacao";

// UF → cUF code mapping (IBGE)
const UF_CODES: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23",
  DF: "53", ES: "32", GO: "52", MA: "21", MT: "51", MS: "50",
  MG: "31", PA: "15", PB: "25", PR: "41", PE: "26", PI: "22",
  RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42",
  SP: "35", SE: "28", TO: "17",
};

export function ufToCode(uf: string): string {
  const code = UF_CODES[uf.toUpperCase()];
  if (!code) throw new Error(`UF_INVALID: ${uf}`);
  return code;
}

// ============================================================
// SOAP Envelopes
// ============================================================

/**
 * Build DistribuiçãoDFe SOAP envelope (distNSU query).
 */
export function buildDistNSUSoap(params: {
  ambiente: "1" | "2"; // 1=producao, 2=homologacao
  cUF: string;
  cnpj: string;
  ultNSU: number;
}): string {
  const nsu = String(params.ultNSU).padStart(15, "0");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${params.ambiente}</tpAmb>
          <cUFAutor>${params.cUF}</cUFAutor>
          <CNPJ>${params.cnpj}</CNPJ>
          <distNSU>
            <ultNSU>${nsu}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

/**
 * Build DistribuiçãoDFe SOAP envelope for a specific chave (consChNFe).
 */
export function buildConsChNFeSoap(params: {
  ambiente: "1" | "2";
  cUF: string;
  cnpj: string;
  chNFe: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${params.ambiente}</tpAmb>
          <cUFAutor>${params.cUF}</cUFAutor>
          <CNPJ>${params.cnpj}</CNPJ>
          <consChNFe>
            <chNFe>${params.chNFe}</chNFe>
          </consChNFe>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

// ============================================================
// docZip decompression (base64 → gzip → XML)
// ============================================================

/**
 * Decompress a SEFAZ docZip entry.
 * SEFAZ returns: base64(gzip(XML))
 */
export async function decompressDocZip(base64Content: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));

  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  // Write compressed data and close
  writer.write(bytes);
  writer.close();

  // Read decompressed
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  // Concat and decode
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder("utf-8").decode(result);
}

// ============================================================
// XML parsing helpers (lightweight, no DOM parser needed)
// ============================================================

/**
 * Extract a text value between XML tags. Simple regex-based for known SEFAZ responses.
 */
export function xmlTagValue(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Extract all occurrences of a self-closing or paired tag.
 */
export function xmlTagAll(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

/**
 * Extract attribute value from XML tag.
 */
export function xmlAttr(xml: string, tagName: string, attrName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*\\s${attrName}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

// ============================================================
// Response parsing
// ============================================================

export type DistDFeDoc = {
  schema: string;    // "resNFe" | "procNFe" | "resEvento" | string
  nsu: number;
  xml: string;       // decompressed XML
};

export type DistDFeResponse = {
  cStat: string;     // "137"=has docs, "138"=no docs
  xMotivo: string;
  ultNSU: number;
  maxNSU: number;
  docs: DistDFeDoc[];
};

/**
 * Parse the SEFAZ DistribuiçãoDFe response.
 */
export async function parseDistDFeResponse(responseXml: string): Promise<DistDFeResponse> {
  // Extract retDistDFeInt content
  const cStat = xmlTagValue(responseXml, "cStat") || "";
  const xMotivo = xmlTagValue(responseXml, "xMotivo") || "";
  const ultNSU = parseInt(xmlTagValue(responseXml, "ultNSU") || "0", 10);
  const maxNSU = parseInt(xmlTagValue(responseXml, "maxNSU") || "0", 10);

  // Extract docZip entries
  const docs: DistDFeDoc[] = [];
  const docZipBlocks = xmlTagAll(responseXml, "docZip");

  for (const block of docZipBlocks) {
    // Get NSU attribute from the docZip tag
    const nsuMatch = responseXml.match(new RegExp(`<docZip[^>]*NSU="(\\d+)"[^>]*>${escapeRegex(block)}`, "i"));
    const nsu = nsuMatch ? parseInt(nsuMatch[1], 10) : 0;

    // Get schema attribute
    const schemaMatch = responseXml.match(new RegExp(`<docZip[^>]*schema="([^"]*)"[^>]*>${escapeRegex(block)}`, "i"));
    const schema = schemaMatch ? schemaMatch[1] : "unknown";

    try {
      const xml = await decompressDocZip(block.trim());
      docs.push({ schema, nsu, xml });
    } catch (err) {
      console.warn(`[sefaz-soap] Failed to decompress docZip NSU=${nsu}:`, err);
    }
  }

  return { cStat, xMotivo, ultNSU, maxNSU, docs };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// RecepcaoEvento SOAP
// ============================================================

/** Event type descriptions (ASCII, no accents — SEFAZ requirement) */
export const EVENT_DESCRIPTIONS: Record<string, string> = {
  "210210": "Ciencia da Operacao",
  "210200": "Confirmacao da Operacao",
  "210220": "Desconhecimento da Operacao",
  "210240": "Operacao nao Realizada",
};

/** Map tpEvento → local status value */
export const EVENT_TO_STATUS: Record<string, string> = {
  "210210": "ciencia",
  "210200": "confirmada",
  "210220": "desconhecida",
  "210240": "nao_realizada",
};

/**
 * Build RecepcaoEvento SOAP envelope containing pre-signed eventos.
 */
export function buildRecepcaoEventoSoap(params: {
  signedEventos: string[];
  idLote: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <nfeDadosMsg>
        <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
          <idLote>${params.idLote}</idLote>
          ${params.signedEventos.join("")}
        </envEvento>
      </nfeDadosMsg>
    </nfeRecepcaoEvento>
  </soap12:Body>
</soap12:Envelope>`;
}

export type RecepcaoEventoResult = {
  chNFe: string;
  tpEvento: string;
  cStat: string;
  xMotivo: string;
  nProt: string | null;
  dhRegEvento: string | null;
};

export type RecepcaoEventoResponse = {
  cStat: string;   // lote-level: "128" = processed
  xMotivo: string;
  results: RecepcaoEventoResult[];
};

/**
 * Parse SEFAZ RecepcaoEvento response XML.
 */
export function parseRecepcaoEventoResponse(responseXml: string): RecepcaoEventoResponse {
  // Lote-level status (first cStat in document, before any retEvento)
  const cStat = xmlTagValue(responseXml, "cStat") || "";
  const xMotivo = xmlTagValue(responseXml, "xMotivo") || "";

  const results: RecepcaoEventoResult[] = [];
  const retEventos = xmlTagAll(responseXml, "retEvento");

  for (const retEvento of retEventos) {
    results.push({
      chNFe: xmlTagValue(retEvento, "chNFe") || "",
      tpEvento: xmlTagValue(retEvento, "tpEvento") || "",
      cStat: xmlTagValue(retEvento, "cStat") || "",
      xMotivo: xmlTagValue(retEvento, "xMotivo") || "",
      nProt: xmlTagValue(retEvento, "nProt"),
      dhRegEvento: xmlTagValue(retEvento, "dhRegEvento"),
    });
  }

  return { cStat, xMotivo, results };
}

/**
 * Get current datetime in Brazil/Brasília timezone (UTC-3) in ISO format.
 * Format: "2026-03-11T14:30:00-03:00"
 */
export function brazilIsoNow(): string {
  const now = new Date();
  const brTime = new Date(now.getTime() - 3 * 3600_000);
  return brTime.toISOString().slice(0, 19) + "-03:00";
}

// ============================================================
// resNFe XML → structured data
// ============================================================

export type ResNFeData = {
  chaveAcesso: string;
  cnpjEmitente: string;
  nomeEmitente: string | null;
  ieEmitente: string | null;
  dataEmissao: string;      // ISO
  tipoNfe: number | null;
  valorNf: number;
  protocolo: string | null;
  situacaoNfe: number | null;
};

/**
 * Parse a resNFe or procNFe XML into structured data.
 */
export function parseResNFe(xml: string): ResNFeData | null {
  const chNFe = xmlTagValue(xml, "chNFe");
  if (!chNFe) return null;

  const cnpj = xmlTagValue(xml, "CNPJ") || "";
  const xNome = xmlTagValue(xml, "xNome");
  const IE = xmlTagValue(xml, "IE");
  const dhEmi = xmlTagValue(xml, "dhEmi");
  const tpNF = xmlTagValue(xml, "tpNF");
  const vNF = xmlTagValue(xml, "vNF");
  const nProt = xmlTagValue(xml, "nProt");
  const cSitNFe = xmlTagValue(xml, "cSitNFe");

  return {
    chaveAcesso: chNFe,
    cnpjEmitente: cnpj,
    nomeEmitente: xNome,
    ieEmitente: IE,
    dataEmissao: dhEmi || new Date().toISOString(),
    tipoNfe: tpNF !== null ? parseInt(tpNF, 10) : null,
    valorNf: parseFloat(vNF || "0"),
    protocolo: nProt,
    situacaoNfe: cSitNFe !== null ? parseInt(cSitNFe, 10) : null,
  };
}
