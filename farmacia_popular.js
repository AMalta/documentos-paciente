/* FARMÁCIA POPULAR (04/10/2026): marca na receita o remédio que sai DE
   GRAÇA no programa "Aqui Tem Farmácia Popular" (receita + documento com
   foto + CPF). Lista oficial de fevereiro de 2025 (todos os itens viraram
   gratuitos), embutida no app: vale sem internet e não manda a receita a
   ninguém. Casa pelo princípio ativo SEM ACENTO e pela dose: se a receita
   diz a dose e ela não é a do programa (losartana 100 mg), não marca. Nome
   comercial (Glifage, Aradois…) não casa — só o princípio ativo.
   Lista mudou? Só esta tabela muda. */
(function () {
  const LISTA_DE = "fev/2025";
  // [palavras que precisam estar no texto, doses do programa, como mostrar]
  const L = [
    [["atenolol"], ["25mg"], "atenolol 25 mg"],
    [["anlodipino"], ["5mg"], "anlodipino 5 mg"],
    [["captopril"], ["25mg"], "captopril 25 mg"],
    [["propranolol"], ["40mg"], "propranolol 40 mg"],
    [["hidroclorotiazida"], ["25mg"], "hidroclorotiazida 25 mg"],
    [["losartana"], ["50mg"], "losartana 50 mg"],
    [["enalapril"], ["10mg"], "enalapril 10 mg"],
    [["espironolactona"], ["25mg"], "espironolactona 25 mg"],
    [["furosemida"], ["40mg"], "furosemida 40 mg"],
    [["metoprolol"], ["25mg"], "succinato de metoprolol 25 mg"],
    [["metformina"], ["500mg", "850mg"], "metformina 500 ou 850 mg"],
    [["glibenclamida"], ["5mg"], "glibenclamida 5 mg"],
    [["insulina", "nph"], [], "insulina NPH"],
    [["insulina", "regular"], [], "insulina regular"],
    [["dapagliflozina"], ["10mg"], "dapagliflozina 10 mg"],
    [["ipratropio"], ["0.02mg", "0.25mg", "20mcg", "250mcg"], "brometo de ipratrópio"],
    [["beclometasona"], ["50mcg", "200mcg", "250mcg"], "beclometasona 50, 200 ou 250 mcg"],
    [["salbutamol"], ["100mcg", "5mg"], "salbutamol 100 mcg ou 5 mg"],
    [["budesonida"], ["32mcg", "50mcg"], "budesonida 32 ou 50 mcg"],
    [["alendronato"], ["70mg"], "alendronato 70 mg"],
    [["carbidopa", "levodopa"], ["25mg", "250mg"], "carbidopa + levodopa 25/250 mg"],
    [["benserazida", "levodopa"], ["25mg", "100mg"], "benserazida + levodopa 25/100 mg"],
    [["sinvastatina"], ["10mg", "20mg", "40mg"], "sinvastatina 10, 20 ou 40 mg"],
    [["timolol"], ["0.25%", "0.5%", "2.5mg", "5mg"], "timolol 0,25% ou 0,5%"],
    [["etinilestradiol", "levonorgestrel"], ["0.03mg", "0.15mg"], "etinilestradiol + levonorgestrel"],
    [["medroxiprogesterona"], ["150mg"], "medroxiprogesterona 150 mg"],
    [["estradiol", "noretisterona"], ["5mg", "50mg"], "estradiol + noretisterona (injetável)"],
    [["noretisterona"], ["0.35mg"], "noretisterona 0,35 mg"],
  ];

  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  // "50 mg", "0,25%", "100 µg" → "50mg", "0.25%", "100mcg"
  function doses(t) {
    const r = new Set();
    for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|%)/g)) {
      r.add(String(parseFloat(m[1].replace(",", "."))) + (m[2] === "µg" || m[2] === "ug" ? "mcg" : m[2]));
    }
    return r;
  }

  // Um remédio (uma linha da receita) → o item do programa, ou null.
  function casa(texto) {
    const t = norm(texto);
    const ds = doses(t);
    for (const [palavras, dosesProg, nome] of L) {
      if (!palavras.every((p) => t.includes(p))) continue;
      // estradiol + noretisterona não pode casar com a pílula de noretisterona só
      if (nome.startsWith("noretisterona") && t.includes("estradiol")) continue;
      if (ds.size && dosesProg.length && !dosesProg.some((d) => ds.has(d))) continue;
      return nome;
    }
    return null;
  }

  // Várias linhas (receita em texto livre) → os itens achados, sem repetir.
  function casaTexto(texto) {
    const r = [];
    for (const l of String(texto || "").split(/\n+/)) {
      const n = casa(l);
      const curto = n && n.replace(/ \d.*$/, "");   // "sinvastatina 10, 20 ou 40 mg" → "sinvastatina"
      if (curto && !r.includes(curto)) r.push(curto);
    }
    return r;
  }

  window.FarmaciaPopular = { casa, casaTexto, LISTA_DE };
})();
