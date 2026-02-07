import { describe, it, expect } from 'vitest';
import { parseOfxExtrato } from '@/lib/extratoImport/ofx';

describe('parseOfxExtrato', () => {
  it('deriva saldo_apos_lancamento por linha quando LEDGERBAL existir', () => {
    const ofx = `
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20250101120000</DTPOSTED>
            <TRNAMT>100.00</TRNAMT>
            <FITID>1</FITID>
            <NAME>DEP</NAME>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20250102120000</DTPOSTED>
            <TRNAMT>-30.00</TRNAMT>
            <FITID>2</FITID>
            <NAME>PAG</NAME>
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>70.00</BALAMT>
          <DTASOF>20250102</DTASOF>
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
    `.trim();

    const itens = parseOfxExtrato(ofx);
    expect(itens).toHaveLength(2);

    // ordem do arquivo preservada
    expect(itens[0].sequencia_importacao).toBe(1);
    expect(itens[1].sequencia_importacao).toBe(2);

    // saldo após cada lançamento (espelho do saldo final + reverso dos deltas)
    expect(itens[1].saldo_apos_lancamento).toBe(70);
    expect(itens[0].saldo_apos_lancamento).toBe(100);
  });

  it('não preenche saldo_apos_lancamento quando não houver saldo final no arquivo', () => {
    const ofx = `
<OFX>
  <BANKTRANLIST>
    <STMTTRN>
      <TRNTYPE>CREDIT</TRNTYPE>
      <DTPOSTED>20250101</DTPOSTED>
      <TRNAMT>10.00</TRNAMT>
      <FITID>1</FITID>
      <NAME>DEP</NAME>
    </STMTTRN>
  </BANKTRANLIST>
</OFX>
    `.trim();

    const itens = parseOfxExtrato(ofx);
    expect(itens).toHaveLength(1);
    expect(itens[0].saldo_apos_lancamento).toBeUndefined();
  });
});
