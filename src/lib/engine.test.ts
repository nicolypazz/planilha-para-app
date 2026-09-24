import { describe, expect, it } from "vitest";
import { computeInstallments, mergePaid, statusOf, quinzenaOf, monthsBetween } from "./engine";

const assai = { nome: "Assai", dia_fechamento: 14, dia_vencimento: 20, utiliza_fechamento: true };
const pix = { nome: "Pix", dia_fechamento: null, dia_vencimento: null, utiliza_fechamento: false };

describe("motor financeiro", () => {
  it("renda fixa: 1 registro no dia do recebimento", () => {
    const r = computeInstallments({ tipo_movimentacao: "Renda", data_recebimento: "2026-09-05", valor_total: 1000, numero_parcelas: 1 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ valor_parcela: 1000, data_vencimento: "2026-09-05", quinzena: "Dia 10" });
  });
  it("despesa à vista (Pix) vence na data da compra", () => {
    const r = computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-09-18", valor_total: 40, numero_parcelas: 1 }, pix);
    expect(r[0]!.data_vencimento).toBe("2026-09-18");
  });
  it("compra antes/no fechamento entra na fatura do mês", () => {
    expect(computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-09-14", valor_total: 60, numero_parcelas: 1 }, assai)[0]!.data_vencimento).toBe("2026-09-20");
  });
  it("compra depois do fechamento vai para o mês seguinte", () => {
    expect(computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-09-15", valor_total: 20, numero_parcelas: 1 }, assai)[0]!.data_vencimento).toBe("2026-10-20");
  });
  it("exemplo da especificação: R$1.200 no Assai em 10/09 em 4x", () => {
    const r = computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-09-10", valor_total: 1200, numero_parcelas: 4 }, assai);
    expect(r.map((x) => x.data_vencimento)).toEqual(["2026-09-20", "2026-10-20", "2026-11-20", "2026-12-20"]);
    expect(r.every((x) => x.valor_parcela === 300)).toBe(true);
  });
  it("parcelado atravessando o ano e sem duplicar o total", () => {
    const r = computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-11-20", valor_total: 1500, numero_parcelas: 5 }, assai);
    expect(r.map((x) => x.mes_vencimento)).toEqual(["2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    expect(r.reduce((s, x) => s + x.valor_parcela, 0)).toBe(1500);
    expect(r[0]!.valor_parcela).toBe(300);
  });
  it("centavos restantes vão para a última parcela", () => {
    const r = computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-09-01", valor_total: 100, numero_parcelas: 3 }, pix);
    expect(r.map((x) => x.valor_parcela)).toEqual([33.33, 33.33, 33.34]);
  });
  it("vencimento dia 31 em mês curto usa o último dia", () => {
    const r = computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-01-05", valor_total: 100, numero_parcelas: 2 }, { ...assai, dia_fechamento: 1, dia_vencimento: 31 });
    expect(r.map((x) => x.data_vencimento)).toEqual(["2026-02-28", "2026-03-31"]);
  });
  it("status: pago manual, atrasado e pendente", () => {
    expect(statusOf({ pago: true, data_vencimento: "2020-01-01" }, "Custo", "2026-09-24")).toBe("Pago");
    expect(statusOf({ pago: false, data_vencimento: "2026-09-20" }, "Custo", "2026-09-24")).toBe("Atrasado");
    expect(statusOf({ pago: false, data_vencimento: "2026-09-24" }, "Custo", "2026-09-24")).toBe("Pendente");
  });
  it("quinzena", () => { expect(quinzenaOf("2026-09-15")).toBe("Dia 10"); expect(quinzenaOf("2026-09-16")).toBe("Dia 20"); });
  it("recalcular preserva parcelas pagas", () => {
    const calc = computeInstallments({ tipo_movimentacao: "Custo", data_compra: "2026-09-10", valor_total: 300, numero_parcelas: 3 }, assai);
    const m = mergePaid(calc, [{ numero_parcela: 2, pago: true, data_pagamento: "2026-10-18" }]);
    expect(m.map((x) => x.pago)).toEqual([false, true, false]);
  });
  it("meses entre", () => { expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]); });
});
