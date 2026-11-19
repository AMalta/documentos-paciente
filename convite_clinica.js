/* ═══ ✉️ Convite da clínica pelo link (sql/036, Fase P2, 18/11/2026) ═════
   A clínica que usa só o indiDoc (sem médico no Indiclin) não tem o código
   do "Mostrar ao médico" para começar a enviar. A recepção manda pelo
   WhatsApp o link <app>/?cv=CÓDIGO. Aqui:
     1. ao abrir, o código sai do endereço e fica guardado no aparelho
        ("convite-clinica"), até a pessoa entrar na conta e aceitar o termo;
     2. na próxima pergunta do app (perguntarAutorizacoes), o convite é
        mostrado: "Receber no acervo de <pessoa>?" — com mais de uma pessoa
        na conta, começa por quem tem o primeiro nome do convite;
     3. aceito, nasce o recebimento (documentos + conversa com a clínica) e a
        clínica fica sabendo, pela emitir-acesso, qual pessoa é o paciente.
   Código inválido, vencido ou já usado: avisa uma vez e esquece.        */
(function () {
  const CHAVE = "convite-clinica";
  const VALIDADE_MS = 30 * 86400000;

  function codigoValido(c) { return /^[A-Za-z0-9_-]{20,64}$/.test(String(c || "")); }

  function semAcento(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  // Ordem das pessoas a perguntar: quem tem o primeiro nome do convite,
  // depois a pessoa aberta, depois as outras. Pura.
  function ordemPessoas(lista, primeiro, ativa) {
    const p = semAcento(primeiro);
    const nome1 = (x) => semAcento(String((x && x.nome) || "").split(" ")[0]);
    const todas = (lista || []).slice();
    const peso = (x) => (p && nome1(x) === p ? 0 : (x.id === ativa ? 1 : 2));
    return todas.sort((a, b) => peso(a) - peso(b));
  }

  function guardar(codigo, agora) {
    try { localStorage.setItem(CHAVE, JSON.stringify({ c: codigo, em: agora || Date.now() })); } catch (e) {}
  }
  function lido(agora) {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (v && codigoValido(v.c) && (agora || Date.now()) - Number(v.em || 0) < VALIDADE_MS) return v.c;
    } catch (e) {}
    return "";
  }
  function esquecer() { try { localStorage.removeItem(CHAVE); } catch (e) {} }

  window.ConviteClinicaNucleo = { codigoValido, ordemPessoas, semAcento, CHAVE };

  // Chegou pelo link? Guarda e tira do endereço (não fica no histórico).
  (function chegada() {
    let cv = "";
    try { cv = new URLSearchParams(location.search).get("cv") || ""; } catch (e) { return; }
    if (!codigoValido(cv)) return;
    guardar(cv);
    try {
      const u = new URL(location.href); u.searchParams.delete("cv");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  })();

  let perguntando = false;

  // Chamada pelo app.js (perguntarAutorizacoes), já com conta e termo.
  async function perguntar(ctx) {
    const codigo = lido();
    if (!codigo || perguntando || !ctx || !ctx.sb) return;
    perguntando = true;
    try {
      const { data, error } = await ctx.sb.rpc("ver_convite_clinica", { p_codigo: codigo });
      if (error) {
        if (/ver_convite_clinica|does not exist/i.test(error.message)) return;   // sem o 036: espera
        console.warn("[convite]", error.message);
        return;
      }
      const conv = (data || [])[0];
      if (!conv) {
        esquecer();
        ctx.aviso("Este convite da clínica venceu ou já foi usado. Peça outro à recepção.", "erro");
        return;
      }
      const clinica = conv.clinica_nome || "A clínica";
      const lista = ordemPessoas(ctx.pessoas || [], conv.primeiro_nome, ctx.pessoaAtiva);
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i], ultima = i === lista.length - 1;
        const deQuem = (ctx.pessoas || []).length > 1 ? " de " + ctx.nomeDaPessoa(p) : "";
        const sim = await ctx.confirmarModal(
          `${clinica} convidou ${conv.primeiro_nome ? conv.primeiro_nome + " " : "você "}para receber os `
          + `documentos pelo indiDoc.` + ctx.LINHA + ctx.LINHA
          + `Receber no indiDoc${deQuem} os documentos e as mensagens de ${clinica}?` + ctx.LINHA + ctx.LINHA
          + "Você cancela quando quiser, em 🩺 Mostrar ao médico.",
          { titulo: "Convite da clínica", textoConfirmar: "Receber",
            textoCancelar: ultima ? "Agora não" : `Não é ${ctx.nomeDaPessoa(p)}` });
        if (!sim) continue;
        const r = await ctx.sb.rpc("aceitar_convite_clinica", { p_codigo: codigo, p_pessoa: p.id });
        if (r.error) {
          if (/CONVITE_INVALIDO/.test(r.error.message)) {
            esquecer();
            ctx.aviso("Este convite da clínica venceu ou já foi usado. Peça outro à recepção.", "erro");
          } else {
            console.warn("[convite]", r.error.message);
            ctx.aviso("Não consegui aceitar agora. O convite volta depois.", "erro");
          }
          return;
        }
        esquecer();
        ctx.aviso(`${clinica} passa a enviar documentos para cá. Para falar com a clínica, use 💬.`, "ok");
        if (ctx.ativarAvisos) await ctx.ativarAvisos();
        return;
      }
      esquecer();   // "Agora não": a recepção manda outro convite se precisar
    } finally {
      perguntando = false;
    }
  }

  window.ConviteClinica = { perguntar };
})();
