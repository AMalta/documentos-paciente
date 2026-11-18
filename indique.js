/* ═══════════════════════════════════════════════════════════════════════
   🤝 INDIQUE O INDIDOC (sql/034, 18/11/2026 — pedido do usuário: "quero o
   5"; decisão: +5 ⭐ por amigo, até 10 amigos por mês, e a conquista 🥉🥈🥇).

   • Cada celular tem um CÓDIGO de quem indica (8 letras/números) e um id de
     APARELHO (16), sorteados aqui e guardados no aparelho.
   • O link é <app>/?ind=CÓDIGO. Um aparelho NOVO (nunca abriu o indiDoc)
     que abre por ele conta 1 indicação para o código (registrar_indicacao —
     uma vez por aparelho, nunca a do próprio código).
   • Quem indicou, ao abrir os jogos, recebe +5 ⭐ por indicação nova do mês
     (no máximo 10 por mês) e sobe na conquista "Indique o indiDoc".
   • Tela própria no menu dos jogos (Jogos.registrarTela "indique"): quantos
     amigos vieram, convite pelo WhatsApp e copiar o link.

   Núcleo puro em window.IndiqueNucleo (testes/testar_diario.js).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const POR_AMIGO = 5, MAX_MES = 10;
  const ALFA = "abcdefghijkmnpqrstuvwxyz23456789";
  const sortear = (n, rnd) => Array.from({ length: n }, () => ALFA[Math.floor((rnd || Math.random)() * ALFA.length)]).join("");
  const codigoValido = (c) => /^[a-z0-9]{8}$/.test(String(c || ""));
  // Quantas estrelas dar agora: as do mês (até MAX_MES) que ainda não foram dadas
  function estrelasAGanhar(noMes, jaDadasNoMes) {
    const devidas = Math.min(Math.max(noMes | 0, 0), MAX_MES);
    return Math.max(0, devidas - Math.max(jaDadasNoMes | 0, 0)) * POR_AMIGO;
  }
  const mesAtual = (d) => (d || new Date()).toISOString().slice(0, 7);
  function linkConvite(base, codigo) {
    return `${String(base || "").replace(/[?#].*$/, "")}?ind=${codigo}`;
  }
  window.IndiqueNucleo = { POR_AMIGO, MAX_MES, sortear, codigoValido, estrelasAGanhar, mesAtual, linkConvite };

  if (typeof document === "undefined" || typeof localStorage === "undefined") return;
  const K_COD = "indidoc-codigo", K_APAR = "indidoc-aparelho", K_VISTO = "indidoc-visto", K_INDICADO = "indidoc-indicado-por";
  const ler = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const pôr = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const jaVisto = !!ler(K_VISTO);            // antes desta abertura o aparelho já usava o indiDoc?
  pôr(K_VISTO, "1");
  function meuCodigo() { let c = ler(K_COD); if (!codigoValido(c)) { c = sortear(8); pôr(K_COD, c); } return c; }
  function aparelho() { let a = ler(K_APAR); if (!/^[a-z0-9]{16}$/.test(a)) { a = sortear(16); pôr(K_APAR, a); } return a; }
  const cliente = () => (typeof sb !== "undefined" && sb ? sb : null);

  // Chegou por um convite? (só aparelho novo conta)
  (async function chegada() {
    let ind = "";
    try { ind = (new URLSearchParams(location.search).get("ind") || "").toLowerCase(); } catch (e) {}
    if (!codigoValido(ind)) return;
    try {
      const u = new URL(location.href); u.searchParams.delete("ind");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) {}
    if (jaVisto || ler(K_INDICADO)) return;
    pôr(K_INDICADO, ind);
    for (let i = 0; i < 20 && !cliente(); i++) await new Promise((r) => setTimeout(r, 300));
    try { if (cliente()) await cliente().rpc("registrar_indicacao", { p_codigo: ind, p_dispositivo: aparelho(), p_meu_codigo: meuCodigo() }); } catch (e) {}
  })();

  // Quem indicou: credita as estrelas novas e a conquista (ao abrir os jogos)
  async function conferir() {
    const J = window.Jogos, N = window.JogosNucleo;
    if (!J || !J.kit || !cliente()) return null;
    try {
      const { data, error } = await cliente().rpc("indicacoes_do_codigo", { p_codigo: meuCodigo() });
      if (error) return null;
      const linha = (data || [])[0] || { total: 0, no_mes: 0 };
      const d = J.kit.ler(); d.indique = d.indique || {};
      const mes = mesAtual();
      if (d.indique.mes !== mes) { d.indique.mes = mes; d.indique.dadas = 0; }
      const est = estrelasAGanhar(linha.no_mes, d.indique.dadas);
      d.indique.dadas = Math.min(linha.no_mes, MAX_MES);
      d.totais = d.totais || {}; d.totais.indique = linha.total;
      // conquista: sobe pelo total
      let novaConq = null;
      const t = N && N.trofeuDe && N.trofeuDe("indique");
      if (t) {
        d.trofeus = d.trofeus || {};
        const antes = d.trofeus.indique || 0, agora = N.nivelTrofeu(t, d).nivel;
        if (agora > antes) { d.trofeus.indique = agora; novaConq = N.NIVEL_TROFEU[agora] + " " + N.NOME_NIVEL[agora]; }
      }
      J.kit.gravar(d);
      if (est) J.kit.ganharEstrelas(est);
      return { total: linha.total, noMes: linha.no_mes, est, novaConq };
    } catch (e) { return null; }
  }

  function tela() {
    const K = window.Jogos.kit, esc = K.esc, p = K.palco;
    const base = location.origin + location.pathname;
    const link = linkConvite(base, meuCodigo());
    const zap = "https://wa.me/?text=" + encodeURIComponent(
      `Uso o indiDoc para guardar meus exames, falar com a clínica e até jogar na sala de espera. Instale também (é grátis): ${link}`);
    p.innerHTML = `<div class="jg-perg">🤝 Indique o indiDoc</div>
      <div class="jg-passo">Mande o convite para família e amigos. Cada pessoa que abrir o indiDoc pela primeira vez pelo seu link vale <b>+${POR_AMIGO} ⭐</b> (até ${MAX_MES} por mês).</div>
      <div class="jg-placar" id="ind-status"><small>Conferindo as suas indicações…</small></div>
      <div class="jg-fim-bts"><a class="jg-seguir jg-zap-forte" target="_blank" rel="noopener" href="${esc(zap)}">📲 Convidar pelo WhatsApp</a>
        <button type="button" class="jg-menu" id="ind-copiar">🔗 Copiar o link</button></div>
      <p class="jg-aviso">Conta quando o amigo abre o indiDoc pela primeira vez no celular dele. Ninguém recebe o seu nome — só o convite.</p>`;
    K.q("ind-copiar").onclick = async () => {
      try { await navigator.clipboard.writeText(link); K.q("ind-copiar").textContent = "✔️ Link copiado"; }
      catch (e) { window.prompt("Copie o link:", link); }
    };
    conferir().then((r) => {
      const c = K.q("ind-status");
      if (!c) return;
      if (!r) { c.innerHTML = `<small>Não consegui conferir agora (sem internet?). Os convites continuam valendo.</small>`; return; }
      c.innerHTML = `<div class="jg-placar-t">${r.total ? `${r.total} ${r.total === 1 ? "amigo veio" : "amigos vieram"} pelo seu convite 🎉` : "Ninguém ainda — mande o primeiro convite!"}</div>
        <small>Neste mês: ${r.noMes} de ${MAX_MES} que valem estrelas.${r.est ? ` <b>+${r.est} ⭐ agora!</b>` : ""}${r.novaConq ? ` Conquista nova: <b>${esc(r.novaConq)}</b>!` : ""}</small>`;
    });
  }

  function registrar() {
    if (!window.Jogos || !window.Jogos.registrarTela) return;
    window.Jogos.registrarTela("indique", tela);
    window.Indique = { conferir, meuCodigo };
  }
  registrar();
})();
